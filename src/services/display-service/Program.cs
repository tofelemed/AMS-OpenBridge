using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json;
using Traverse.DisplayService.Data;
using Traverse.DisplayService.Models;

var builder = WebApplication.CreateBuilder(args);

// ── Database ────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("TraverseDisplays") 
    ?? "Host=postgres;Database=traverse_displays;Username=postgres;Password=postgres";

builder.Services.AddDbContext<DisplayDbContext>(options => 
    options.UseNpgsql(connectionString));

// ── Redis (for cache invalidation) ──────────────────────────────────────────
var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

var app = builder.Build();

// ── GET /health ─────────────────────────────────────────────────────────────
app.MapGet("/health", async (DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var checks = new Dictionary<string, object>();
    var dbStatus = "Healthy";
    var redisStatus = "Healthy";

    try
    {
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        checks["database"] = new { status = "Healthy", description = "PostgreSQL OK" };
    }
    catch (Exception ex)
    {
        dbStatus = "Unhealthy";
        checks["database"] = new { status = "Unhealthy", description = ex.Message };
    }

    try
    {
        var dbRedis = redis.GetDatabase();
        var latency = await dbRedis.PingAsync();
        checks["redis"] = new { status = "Healthy", description = $"PING {latency.TotalMilliseconds:F1} ms" };
    }
    catch (Exception ex)
    {
        redisStatus = "Unhealthy";
        checks["redis"] = new { status = "Unhealthy", description = ex.Message };
    }

    var overall = dbStatus == "Healthy" && redisStatus == "Healthy" ? "Healthy" : "Degraded";
    return overall == "Healthy"
        ? Results.Json(new { status = overall, checks })
        : Results.Json(new { status = overall, checks }, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// ══════════════════════════════════════════════════════════════════════════════
// Display CRUD Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /displays ────────────────────────────────────────────────────────────
// List displays with optional filtering.
app.MapGet("/displays", async (
    DisplayDbContext db,
    string? category,
    string? hierarchyPath,
    string? ownerId,
    string? search,
    int skip = 0,
    int take = 50) =>
{
    var query = db.Displays.Where(d => !d.IsDeleted);
    
    if (!string.IsNullOrWhiteSpace(category))
        query = query.Where(d => d.Category == category);
    
    if (!string.IsNullOrWhiteSpace(hierarchyPath))
        query = query.Where(d => d.HierarchyPath != null && d.HierarchyPath.StartsWith(hierarchyPath));
    
    if (!string.IsNullOrWhiteSpace(ownerId))
        query = query.Where(d => d.OwnerId == ownerId);
    
    if (!string.IsNullOrWhiteSpace(search))
        query = query.Where(d => d.Name.Contains(search) || (d.Description != null && d.Description.Contains(search)));
    
    var total = await query.CountAsync();
    var displays = await query
        .OrderBy(d => d.HierarchyPath)
        .ThenBy(d => d.Name)
        .Skip(skip)
        .Take(Math.Min(take, 200))
        .Select(d => new DisplayListDto(
            d.Id, d.Name, d.Category, d.Description, d.HierarchyPath,
            d.Width, d.Height, d.PublishedVersion, d.DraftVersion,
            d.OwnerId, d.CreatedAt, d.UpdatedAt))
        .ToListAsync();
    
    return Results.Ok(new { total, skip, take = displays.Count, displays });
});

// ── GET /displays/{id} ───────────────────────────────────────────────────────
// Get display metadata (without version content).
app.MapGet("/displays/{id:guid}", async (Guid id, DisplayDbContext db) =>
{
    var display = await db.Displays
        .Include(d => d.Versions.OrderByDescending(v => v.Version).Take(5))
        .FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    
    if (display is null) return Results.NotFound();
    
    return Results.Ok(new DisplayDetailDto(
        display.Id, display.Name, display.Category, display.Description,
        display.HierarchyPath, display.Width, display.Height, display.BackgroundColor,
        display.PublishedVersion, display.DraftVersion, display.OwnerId,
        display.CreatedAt, display.UpdatedAt,
        display.Versions.Select(v => new VersionSummaryDto(
            v.Id, v.Version, v.Status, v.ChangeNote, v.CreatedBy, v.CreatedAt)).ToList()));
});

// ── GET /displays/{id}/content ───────────────────────────────────────────────
// Get display content (snapshot) for a specific version.
// Query params: version (optional, defaults to latest draft)
app.MapGet("/displays/{id:guid}/content", async (Guid id, int? version, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    
    var targetVersion = version ?? display.DraftVersion;
    
    var displayVersion = await db.DisplayVersions
        .FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == targetVersion);
    
    if (displayVersion is null)
        return Results.NotFound($"Version {targetVersion} not found");
    
    return Results.Ok(new
    {
        displayId = display.Id,
        name = display.Name,
        version = displayVersion.Version,
        status = displayVersion.Status,
        width = display.Width,
        height = display.Height,
        backgroundColor = display.BackgroundColor,
        snapshot = displayVersion.Snapshot
    });
});

// ── POST /displays ───────────────────────────────────────────────────────────
// Create a new display.
app.MapPost("/displays", async (CreateDisplayRequest request, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest("name is required");
    
    var display = new Display
    {
        Id = Guid.NewGuid(),
        Name = request.Name,
        Category = request.Category ?? "overview",
        Description = request.Description,
        HierarchyPath = request.HierarchyPath,
        Width = request.Width ?? 1920,
        Height = request.Height ?? 1080,
        BackgroundColor = request.BackgroundColor ?? "#1e1e1e",
        DraftVersion = 1,
        OwnerId = request.OwnerId ?? "system",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    
    // Create initial version with empty canvas
    var initialSnapshot = JsonDocument.Parse(JsonSerializer.Serialize(new
    {
        items = Array.Empty<object>(),
        metadata = new { createdAt = DateTimeOffset.UtcNow }
    }));
    
    var initialVersion = new DisplayVersion
    {
        Id = Guid.NewGuid(),
        DisplayId = display.Id,
        Version = 1,
        Snapshot = initialSnapshot,
        Status = "draft",
        ChangeNote = "Initial creation",
        CreatedBy = request.OwnerId ?? "system",
        CreatedAt = DateTimeOffset.UtcNow
    };
    
    display.Versions.Add(initialVersion);
    db.Displays.Add(display);
    await db.SaveChangesAsync();
    
    await PublishDisplayEvent(redis, "display.created", display.Id, display.Name);
    
    return Results.Created($"/displays/{display.Id}", new
    {
        id = display.Id,
        name = display.Name,
        category = display.Category,
        draftVersion = display.DraftVersion
    });
});

// ── PUT /displays/{id} ───────────────────────────────────────────────────────
// Update display metadata (not content).
app.MapPut("/displays/{id:guid}", async (Guid id, UpdateDisplayRequest request, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    
    if (request.Name is not null) display.Name = request.Name;
    if (request.Category is not null) display.Category = request.Category;
    if (request.Description is not null) display.Description = request.Description;
    if (request.HierarchyPath is not null) display.HierarchyPath = request.HierarchyPath;
    if (request.Width.HasValue) display.Width = request.Width.Value;
    if (request.Height.HasValue) display.Height = request.Height.Value;
    if (request.BackgroundColor is not null) display.BackgroundColor = request.BackgroundColor;
    
    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    await PublishDisplayEvent(redis, "display.updated", display.Id, display.Name);
    
    return Results.Ok(new { id = display.Id, name = display.Name, updatedAt = display.UpdatedAt });
});

// ── PUT /displays/{id}/content ───────────────────────────────────────────────
// Save display content (creates new draft version).
app.MapPut("/displays/{id:guid}/content", async (Guid id, SaveContentRequest request, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    
    if (request.Snapshot is null)
        return Results.BadRequest("snapshot is required");
    
    // Validate no process values in snapshot
    var snapshotJson = request.Snapshot.RootElement.GetRawText();
    if (snapshotJson.Contains("\"currentValue\"") || snapshotJson.Contains("\"processValue\""))
        return Results.BadRequest("Snapshot must not contain process values (CQRS violation)");
    
    // Increment draft version
    display.DraftVersion++;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    
    var newVersion = new DisplayVersion
    {
        Id = Guid.NewGuid(),
        DisplayId = display.Id,
        Version = display.DraftVersion,
        Snapshot = request.Snapshot,
        Status = "draft",
        ChangeNote = request.ChangeNote,
        CreatedBy = request.UserId ?? "system",
        CreatedAt = DateTimeOffset.UtcNow
    };
    
    db.DisplayVersions.Add(newVersion);
    await db.SaveChangesAsync();
    
    await PublishDisplayEvent(redis, "display.content.saved", display.Id, display.Name);
    
    return Results.Ok(new
    {
        displayId = display.Id,
        version = newVersion.Version,
        status = newVersion.Status,
        savedAt = newVersion.CreatedAt
    });
});

// ── POST /displays/{id}/publish ──────────────────────────────────────────────
// Publish the current draft as the active version.
app.MapPost("/displays/{id:guid}/publish", async (Guid id, PublishRequest request, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    
    var draftVersion = await db.DisplayVersions
        .FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == display.DraftVersion);
    
    if (draftVersion is null)
        return Results.BadRequest("No draft version to publish");
    
    // Archive current published version
    if (display.PublishedVersion.HasValue)
    {
        var currentPublished = await db.DisplayVersions
            .FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == display.PublishedVersion);
        if (currentPublished is not null)
            currentPublished.Status = "archived";
    }
    
    // Publish draft
    draftVersion.Status = "published";
    draftVersion.ChangeNote = request.ChangeNote ?? draftVersion.ChangeNote;
    display.PublishedVersion = draftVersion.Version;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    
    await db.SaveChangesAsync();
    
    await PublishDisplayEvent(redis, "display.published", display.Id, display.Name);
    
    return Results.Ok(new
    {
        displayId = display.Id,
        publishedVersion = display.PublishedVersion,
        publishedAt = DateTimeOffset.UtcNow
    });
});

// ── DELETE /displays/{id} ────────────────────────────────────────────────────
// Soft-delete a display.
app.MapDelete("/displays/{id:guid}", async (Guid id, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    
    display.IsDeleted = true;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    await PublishDisplayEvent(redis, "display.deleted", display.Id, display.Name);
    
    return Results.NoContent();
});

// ══════════════════════════════════════════════════════════════════════════════
// Navigation / Hierarchy Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /displays/hierarchy ──────────────────────────────────────────────────
// Get display hierarchy tree for navigation.
app.MapGet("/displays/hierarchy", async (DisplayDbContext db) =>
{
    var displays = await db.Displays
        .Where(d => !d.IsDeleted && d.HierarchyPath != null)
        .OrderBy(d => d.HierarchyPath)
        .Select(d => new { d.Id, d.Name, d.HierarchyPath, d.Category })
        .ToListAsync();
    
    // Build tree structure from paths
    var tree = new Dictionary<string, object>();
    foreach (var display in displays)
    {
        var parts = display.HierarchyPath!.Split('/');
        var current = tree;
        for (int i = 0; i < parts.Length - 1; i++)
        {
            if (!current.ContainsKey(parts[i]))
                current[parts[i]] = new Dictionary<string, object>();
            current = (Dictionary<string, object>)current[parts[i]];
        }
        if (!current.ContainsKey("_displays"))
            current["_displays"] = new List<object>();
        ((List<object>)current["_displays"]).Add(new
        {
            display.Id,
            display.Name,
            display.Category
        });
    }
    
    return Results.Ok(tree);
});

// ── GET /displays/categories ─────────────────────────────────────────────────
// Get list of display categories with counts.
app.MapGet("/displays/categories", async (DisplayDbContext db) =>
{
    var categories = await db.Displays
        .Where(d => !d.IsDeleted)
        .GroupBy(d => d.Category)
        .Select(g => new { category = g.Key, count = g.Count() })
        .ToListAsync();
    
    return Results.Ok(categories);
});

app.Run();

// ── Helper Functions ─────────────────────────────────────────────────────────
static async Task PublishDisplayEvent(IConnectionMultiplexer redis, string eventType, Guid displayId, string name)
{
    var subscriber = redis.GetSubscriber();
    var payload = JsonSerializer.Serialize(new { eventType, displayId, name, timestamp = DateTimeOffset.UtcNow });
    await subscriber.PublishAsync(RedisChannel.Literal("display-events"), payload);
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
record DisplayListDto(
    Guid Id, string Name, string Category, string? Description, string? HierarchyPath,
    int Width, int Height, int? PublishedVersion, int DraftVersion,
    string OwnerId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

record DisplayDetailDto(
    Guid Id, string Name, string Category, string? Description, string? HierarchyPath,
    int Width, int Height, string BackgroundColor,
    int? PublishedVersion, int DraftVersion, string OwnerId,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    List<VersionSummaryDto> RecentVersions);

record VersionSummaryDto(
    Guid Id, int Version, string Status, string? ChangeNote, string CreatedBy, DateTimeOffset CreatedAt);

record CreateDisplayRequest(
    string Name, string? Category, string? Description, string? HierarchyPath,
    int? Width, int? Height, string? BackgroundColor, string? OwnerId);

record UpdateDisplayRequest(
    string? Name, string? Category, string? Description, string? HierarchyPath,
    int? Width, int? Height, string? BackgroundColor);

record SaveContentRequest(JsonDocument? Snapshot, string? ChangeNote, string? UserId);

record PublishRequest(string? ChangeNote);
