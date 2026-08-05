using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json;
using Traverse.AssetModel.Data;
using Traverse.AssetModel.Models;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

// ── Database ────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("TraverseAssets") 
    ?? "Host=postgres;Database=traverse_assets;Username=postgres;Password=postgres";

builder.Services.AddDbContext<AssetDbContext>(options => 
    options.UseNpgsql(connectionString));

// ── Redis (for publishing asset change events) ──────────────────────────────
var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
// RS256 bearer validation against auth-service JWKS + a policy per permission key.
// Internal callers (e.g. binding-resolver → asset-model) authenticate with X-Service-Key.
builder.AddTraverseAuth();

var app = builder.Build();

// Self-healing: add the `template` column (Phase 4) if an already-initialised DB predates it.
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AssetDbContext>();
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS template TEXT;");
        // CPLM Phase 4.1 — asset graph edges (PEER/UPSTREAM_OF/…). Same statements as
        // database/scripts/31_assets_relationships.sql, so already-initialised volumes
        // converge without a wipe (this service has no migration runner).
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS assets.asset_relationships (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                from_asset_id UUID NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
                to_asset_id   UUID NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
                rel_type      TEXT NOT NULL CHECK (rel_type IN
                                  ('PEER','UPSTREAM_OF','DOWNSTREAM_OF','CASCADE_PRIMARY','CASCADE_SECONDARY')),
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_by    TEXT,
                CONSTRAINT chk_asset_rel_not_self CHECK (from_asset_id <> to_asset_id));
            CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_relationships_edge
                ON assets.asset_relationships (from_asset_id, to_asset_id, rel_type);
            CREATE INDEX IF NOT EXISTS idx_asset_relationships_from
                ON assets.asset_relationships (from_asset_id, rel_type);
            CREATE INDEX IF NOT EXISTS idx_asset_relationships_to
                ON assets.asset_relationships (to_asset_id, rel_type);
            """);
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Could not ensure assets.template column at startup");
    }
}

app.UseTraverseAuth();

// ── GET /health ─────────────────────────────────────────────────────────────
app.MapGet("/health", async (AssetDbContext db, IConnectionMultiplexer redis) =>
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

// ── GET /assets ──────────────────────────────────────────────────────────────
// List assets with optional filtering by type or parent.
app.MapGet("/assets", async (
    AssetDbContext db,
    AssetType? type,
    Guid? parentId,
    string? search,
    int skip = 0,
    int take = 100) =>
{
    var query = db.Assets.Where(a => !a.IsDeleted);
    
    if (type.HasValue)
        query = query.Where(a => a.Type == type.Value);
    
    if (parentId.HasValue)
        query = query.Where(a => a.ParentId == parentId.Value);
    
    if (!string.IsNullOrWhiteSpace(search))
        query = query.Where(a => a.ContextualPath.Contains(search) || a.Name.Contains(search));
    
    var total = await query.CountAsync();
    var assets = await query
        .OrderBy(a => a.ContextualPath)
        .Skip(skip)
        .Take(Math.Min(take, 1000))
        .ToListAsync();
    
    return Results.Ok(new { total, skip, take = assets.Count, assets = assets.Select(AssetDto.From) });
}).RequireAuthorization("asset.view");

// ── GET /assets/{id} ─────────────────────────────────────────────────────────
app.MapGet("/assets/{id:guid}", async (Guid id, AssetDbContext db) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    return asset is null ? Results.NotFound() : Results.Ok(AssetDto.From(asset));
}).RequireAuthorization("asset.view");

// ── GET /assets/by-path/{**path} ────────────────────────────────────────────
// Resolve asset by contextual path.
app.MapGet("/assets/by-path/{**path}", async (string path, AssetDbContext db) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(a => a.ContextualPath == path && !a.IsDeleted);
    return asset is null ? Results.NotFound() : Results.Ok(AssetDto.From(asset));
}).RequireAuthorization("asset.view");

// ── POST /assets ─────────────────────────────────────────────────────────────
app.MapPost("/assets", async (CreateAssetRequest request, AssetDbContext db, IConnectionMultiplexer redis) =>
{
    if (string.IsNullOrWhiteSpace(request.ContextualPath))
        return Results.BadRequest("contextualPath is required");
    
    var existing = await db.Assets.AnyAsync(a => a.ContextualPath == request.ContextualPath && !a.IsDeleted);
    if (existing)
        return Results.Conflict($"Asset with path '{request.ContextualPath}' already exists");
    
    var asset = new Asset
    {
        Id = Guid.NewGuid(),
        ContextualPath = request.ContextualPath,
        Name = request.Name ?? request.ContextualPath.Split('/')[^1],
        Type = request.Type,
        Description = request.Description,
        EngineeringUnit = request.EngineeringUnit,
        LoEngLimit = request.LoEngLimit,
        HiEngLimit = request.HiEngLimit,
        Template = request.Template,
        ParentId = request.ParentId,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    
    db.Assets.Add(asset);
    await db.SaveChangesAsync();
    
    await PublishAssetEvent(redis, "asset.created", asset);
    
    return Results.Created($"/assets/{asset.Id}", AssetDto.From(asset));
}).RequireAuthorization("asset.edit");

// ── PUT /assets/{id} ─────────────────────────────────────────────────────────
app.MapPut("/assets/{id:guid}", async (Guid id, UpdateAssetRequest request, AssetDbContext db, IConnectionMultiplexer redis) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (asset is null)
        return Results.NotFound();
    
    if (request.Name is not null) asset.Name = request.Name;
    if (request.Description is not null) asset.Description = request.Description;
    if (request.EngineeringUnit is not null) asset.EngineeringUnit = request.EngineeringUnit;
    if (request.LoEngLimit.HasValue) asset.LoEngLimit = request.LoEngLimit;
    if (request.HiEngLimit.HasValue) asset.HiEngLimit = request.HiEngLimit;
    if (request.Template is not null) asset.Template = request.Template;

    asset.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    await PublishAssetEvent(redis, "asset.updated", asset);
    
    return Results.Ok(AssetDto.From(asset));
}).RequireAuthorization("asset.edit");

// ── DELETE /assets/{id} ──────────────────────────────────────────────────────
app.MapDelete("/assets/{id:guid}", async (Guid id, AssetDbContext db, IConnectionMultiplexer redis) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (asset is null)
        return Results.NotFound();
    
    asset.IsDeleted = true;
    asset.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    await PublishAssetEvent(redis, "asset.deleted", asset);
    
    return Results.NoContent();
}).RequireAuthorization("asset.edit");

// ── POST /assets/search ───────────────────────────────────────────────────────
// The one query surface for collections, dynamic search criteria, asset-comparison tables, and
// asset context switching (Phase 4). Structural search only — root subtree, descendants (path-prefix,
// since contextual_path encodes the hierarchy), hierarchy level, and template. Live-value filters
// (e.g. Flow > 50) are applied by the collection engine against the live plane (CQRS), not here.
app.MapPost("/assets/search", async (AssetSearchRequest req, AssetDbContext db) =>
{
    var q = db.Assets.Where(a => !a.IsDeleted);

    if (!string.IsNullOrWhiteSpace(req.Root))
    {
        if (req.ReturnAllDescendants)
        {
            var prefix = req.Root + "/";
            q = q.Where(a => a.ContextualPath == req.Root || a.ContextualPath.StartsWith(prefix));
        }
        else
        {
            // Direct children of the root asset (index-backed via parent_id).
            var rootId = await db.Assets
                .Where(a => a.ContextualPath == req.Root && !a.IsDeleted)
                .Select(a => (Guid?)a.Id)
                .FirstOrDefaultAsync();
            q = q.Where(a => a.ParentId == rootId);
        }
    }

    if (req.AssetType.HasValue) q = q.Where(a => a.Type == (AssetType)req.AssetType.Value);
    if (!string.IsNullOrWhiteSpace(req.Template)) q = q.Where(a => a.Template == req.Template);
    if (!string.IsNullOrWhiteSpace(req.Search))
        q = q.Where(a => a.Name.Contains(req.Search) || a.ContextualPath.Contains(req.Search));

    var take = Math.Clamp(req.Take ?? 500, 1, 2000);
    var assets = await q.OrderBy(a => a.ContextualPath).Take(take).ToListAsync();
    return Results.Ok(new { count = assets.Count, assets = assets.Select(AssetDto.From) });
}).RequireAuthorization("asset.view");

// ── GET /assets/{id}/descendants ──────────────────────────────────────────────
// All descendants of an asset (path-prefix). Optional type filter. Complements /children (one level).
app.MapGet("/assets/{id:guid}/descendants", async (Guid id, AssetType? type, AssetDbContext db) =>
{
    var root = await db.Assets.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (root is null) return Results.NotFound();
    var prefix = root.ContextualPath + "/";
    var q = db.Assets.Where(a => !a.IsDeleted && a.ContextualPath.StartsWith(prefix));
    if (type.HasValue) q = q.Where(a => a.Type == type.Value);
    var list = await q.OrderBy(a => a.ContextualPath).ToListAsync();
    return Results.Ok(list.Select(AssetDto.From));
}).RequireAuthorization("asset.view");

// ── GET /assets/{id}/children ────────────────────────────────────────────────
app.MapGet("/assets/{id:guid}/children", async (Guid id, AssetDbContext db) =>
{
    var children = await db.Assets
        .Where(a => a.ParentId == id && !a.IsDeleted)
        .OrderBy(a => a.Type)
        .ThenBy(a => a.Name)
        .ToListAsync();
    
    return Results.Ok(children.Select(AssetDto.From));
}).RequireAuthorization("asset.view");

// ── GET /assets/{id}/hierarchy ───────────────────────────────────────────────
// Returns the full path from root to this asset.
app.MapGet("/assets/{id:guid}/hierarchy", async (Guid id, AssetDbContext db) =>
{
    var hierarchy = new List<Asset>();
    var current = await db.Assets.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    
    while (current is not null)
    {
        hierarchy.Insert(0, current);
        current = current.ParentId.HasValue 
            ? await db.Assets.FirstOrDefaultAsync(a => a.Id == current.ParentId && !a.IsDeleted)
            : null;
    }
    
    return Results.Ok(hierarchy.Select(AssetDto.From));
}).RequireAuthorization("asset.view");

// ── Asset Relationship Endpoints (CPLM Phase 4.2) ────────────────────────────
// Non-hierarchical edges between assets. CPLM reads PEER/UPSTREAM_OF to decide
// whether an oscillation is self-inflicted or arriving from upstream (G13).

// GET /assets/{id}/relationships?type=PEER&direction=both
// direction: out (this asset is the source), in (target), both (default).
// PEER is stored as a single directed row but is conceptually symmetric, so the
// default "both" is what callers almost always want.
app.MapGet("/assets/{id:guid}/relationships", async (
    Guid id, string? type, string? direction, AssetDbContext db) =>
{
    if (type is not null && !AssetRelationshipTypes.IsValid(type))
        return Results.BadRequest(new { error = $"Invalid rel_type '{type}'. Valid: {string.Join(", ", AssetRelationshipTypes.All)}" });

    var dir = (direction ?? "both").ToLowerInvariant();
    if (dir is not ("in" or "out" or "both"))
        return Results.BadRequest(new { error = "direction must be one of: in, out, both" });

    var relType = type?.ToUpperInvariant();
    var query = db.AssetRelationships.AsQueryable();
    query = dir switch
    {
        "out" => query.Where(r => r.FromAssetId == id),
        "in" => query.Where(r => r.ToAssetId == id),
        _ => query.Where(r => r.FromAssetId == id || r.ToAssetId == id)
    };
    if (relType is not null) query = query.Where(r => r.RelType == relType);

    var rows = await query.OrderBy(r => r.RelType).ThenBy(r => r.CreatedAt).ToListAsync();

    // Resolve the far end of each edge so callers do not need a second round-trip.
    var otherIds = rows.Select(r => r.FromAssetId == id ? r.ToAssetId : r.FromAssetId).Distinct().ToList();
    var others = await db.Assets.Where(a => otherIds.Contains(a.Id) && !a.IsDeleted)
        .ToDictionaryAsync(a => a.Id, a => a);

    return Results.Ok(rows.Select(r =>
    {
        var outgoing = r.FromAssetId == id;
        var otherId = outgoing ? r.ToAssetId : r.FromAssetId;
        others.TryGetValue(otherId, out var other);
        return new
        {
            id = r.Id,
            relType = r.RelType,
            // As seen from {id}: an inbound UPSTREAM_OF row means the far asset
            // is upstream of me, i.e. my effective relation is DOWNSTREAM_OF.
            effectiveRelType = outgoing ? r.RelType : AssetRelationshipTypes.Inverse(r.RelType),
            direction = outgoing ? "out" : "in",
            assetId = otherId,
            assetPath = other?.ContextualPath,
            assetName = other?.Name,
            createdAt = r.CreatedAt,
            createdBy = r.CreatedBy
        };
    }));
}).RequireAuthorization("asset.view");

// POST /assets/{id}/relationships  { toAssetId, relType }
app.MapPost("/assets/{id:guid}/relationships", async (
    Guid id, CreateRelationshipRequest request, AssetDbContext db, HttpContext http) =>
{
    if (!AssetRelationshipTypes.IsValid(request.RelType))
        return Results.BadRequest(new { error = $"Invalid rel_type '{request.RelType}'. Valid: {string.Join(", ", AssetRelationshipTypes.All)}" });
    if (id == request.ToAssetId)
        return Results.BadRequest(new { error = "An asset cannot relate to itself" });

    var relType = request.RelType.ToUpperInvariant();

    // Both endpoints must exist and be live; a dangling edge is worse than no edge
    // because CPLM would count it as a peer link and evaluate G13 on nothing.
    var known = await db.Assets.Where(a => (a.Id == id || a.Id == request.ToAssetId) && !a.IsDeleted)
        .Select(a => a.Id).ToListAsync();
    if (!known.Contains(id)) return Results.NotFound(new { error = $"Asset {id} not found" });
    if (!known.Contains(request.ToAssetId)) return Results.NotFound(new { error = $"Asset {request.ToAssetId} not found" });

    var existing = await db.AssetRelationships.FirstOrDefaultAsync(r =>
        r.FromAssetId == id && r.ToAssetId == request.ToAssetId && r.RelType == relType);
    if (existing is not null) return Results.Ok(new { id = existing.Id, relType, status = "exists" });

    // PEER is symmetric: reject the mirror row so the pair has exactly one edge.
    if (relType == AssetRelationshipTypes.Peer)
    {
        var mirror = await db.AssetRelationships.FirstOrDefaultAsync(r =>
            r.FromAssetId == request.ToAssetId && r.ToAssetId == id && r.RelType == relType);
        if (mirror is not null) return Results.Ok(new { id = mirror.Id, relType, status = "exists" });
    }

    var rel = new AssetRelationship
    {
        FromAssetId = id,
        ToAssetId = request.ToAssetId,
        RelType = relType,
        CreatedBy = http.User.Identity?.Name
    };
    db.AssetRelationships.Add(rel);
    await db.SaveChangesAsync();

    return Results.Created($"/assets/{id}/relationships", new { id = rel.Id, relType, status = "created" });
}).RequireAuthorization("asset.edit");

// DELETE /assets/{id}/relationships?toAssetId={guid}&relType={type}
app.MapDelete("/assets/{id:guid}/relationships", async (
    Guid id, Guid toAssetId, string relType, AssetDbContext db) =>
{
    if (!AssetRelationshipTypes.IsValid(relType))
        return Results.BadRequest(new { error = $"Invalid rel_type '{relType}'" });

    var type = relType.ToUpperInvariant();
    // Delete the edge in whichever direction it was stored (PEER may be either way).
    var rows = await db.AssetRelationships.Where(r => r.RelType == type &&
            ((r.FromAssetId == id && r.ToAssetId == toAssetId) ||
             (type == "PEER" && r.FromAssetId == toAssetId && r.ToAssetId == id)))
        .ToListAsync();
    if (rows.Count == 0) return Results.NotFound();

    db.AssetRelationships.RemoveRange(rows);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("asset.edit");

// ── Alias Mapping Endpoints ──────────────────────────────────────────────────

// GET /aliases/resolve?legacy={path}&source={system}
app.MapGet("/aliases/resolve", async (string legacy, string? source, AssetDbContext db) =>
{
    var query = db.AliasMappings.Where(a => a.LegacyPath == legacy && a.IsActive);
    
    if (!string.IsNullOrWhiteSpace(source))
        query = query.Where(a => a.SourceSystem == source);
    
    var mapping = await query.FirstOrDefaultAsync();
    if (mapping is null)
        return Results.NotFound();
    
    var asset = await db.Assets.FirstOrDefaultAsync(a => a.ContextualPath == mapping.CanonicalPath && !a.IsDeleted);
    return asset is null 
        ? Results.Ok(new { canonicalPath = mapping.CanonicalPath, asset = (object?)null })
        : Results.Ok(new { canonicalPath = mapping.CanonicalPath, asset = AssetDto.From(asset) });
}).RequireAuthorization("asset.view");

// POST /aliases
app.MapPost("/aliases", async (CreateAliasRequest request, AssetDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.LegacyPath) || string.IsNullOrWhiteSpace(request.CanonicalPath))
        return Results.BadRequest("legacyPath and canonicalPath are required");
    
    var alias = new AliasMapping
    {
        Id = Guid.NewGuid(),
        LegacyPath = request.LegacyPath,
        CanonicalPath = request.CanonicalPath,
        SourceSystem = request.SourceSystem ?? "unknown",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };
    
    db.AliasMappings.Add(alias);
    await db.SaveChangesAsync();
    
    return Results.Created($"/aliases/{alias.Id}", alias);
}).RequireAuthorization("asset.edit");

app.Run();

// ── Helper Functions ─────────────────────────────────────────────────────────
static async Task PublishAssetEvent(IConnectionMultiplexer redis, string eventType, Asset asset)
{
    var subscriber = redis.GetSubscriber();
    var payload = JsonSerializer.Serialize(new { eventType, asset = AssetDto.From(asset) });
    await subscriber.PublishAsync(RedisChannel.Literal("asset-events"), payload);
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
record AssetDto(
    Guid Id,
    string ContextualPath,
    string Name,
    AssetType Type,
    string? Description,
    string? EngineeringUnit,
    double? LoEngLimit,
    double? HiEngLimit,
    string? Template,
    Guid? ParentId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string IoTDbPath,
    string SparkplugGroup,
    string SparkplugEdgeNode,
    string SparkplugDevice,
    string? SparkplugMetric,
    string SparkplugTopic,
    string AlarmSource,
    string? RedisSnapshotKey)
{
    public static AssetDto From(Asset a) => new(
        a.Id, a.ContextualPath, a.Name, a.Type, a.Description,
        a.EngineeringUnit, a.LoEngLimit, a.HiEngLimit, a.Template, a.ParentId,
        a.CreatedAt, a.UpdatedAt,
        a.IoTDbPath, a.SparkplugGroup, a.SparkplugEdgeNode, a.SparkplugDevice,
        a.SparkplugMetric, a.SparkplugTopic, a.AlarmSource, a.RedisSnapshotKey);
}

record CreateAssetRequest(
    string ContextualPath,
    string? Name,
    AssetType Type,
    string? Description,
    string? EngineeringUnit,
    double? LoEngLimit,
    double? HiEngLimit,
    string? Template,
    Guid? ParentId);

record UpdateAssetRequest(
    string? Name,
    string? Description,
    string? EngineeringUnit,
    double? LoEngLimit,
    double? HiEngLimit,
    string? Template);

record AssetSearchRequest(
    string? Root,
    bool ReturnAllDescendants,
    int? AssetType,
    string? Template,
    string? Search,
    int? Take);

record CreateAliasRequest(
    string LegacyPath,
    string CanonicalPath,
    string? SourceSystem);

record CreateRelationshipRequest(
    Guid ToAssetId,
    string RelType);
