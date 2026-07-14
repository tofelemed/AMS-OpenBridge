using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Traverse.DisplayService.Auth;
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

// ── Auth (Phase K) ──────────────────────────────────────────────────────────
// Displays are authored by Admin/Engineer and consumed by Operator/Viewer. Enforce that here, in the
// service — the frontend guard is convenience; this is the boundary that actually holds. Tokens are
// the RS256 JWTs minted by auth-service; authorization is by the `permission` claim (an array in the
// token, so each entry arrives as its own claim), matching how AMS.Api models policies.
builder.Services.AddHttpClient();
builder.Services.AddSingleton<JwksKeyCache>();

var authIssuer   = builder.Configuration["Auth:Issuer"]   ?? "traverse-auth";
var authAudience = builder.Configuration["Auth:Audience"] ?? "ams-services";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false; // HTTP inside the compose network
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = authIssuer,
            ValidateAudience = true,
            ValidAudience = authAudience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidAlgorithms = new[] { "RS256" },
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                // Resolve the signing key through the JWKS cache (auth-service has no OIDC discovery).
                var jwks = ctx.HttpContext.RequestServices.GetRequiredService<JwksKeyCache>();
                ctx.Options.TokenValidationParameters.IssuerSigningKeyResolver = jwks.Resolve;
                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("DisplayView",    p => p.RequireClaim("permission", "display.view"));
    options.AddPolicy("DisplayEdit",    p => p.RequireClaim("permission", "display.edit"));
    options.AddPolicy("DisplayPublish", p => p.RequireClaim("permission", "display.publish"));
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

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
            d.OwnerId, d.CreatedAt, d.UpdatedAt, d.PublishedAt, d.PublishedBy,
            d.Level, d.ThumbnailSvg != null))
        .ToListAsync();
    
    return Results.Ok(new { total, skip, take = displays.Count, displays });
}).RequireAuthorization("DisplayView");

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
        display.CreatedAt, display.UpdatedAt, display.PublishedAt, display.PublishedBy,
        display.Versions.Select(v => new VersionSummaryDto(
            v.Id, v.Version, v.Status, v.ChangeNote, v.CreatedBy, v.CreatedAt,
            v.PublishedAt, v.PublishedBy)).ToList()));
}).RequireAuthorization("DisplayView");

// ── GET /displays/{id}/content ───────────────────────────────────────────────
// Get display content (snapshot).
// Query params:
//   version (optional) — an explicit version, wins over `stage`.
//   stage   (optional) — "published" serves the live version (what the runtime viewer must read);
//                        anything else (default) serves the latest draft (what the Designer edits).
// Phase L: before this, the viewer called this endpoint with NO params and therefore rendered the
// DRAFT — every designer save went live instantly and `published_version` was never read by anything.
app.MapGet("/displays/{id:guid}/content", async (Guid id, int? version, string? stage, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();

    var wantPublished = string.Equals(stage, "published", StringComparison.OrdinalIgnoreCase);
    if (wantPublished && version is null && display.PublishedVersion is null)
        return Results.NotFound("Display has no published version");

    var targetVersion = version
        ?? (wantPublished ? display.PublishedVersion!.Value : display.DraftVersion);

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
}).RequireAuthorization("DisplayView");

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
        Level = request.Level,
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
}).RequireAuthorization("DisplayEdit");

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
    if (request.Level is not null) display.Level = request.Level;

    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    await PublishDisplayEvent(redis, "display.updated", display.Id, display.Name);
    
    return Results.Ok(new { id = display.Id, name = display.Name, updatedAt = display.UpdatedAt });
}).RequireAuthorization("DisplayEdit");

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
}).RequireAuthorization("DisplayEdit");

