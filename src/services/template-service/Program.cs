using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json;
using System.Text.RegularExpressions;
using Traverse.TemplateService.Data;
using Traverse.TemplateService.Models;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("TraverseTemplates") 
    ?? "Host=postgres;Database=traverse_templates;Username=postgres;Password=postgres";

builder.Services.AddDbContext<TemplateDbContext>(options => 
    options.UseNpgsql(connectionString));

var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

var app = builder.Build();

// ── GET /health ─────────────────────────────────────────────────────────────
app.MapGet("/health", async (TemplateDbContext db, IConnectionMultiplexer redis) =>
{
    var checks = new Dictionary<string, object>();
    var dbStatus = "Healthy";

    try
    {
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        checks["database"] = new { status = "Healthy" };
    }
    catch (Exception ex)
    {
        dbStatus = "Unhealthy";
        checks["database"] = new { status = "Unhealthy", description = ex.Message };
    }

    var overall = dbStatus == "Healthy" ? "Healthy" : "Degraded";
    return overall == "Healthy"
        ? Results.Json(new { status = overall, checks })
        : Results.Json(new { status = overall, checks }, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// ══════════════════════════════════════════════════════════════════════════════
// Template CRUD Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /templates ───────────────────────────────────────────────────────────
app.MapGet("/templates", async (
    TemplateDbContext db,
    string? category,
    string? search,
    bool? systemOnly,
    int skip = 0,
    int take = 50) =>
{
    var query = db.Templates
        .Include(t => t.Parameters)
        .Where(t => !t.IsDeleted);
    
    if (!string.IsNullOrWhiteSpace(category))
        query = query.Where(t => t.Category == category);
    
    if (systemOnly == true)
        query = query.Where(t => t.IsSystem);
    
    if (!string.IsNullOrWhiteSpace(search))
        query = query.Where(t => t.Name.Contains(search) || (t.Description != null && t.Description.Contains(search)));
    
    var total = await query.CountAsync();
    var templates = await query
        .OrderBy(t => t.Category)
        .ThenBy(t => t.Name)
        .Skip(skip)
        .Take(Math.Min(take, 100))
        .Select(t => new TemplateListDto(
            t.Id, t.Name, t.Category, t.Description, t.Icon,
            t.PublishedVersion, t.DraftVersion, t.IsSystem,
            t.Parameters.Select(p => new ParameterDto(p.Name, p.Label, p.Type, p.Required)).ToList()))
        .ToListAsync();
    
    return Results.Ok(new { total, skip, take = templates.Count, templates });
});

// ── GET /templates/{id} ──────────────────────────────────────────────────────
app.MapGet("/templates/{id:guid}", async (Guid id, TemplateDbContext db) =>
{
    var template = await db.Templates
        .Include(t => t.Parameters)
        .Include(t => t.Versions.OrderByDescending(v => v.Version).Take(5))
        .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
    
    if (template is null) return Results.NotFound();
    
    return Results.Ok(new TemplateDetailDto(
        template.Id, template.Name, template.Category, template.Description, template.Icon,
        template.PublishedVersion, template.DraftVersion, template.IsSystem, template.OwnerId,
        template.Parameters.Select(p => new ParameterDto(p.Name, p.Label, p.Type, p.Required)).ToList(),
        template.Versions.Select(v => new VersionSummaryDto(v.Id, v.Version, v.Status, v.ChangeNote, v.CreatedBy, v.CreatedAt)).ToList()));
});

// ── GET /templates/{id}/definition ───────────────────────────────────────────
app.MapGet("/templates/{id:guid}/definition", async (Guid id, int? version, TemplateDbContext db) =>
{
    var template = await db.Templates.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
    if (template is null) return Results.NotFound();
    
    var targetVersion = version ?? template.PublishedVersion ?? template.DraftVersion;
    
    var templateVersion = await db.TemplateVersions
        .FirstOrDefaultAsync(v => v.TemplateId == id && v.Version == targetVersion);
    
    if (templateVersion is null)
        return Results.NotFound($"Version {targetVersion} not found");
    
    var parameters = await db.TemplateParameters
        .Where(p => p.TemplateId == id)
        .ToListAsync();
    
    return Results.Ok(new
    {
        templateId = template.Id,
        name = template.Name,
        category = template.Category,
        version = templateVersion.Version,
        defaultWidth = templateVersion.DefaultWidth,
        defaultHeight = templateVersion.DefaultHeight,
        definition = templateVersion.Definition,
        parameters = parameters.Select(p => new ParameterDto(p.Name, p.Label, p.Type, p.Required))
    });
});

// ── POST /templates ──────────────────────────────────────────────────────────
app.MapPost("/templates", async (CreateTemplateRequest request, TemplateDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest("name is required");
    
    var template = new ElementTemplate
    {
        Id = Guid.NewGuid(),
        Name = request.Name,
        Category = request.Category ?? "General",
        Description = request.Description,
        Icon = request.Icon,
        DraftVersion = 1,
        OwnerId = request.OwnerId ?? "system",
        IsSystem = request.IsSystem ?? false,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    
    // Add parameters
    if (request.Parameters != null)
    {
        foreach (var p in request.Parameters)
        {
            template.Parameters.Add(new TemplateParameter
            {
                Id = Guid.NewGuid(),
                TemplateId = template.Id,
                Name = p.Name,
                Label = p.Label ?? p.Name,
                Type = p.Type ?? "path",
                DefaultValue = p.DefaultValue,
                Required = p.Required ?? true,
                Description = p.Description
            });
        }
    }
    else
    {
        // Default basePath parameter
        template.Parameters.Add(new TemplateParameter
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Name = "basePath",
            Label = "Base Path",
            Type = "path",
            Required = true,
            Description = "UNS contextual path prefix for all bindings"
        });
    }
    
    // Create initial version with empty definition
    var initialDef = JsonDocument.Parse(JsonSerializer.Serialize(new
    {
        items = Array.Empty<object>(),
        metadata = new { createdAt = DateTimeOffset.UtcNow }
    }));
    
    template.Versions.Add(new TemplateVersion
    {
        Id = Guid.NewGuid(),
        TemplateId = template.Id,
        Version = 1,
        Definition = initialDef,
        DefaultWidth = request.DefaultWidth ?? 200,
        DefaultHeight = request.DefaultHeight ?? 200,
        Status = "draft",
        ChangeNote = "Initial creation",
        CreatedBy = request.OwnerId ?? "system",
        CreatedAt = DateTimeOffset.UtcNow
    });
    
    db.Templates.Add(template);
    await db.SaveChangesAsync();
    
    return Results.Created($"/templates/{template.Id}", new { id = template.Id, name = template.Name });
});

// ── PUT /templates/{id}/definition ───────────────────────────────────────────
app.MapPut("/templates/{id:guid}/definition", async (Guid id, SaveDefinitionRequest request, TemplateDbContext db) =>
{
    var template = await db.Templates.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
    if (template is null) return Results.NotFound();
    
    if (template.IsSystem && request.UserId != "system")
        return Results.Forbid();
    
    template.DraftVersion++;
    template.UpdatedAt = DateTimeOffset.UtcNow;
    
    var newVersion = new TemplateVersion
    {
        Id = Guid.NewGuid(),
        TemplateId = template.Id,
        Version = template.DraftVersion,
        Definition = request.Definition!,
        DefaultWidth = request.DefaultWidth ?? 200,
        DefaultHeight = request.DefaultHeight ?? 200,
        Status = "draft",
        ChangeNote = request.ChangeNote,
        CreatedBy = request.UserId ?? "system",
        CreatedAt = DateTimeOffset.UtcNow
    };
    
    db.TemplateVersions.Add(newVersion);
    await db.SaveChangesAsync();
    
    return Results.Ok(new { templateId = template.Id, version = newVersion.Version });
});

// ── POST /templates/{id}/publish ─────────────────────────────────────────────
app.MapPost("/templates/{id:guid}/publish", async (Guid id, TemplateDbContext db) =>
{
    var template = await db.Templates.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
    if (template is null) return Results.NotFound();
    
    var draftVersion = await db.TemplateVersions
        .FirstOrDefaultAsync(v => v.TemplateId == id && v.Version == template.DraftVersion);
    
    if (draftVersion is null)
        return Results.BadRequest("No draft version to publish");
    
    draftVersion.Status = "published";
    template.PublishedVersion = draftVersion.Version;
    template.UpdatedAt = DateTimeOffset.UtcNow;
    
    await db.SaveChangesAsync();
    
    return Results.Ok(new { templateId = template.Id, publishedVersion = template.PublishedVersion });
});

// ══════════════════════════════════════════════════════════════════════════════
// Template Instantiation Endpoint
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /templates/{id}/instantiate ─────────────────────────────────────────
// Returns the template definition with parameters substituted.
app.MapPost("/templates/{id:guid}/instantiate", async (Guid id, InstantiateRequest request, TemplateDbContext db) =>
{
    var template = await db.Templates
        .Include(t => t.Parameters)
        .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
    
    if (template is null) return Results.NotFound();
    
    var version = template.PublishedVersion ?? template.DraftVersion;
    var templateVersion = await db.TemplateVersions
        .FirstOrDefaultAsync(v => v.TemplateId == id && v.Version == version);
    
    if (templateVersion is null)
        return Results.BadRequest("No published version available");
    
    // Validate required parameters
    foreach (var param in template.Parameters.Where(p => p.Required))
    {
        if (!request.Parameters.ContainsKey(param.Name) && string.IsNullOrEmpty(param.DefaultValue))
            return Results.BadRequest($"Required parameter '{param.Name}' is missing");
    }
    
    // Build resolved parameters
    var resolvedParams = new Dictionary<string, string>();
    foreach (var param in template.Parameters)
    {
        if (request.Parameters.TryGetValue(param.Name, out var value))
            resolvedParams[param.Name] = value;
        else if (!string.IsNullOrEmpty(param.DefaultValue))
            resolvedParams[param.Name] = param.DefaultValue;
    }
    
    // Substitute parameters in definition
    var defJson = templateVersion.Definition.RootElement.GetRawText();
    foreach (var (name, value) in resolvedParams)
    {
        defJson = defJson.Replace($"{{{{{name}}}}}", value);
    }
    
    var instanceId = $"tmpl-{template.Id:N}-{DateTime.UtcNow.Ticks}";
    
    return Results.Ok(new
    {
        instanceId,
        templateId = template.Id,
        templateName = template.Name,
        templateVersion = version,
        resolvedParameters = resolvedParams,
        position = request.Position,
        size = new { width = templateVersion.DefaultWidth, height = templateVersion.DefaultHeight },
        definition = JsonDocument.Parse(defJson)
    });
});

// ── GET /templates/categories ────────────────────────────────────────────────
app.MapGet("/templates/categories", async (TemplateDbContext db) =>
{
    var categories = await db.Templates
        .Where(t => !t.IsDeleted)
        .GroupBy(t => t.Category)
        .Select(g => new { category = g.Key, count = g.Count() })
        .ToListAsync();
    
    return Results.Ok(categories);
});

app.Run();

// ── DTOs ─────────────────────────────────────────────────────────────────────
record TemplateListDto(
    Guid Id, string Name, string Category, string? Description, string? Icon,
    int? PublishedVersion, int DraftVersion, bool IsSystem,
    List<ParameterDto> Parameters);

record TemplateDetailDto(
    Guid Id, string Name, string Category, string? Description, string? Icon,
    int? PublishedVersion, int DraftVersion, bool IsSystem, string OwnerId,
    List<ParameterDto> Parameters, List<VersionSummaryDto> RecentVersions);

record ParameterDto(string Name, string Label, string Type, bool Required);

record VersionSummaryDto(Guid Id, int Version, string Status, string? ChangeNote, string CreatedBy, DateTimeOffset CreatedAt);

record CreateTemplateRequest(
    string Name, string? Category, string? Description, string? Icon,
    int? DefaultWidth, int? DefaultHeight, string? OwnerId, bool? IsSystem,
    List<CreateParameterRequest>? Parameters);

record CreateParameterRequest(
    string Name, string? Label, string? Type, string? DefaultValue, bool? Required, string? Description);

record SaveDefinitionRequest(JsonDocument? Definition, int? DefaultWidth, int? DefaultHeight, string? ChangeNote, string? UserId);

record InstantiateRequest(Dictionary<string, string> Parameters, Position? Position);

record Position(double X, double Y);