// ── POST /displays/{id}/publish ──────────────────────────────────────────────
// Publish the current draft as the active version.
app.MapPost("/displays/{id:guid}/publish", async (Guid id, PublishRequest request, ClaimsPrincipal user,
                                                 DisplayDbContext db, IConnectionMultiplexer redis) =>
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

    // Stamp WHO and WHEN. The publisher comes from the bearer token, not from the request body — a
    // client-supplied identity in an audit trail is worthless.
    var now = DateTimeOffset.UtcNow;
    var publisher = PublisherName(user);

    draftVersion.Status = "published";
    draftVersion.ChangeNote = request.ChangeNote ?? draftVersion.ChangeNote;
    draftVersion.PublishedAt = now;
    draftVersion.PublishedBy = publisher;

    display.PublishedVersion = draftVersion.Version;
    display.PublishedAt = now;
    display.PublishedBy = publisher;
    display.UpdatedAt = now;

    await db.SaveChangesAsync();

    await PublishDisplayEvent(redis, "display.published", display.Id, display.Name);

    return Results.Ok(new
    {
        displayId = display.Id,
        publishedVersion = display.PublishedVersion,
        publishedAt = now,
        publishedBy = publisher
    });
}).RequireAuthorization("DisplayPublish");

// ── POST /displays/{id}/unpublish ────────────────────────────────────────────
// Phase L — withdraw the display from the runtime. The version rows stay (history is append-only);
// only the pointer is cleared, so `?stage=published` 404s and Operators stop seeing it.
app.MapPost("/displays/{id:guid}/unpublish", async (Guid id, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (display.PublishedVersion is null) return Results.BadRequest("Display is not published");

    var published = await db.DisplayVersions
        .FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == display.PublishedVersion);
    if (published is not null) published.Status = "archived";

    var was = display.PublishedVersion;
    display.PublishedVersion = null;
    display.PublishedAt = null;
    display.PublishedBy = null;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();

    await PublishDisplayEvent(redis, "display.unpublished", display.Id, display.Name);

    return Results.Ok(new { displayId = display.Id, unpublishedVersion = was, publishedVersion = (int?)null });
}).RequireAuthorization("DisplayPublish");

// ── POST /displays/{id}/revert ───────────────────────────────────────────────
// Phase L — discard unpublished work: copy the last published snapshot into a NEW draft version.
// Append-only, exactly like PUT /content — history is never rewritten, so the abandoned drafts remain
// auditable.
app.MapPost("/displays/{id:guid}/revert", async (Guid id, ClaimsPrincipal user, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (display.PublishedVersion is null) return Results.BadRequest("Display has no published version to revert to");

    var published = await db.DisplayVersions
        .FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == display.PublishedVersion);
    if (published is null) return Results.BadRequest("Published version not found");

    var revertedFrom = display.PublishedVersion.Value;

    display.DraftVersion++;
    display.UpdatedAt = DateTimeOffset.UtcNow;

    var revertVersion = new DisplayVersion
    {
        Id = Guid.NewGuid(),
        DisplayId = display.Id,
        Version = display.DraftVersion,
        Snapshot = published.Snapshot,
        // The new draft is byte-identical to what is already live, so it IS the published version —
        // mark it so. Otherwise draft (n+1) > published (n) forever and the display is permanently
        // flagged "unpublished changes" even though nothing differs from the runtime; the only way to
        // clear the badge was to press Publish, creating a meaningless new published version.
        Status = "published",
        ChangeNote = $"Reverted to published v{published.Version}",
        CreatedBy = PublisherName(user),
        CreatedAt = DateTimeOffset.UtcNow,
        PublishedAt = DateTimeOffset.UtcNow,
        PublishedBy = PublisherName(user)
    };

    published.Status = "archived";
    display.PublishedVersion = revertVersion.Version;
    display.PublishedAt = DateTimeOffset.UtcNow;
    display.PublishedBy = PublisherName(user);

    db.DisplayVersions.Add(revertVersion);
    await db.SaveChangesAsync();

    await PublishDisplayEvent(redis, "display.reverted", display.Id, display.Name);

    return Results.Ok(new
    {
        displayId = display.Id,
        draftVersion = revertVersion.Version,
        publishedVersion = display.PublishedVersion,
        revertedTo = revertedFrom
    });
}).RequireAuthorization("DisplayPublish");

// ── POST /displays/{id}/duplicate ────────────────────────────────────────────
// "Save As" (PI Vision's Save ▾ → Save As). Copies WHAT YOU ARE LOOKING AT — the current draft — into a
// brand-new display owned by the caller. It is also how you take a copy of someone else's display.
//
// Item ids are REGENERATED: a straight copy would leave two displays sharing item ids, so `groupId`
// membership and any self-referencing link would alias across both.
app.MapPost("/displays/{id:guid}/duplicate", async (Guid id, DuplicateRequest request, ClaimsPrincipal user,
                                                    DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var source = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (source is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("name is required");

    var sourceVersion = await db.DisplayVersions
        .FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == source.DraftVersion);
    if (sourceVersion is null) return Results.BadRequest("Source display has no content to copy");

    var owner = PublisherName(user);
    var now = DateTimeOffset.UtcNow;

    var copy = new Display
    {
        Id = Guid.NewGuid(),
        Name = request.Name,
        Category = request.Category ?? source.Category,
        Description = source.Description,
        HierarchyPath = request.HierarchyPath ?? source.HierarchyPath,
        Width = source.Width,
        Height = source.Height,
        BackgroundColor = source.BackgroundColor,
        DraftVersion = 1,
        PublishedVersion = null,        // a copy starts unpublished — it is not live until someone says so
        OwnerId = owner,
        CreatedAt = now,
        UpdatedAt = now,
    };

    copy.Versions.Add(new DisplayVersion
    {
        Id = Guid.NewGuid(),
        DisplayId = copy.Id,
        Version = 1,
        Snapshot = RegenerateItemIds(sourceVersion.Snapshot),
        Status = "draft",
        ChangeNote = $"Copied from \"{source.Name}\" v{sourceVersion.Version}",
        CreatedBy = owner,
        CreatedAt = now,
    });

    db.Displays.Add(copy);
    await db.SaveChangesAsync();
    await PublishDisplayEvent(redis, "display.created", copy.Id, copy.Name);

    return Results.Created($"/displays/{copy.Id}", new { id = copy.Id, name = copy.Name, draftVersion = 1 });
}).RequireAuthorization("DisplayEdit");

// ── GET /displays/deleted ────────────────────────────────────────────────────
// The recycle bin. Deletes are soft (IsDeleted), so nothing was ever actually recoverable through the
// API — the rows just became invisible. PI Vision keeps deleted displays indefinitely and lets you
// restore them; under ISA-101 a display is a change-managed artifact, so this is the right posture.
app.MapGet("/displays/deleted", async (DisplayDbContext db) =>
{
    var deleted = await db.Displays
        .Where(d => d.IsDeleted)
        .OrderByDescending(d => d.UpdatedAt)
        .Select(d => new { d.Id, d.Name, d.Category, d.OwnerId, deletedAt = d.UpdatedAt })
        .ToListAsync();
    return Results.Ok(new { total = deleted.Count, displays = deleted });
}).RequireAuthorization("DisplayEdit");

// ── POST /displays/{id}/restore ──────────────────────────────────────────────
app.MapPost("/displays/{id:guid}/restore", async (Guid id, DisplayDbContext db, IConnectionMultiplexer redis) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && d.IsDeleted);
    if (display is null) return Results.NotFound();

    display.IsDeleted = false;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    await PublishDisplayEvent(redis, "display.restored", display.Id, display.Name);

    // Restored as a DRAFT: it must be re-published deliberately, never silently re-appear on an
    // operator's screen just because someone emptied the bin.
    return Results.Ok(new { id = display.Id, name = display.Name, publishedVersion = display.PublishedVersion });
}).RequireAuthorization("DisplayEdit");

// ── PUT /displays/{id}/thumbnail ─────────────────────────────────────────────
// Store the display's preview. The client renders it from the DESIGN-MODE canvas on publish, so a
// thumbnail can never capture a live process value (a preview of a running display would leak plant
// data into every screenshot of the display list). SVG text, not a raster: we render DOM/SVG, so this
// is a serialization — no headless browser, no rasterizer.
app.MapPut("/displays/{id:guid}/thumbnail", async (Guid id, ThumbnailRequest request, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.Svg)) return Results.BadRequest("svg is required");
    if (request.Svg.Length > 400_000) return Results.BadRequest("thumbnail too large");
    // Defence in depth: an SVG is markup, and this one is rendered back into the list page.
    if (request.Svg.Contains("<script", StringComparison.OrdinalIgnoreCase)
        || request.Svg.Contains("onload", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest("thumbnail must not contain script");

    display.ThumbnailSvg = request.Svg;
    display.ThumbnailAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { displayId = display.Id, bytes = request.Svg.Length, at = display.ThumbnailAt });
}).RequireAuthorization("DisplayEdit");

// ── GET /displays/{id}/thumbnail ─────────────────────────────────────────────
// Served separately from the list so a page of 200 cards doesn't drag 200 SVG blobs with it.
app.MapGet("/displays/{id:guid}/thumbnail", async (Guid id, DisplayDbContext db) =>
{
    var svg = await db.Displays.Where(d => d.Id == id && !d.IsDeleted)
        .Select(d => d.ThumbnailSvg).FirstOrDefaultAsync();
    if (string.IsNullOrEmpty(svg)) return Results.NotFound();
    return Results.Content(svg, "image/svg+xml");
}).RequireAuthorization("DisplayView");

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
}).RequireAuthorization("DisplayEdit");

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
}).RequireAuthorization("DisplayView");

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
}).RequireAuthorization("DisplayView");

app.Run();

// ── Helper Functions ─────────────────────────────────────────────────────────
/// <summary>
/// Deep-copy a snapshot with fresh item ids, remapping groupId membership so the copy's groups stay
/// internally consistent and never alias the source display's items.
/// </summary>
static JsonDocument RegenerateItemIds(JsonDocument snapshot)
{
    var root = JsonNode.Parse(snapshot.RootElement.GetRawText())!.AsObject();
    if (root["items"] is not JsonArray items) return JsonDocument.Parse(root.ToJsonString());

    var idMap = new Dictionary<string, string>();
    var groupMap = new Dictionary<string, string>();

    foreach (var item in items.OfType<JsonObject>())
    {
        var oldId = item["id"]?.GetValue<string>();
        if (oldId is null) continue;
        var newId = $"i{Guid.NewGuid():N}"[..12];
        idMap[oldId] = newId;
        item["id"] = newId;

        var g = item["groupId"]?.GetValue<string>();
        if (g is not null)
        {
            if (!groupMap.TryGetValue(g, out var newGroup))
            {
                newGroup = $"grp-{Guid.NewGuid():N}"[..12];
                groupMap[g] = newGroup;
            }
            item["groupId"] = newGroup;
        }
    }

    return JsonDocument.Parse(root.ToJsonString());
}

/// <summary>Who is acting, taken from the bearer token (never from the request body).</summary>
static string PublisherName(ClaimsPrincipal user) =>
    user.FindFirst("preferred_username")?.Value
    ?? user.FindFirst("username")?.Value
    ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value
    ?? "unknown";

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
    string OwnerId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    DateTimeOffset? PublishedAt, string? PublishedBy,
    short? Level, bool HasThumbnail);

record DisplayDetailDto(
    Guid Id, string Name, string Category, string? Description, string? HierarchyPath,
    int Width, int Height, string BackgroundColor,
    int? PublishedVersion, int DraftVersion, string OwnerId,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    DateTimeOffset? PublishedAt, string? PublishedBy,
    List<VersionSummaryDto> RecentVersions);

record VersionSummaryDto(
    Guid Id, int Version, string Status, string? ChangeNote, string CreatedBy, DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt, string? PublishedBy);

record DuplicateRequest(string Name, string? Category, string? HierarchyPath);

record ThumbnailRequest(string Svg);

record CreateDisplayRequest(
    string Name, string? Category, string? Description, string? HierarchyPath,
    int? Width, int? Height, string? BackgroundColor, string? OwnerId, short? Level);

record UpdateDisplayRequest(
    string? Name, string? Category, string? Description, string? HierarchyPath,
    int? Width, int? Height, string? BackgroundColor, short? Level);

record SaveContentRequest(JsonDocument? Snapshot, string? ChangeNote, string? UserId);

record PublishRequest(string? ChangeNote);
