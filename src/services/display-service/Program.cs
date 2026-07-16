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
using Traverse.DisplayService.Services;

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

// ── Audit trail (Phase 5) ─────────────────────────────────────────────────────
// Governance actions (create/edit/delete/publish/share…) are emitted to the platform audit log.
builder.Services.AddSingleton<AuditEmitter>();

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

// Ensure the media-asset store exists (image/SVG uploads). Self-healing so an already-initialised
// database doesn't need re-seeding; a fresh install also gets it from database/scripts/20_*.sql.
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<DisplayDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            "CREATE TABLE IF NOT EXISTS displays.media_assets (" +
            "id UUID PRIMARY KEY, content_type TEXT NOT NULL, data BYTEA NOT NULL, " +
            "byte_size INTEGER NOT NULL, file_name TEXT, created_by TEXT, " +
            "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");

        // Phase 5 governance objects — kept in lock-step with database/scripts/22_display_governance.sql
        // so a running stack upgrades in place without a manual re-seed.
        await db.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS displays.folders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
                parent_id UUID REFERENCES displays.folders(id) ON DELETE CASCADE,
                owner_id TEXT NOT NULL DEFAULT 'system',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            ALTER TABLE displays.display_definitions ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES displays.folders(id) ON DELETE SET NULL;
            ALTER TABLE displays.display_definitions ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{{}}';
            CREATE TABLE IF NOT EXISTS displays.display_acl (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                display_id UUID REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
                folder_id UUID REFERENCES displays.folders(id) ON DELETE CASCADE,
                principal_type TEXT NOT NULL, principal TEXT NOT NULL, access TEXT NOT NULL,
                created_by TEXT NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS displays.recent_displays (
                user_id TEXT NOT NULL,
                display_id UUID NOT NULL REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
                accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, display_id));
            CREATE TABLE IF NOT EXISTS displays.display_comments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                display_id UUID NOT NULL REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
                version INTEGER, author TEXT NOT NULL DEFAULT 'system', body TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS displays.personal_views (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, name TEXT NOT NULL,
                description TEXT, width INTEGER NOT NULL DEFAULT 1920, height INTEGER NOT NULL DEFAULT 1080,
                background_color TEXT NOT NULL DEFAULT '#1e1e1e', config JSONB NOT NULL DEFAULT '{{""items"": []}}'::jsonb,
                source_display_id UUID REFERENCES displays.display_definitions(id),
                is_shared BOOLEAN NOT NULL DEFAULT FALSE, shared_with TEXT[] DEFAULT '{{}}',
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            CREATE TABLE IF NOT EXISTS displays.view_favorites (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
                display_id UUID REFERENCES displays.display_definitions(id),
                personal_view_id UUID REFERENCES displays.personal_views(id),
                display_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            -- Self-heal older deployments whose governance tables predate these columns (CREATE TABLE
            -- IF NOT EXISTS won't add them, so an existing table would 500 the ORDER BY / SELECT).
            ALTER TABLE displays.view_favorites ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE displays.view_favorites ADD COLUMN IF NOT EXISTS personal_view_id UUID REFERENCES displays.personal_views(id);
            ALTER TABLE displays.recent_displays ADD COLUMN IF NOT EXISTS accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();");
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Could not ensure display governance tables exist at startup");
    }
}

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
    string? tag,
    string? folderId,
    string? sort,
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

    if (!string.IsNullOrWhiteSpace(tag))
        query = query.Where(d => d.Tags.Contains(tag));

    if (Guid.TryParse(folderId, out var fid))
        query = query.Where(d => d.FolderId == fid);

    if (!string.IsNullOrWhiteSpace(search))
        query = query.Where(d => d.Name.Contains(search)
            || (d.Description != null && d.Description.Contains(search))
            || d.Tags.Contains(search));

    // Sort: name (default) | updated (most-recent first) | created | owner.
    query = sort?.ToLowerInvariant() switch
    {
        "updated" => query.OrderByDescending(d => d.UpdatedAt),
        "created" => query.OrderByDescending(d => d.CreatedAt),
        "owner"   => query.OrderBy(d => d.OwnerId).ThenBy(d => d.Name),
        _          => query.OrderBy(d => d.HierarchyPath).ThenBy(d => d.Name),
    };

    var total = await query.CountAsync();
    var displays = await query
        .Skip(skip)
        .Take(Math.Min(take, 200))
        .Select(d => new DisplayListDto(
            d.Id, d.Name, d.Category, d.Description, d.HierarchyPath,
            d.Width, d.Height, d.PublishedVersion, d.DraftVersion,
            d.OwnerId, d.CreatedAt, d.UpdatedAt, d.PublishedAt, d.PublishedBy,
            d.Level, d.ThumbnailSvg != null, d.FolderId, d.Tags))
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
app.MapGet("/displays/{id:guid}/content", async (Guid id, int? version, string? stage,
                                                 ClaimsPrincipal user, DisplayDbContext db) =>
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

    // Record a runtime open in the server-side "Recent" list (Phase 5.6) — published opens only, so
    // designer draft-loads don't pollute an operator's recents. Best-effort; never fail the read.
    if (wantPublished)
    {
        var who = PublisherName(user);
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO displays.recent_displays (user_id, display_id, accessed_at)
                VALUES ({who}, {id}, NOW())
                ON CONFLICT (user_id, display_id) DO UPDATE SET accessed_at = NOW();");
        }
        catch { /* recents are non-critical */ }
    }

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
app.MapPost("/displays", async (CreateDisplayRequest request, ClaimsPrincipal user,
                                DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest("name is required");

    // Owner is the authenticated caller — the token is authoritative over the request body.
    var owner = PublisherName(user);
    if (owner == "unknown" && !string.IsNullOrWhiteSpace(request.OwnerId)) owner = request.OwnerId;

    var display = new Display
    {
        Id = Guid.NewGuid(),
        Name = request.Name,
        Category = request.Category ?? "overview",
        Description = request.Description,
        HierarchyPath = request.HierarchyPath,
        FolderId = request.FolderId,
        Tags = request.Tags ?? Array.Empty<string>(),
        Width = request.Width ?? 1920,
        Height = request.Height ?? 1080,
        BackgroundColor = request.BackgroundColor ?? "#1e1e1e",
        DraftVersion = 1,
        Level = request.Level,
        OwnerId = owner,
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
    audit.Emit("DISPLAY_CREATED", owner, display.Id, display.Name);

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
app.MapPut("/displays/{id:guid}", async (Guid id, UpdateDisplayRequest request, ClaimsPrincipal user,
                                         DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();

    if (request.Name is not null) display.Name = request.Name;
    if (request.Category is not null) display.Category = request.Category;
    if (request.Description is not null) display.Description = request.Description;
    if (request.HierarchyPath is not null) display.HierarchyPath = request.HierarchyPath;
    if (request.FolderId.HasValue) display.FolderId = request.FolderId.Value == Guid.Empty ? null : request.FolderId;
    if (request.Tags is not null) display.Tags = request.Tags;
    if (request.Width.HasValue) display.Width = request.Width.Value;
    if (request.Height.HasValue) display.Height = request.Height.Value;
    if (request.BackgroundColor is not null) display.BackgroundColor = request.BackgroundColor;
    if (request.Level is not null) display.Level = request.Level;

    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();

    await PublishDisplayEvent(redis, "display.updated", display.Id, display.Name);
    audit.Emit("DISPLAY_UPDATED", PublisherName(user), display.Id, display.Name);

    return Results.Ok(new { id = display.Id, name = display.Name, updatedAt = display.UpdatedAt });
}).RequireAuthorization("DisplayEdit");

// ── PUT /displays/{id}/content ───────────────────────────────────────────────
// Save display content (creates new draft version).
app.MapPut("/displays/{id:guid}/content", async (Guid id, SaveContentRequest request, ClaimsPrincipal user,
                                                 DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();

    if (request.Snapshot is null)
        return Results.BadRequest("snapshot is required");
    
    // Config-only invariant: a saved display carries bindings, never process values.
    // Mirror the DB trigger (displays.validate_no_process_values) EXACTLY, so every forbidden
    // term is rejected as a clean 400 here rather than falling through to the trigger as a 500.
    var snapshotJson = request.Snapshot.RootElement.GetRawText();
    string[] forbiddenValueKeys = { "\"currentValue\"", "\"processValue\"", "\"liveValue\"", "\"realTimeValue\"" };
    if (forbiddenValueKeys.Any(term => snapshotJson.Contains(term, StringComparison.Ordinal)))
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
    audit.Emit("DISPLAY_CONTENT_SAVED", PublisherName(user), display.Id, display.Name,
        new { version = newVersion.Version });

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
                                                 DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();

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
    audit.Emit("DISPLAY_PUBLISHED", publisher, display.Id, display.Name,
        new { publishedVersion = display.PublishedVersion });

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
app.MapPost("/displays/{id:guid}/unpublish", async (Guid id, ClaimsPrincipal user,
                                                    DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();
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
    audit.Emit("DISPLAY_UNPUBLISHED", PublisherName(user), display.Id, display.Name, new { unpublishedVersion = was });

    return Results.Ok(new { displayId = display.Id, unpublishedVersion = was, publishedVersion = (int?)null });
}).RequireAuthorization("DisplayPublish");

// ── POST /displays/{id}/revert ───────────────────────────────────────────────
// Phase L — discard unpublished work: copy the last published snapshot into a NEW draft version.
// Append-only, exactly like PUT /content — history is never rewritten, so the abandoned drafts remain
// auditable.
app.MapPost("/displays/{id:guid}/revert", async (Guid id, ClaimsPrincipal user, DisplayDbContext db,
                                                 IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();
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
    audit.Emit("DISPLAY_REVERTED", PublisherName(user), display.Id, display.Name, new { revertedTo = revertedFrom });

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
                                                    DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
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
    audit.Emit("DISPLAY_DUPLICATED", owner, copy.Id, copy.Name, new { copiedFrom = source.Id });

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
app.MapPost("/displays/{id:guid}/restore", async (Guid id, ClaimsPrincipal user,
                                                  DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();

    display.IsDeleted = false;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    await PublishDisplayEvent(redis, "display.restored", display.Id, display.Name);
    audit.Emit("DISPLAY_RESTORED", PublisherName(user), display.Id, display.Name);

    // Restored as a DRAFT: it must be re-published deliberately, never silently re-appear on an
    // operator's screen just because someone emptied the bin.
    return Results.Ok(new { id = display.Id, name = display.Name, publishedVersion = display.PublishedVersion });
}).RequireAuthorization("DisplayEdit");

// ── PUT /displays/{id}/thumbnail ─────────────────────────────────────────────
// Store the display's preview. The client renders it from the DESIGN-MODE canvas on publish, so a
// thumbnail can never capture a live process value (a preview of a running display would leak plant
// data into every screenshot of the display list). SVG text, not a raster: we render DOM/SVG, so this
// is a serialization — no headless browser, no rasterizer.
app.MapPut("/displays/{id:guid}/thumbnail", async (Guid id, ThumbnailRequest request, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(request.Svg)) return Results.BadRequest("svg is required");
    if (request.Svg.Length > 400_000) return Results.BadRequest("thumbnail too large");
    // Defence in depth: an SVG is markup rendered back into the list page. Match the media sanitiser —
    // block script AND every active-content vector, not just <script>/onload.
    if (request.Svg.Contains("<script", StringComparison.OrdinalIgnoreCase)
        || request.Svg.Contains("onload", StringComparison.OrdinalIgnoreCase)
        || request.Svg.Contains("onerror", StringComparison.OrdinalIgnoreCase)
        || request.Svg.Contains("javascript:", StringComparison.OrdinalIgnoreCase))
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

// ── POST /displays/media ─────────────────────────────────────────────────────
// Upload an image/SVG asset for image symbols / the graphics library. Content-type allow-listed,
// size-capped, and SVG is sanitised (it is served back and could otherwise carry active content).
app.MapPost("/displays/media", async (MediaUploadRequest request, DisplayDbContext db, HttpContext ctx) =>
{
    string[] allowed = { "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml" };
    if (string.IsNullOrWhiteSpace(request.ContentType)
        || !allowed.Contains(request.ContentType, StringComparer.OrdinalIgnoreCase))
        return Results.BadRequest("Unsupported content type");
    if (string.IsNullOrWhiteSpace(request.DataBase64))
        return Results.BadRequest("data is required");

    // Accept a raw base64 body or a data: URL (FileReader.readAsDataURL).
    var b64 = request.DataBase64;
    var ci = b64.IndexOf("base64,", StringComparison.OrdinalIgnoreCase);
    if (ci >= 0) b64 = b64[(ci + 7)..];

    byte[] bytes;
    try { bytes = Convert.FromBase64String(b64); }
    catch { return Results.BadRequest("data must be base64"); }

    if (bytes.Length == 0) return Results.BadRequest("empty file");
    if (bytes.Length > 2_000_000) return Results.BadRequest("file too large (max 2 MB)");

    if (request.ContentType.Equals("image/svg+xml", StringComparison.OrdinalIgnoreCase))
    {
        var text = System.Text.Encoding.UTF8.GetString(bytes);
        if (text.Contains("<script", StringComparison.OrdinalIgnoreCase)
            || text.Contains("onload", StringComparison.OrdinalIgnoreCase)
            || text.Contains("onerror", StringComparison.OrdinalIgnoreCase)
            || text.Contains("javascript:", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest("SVG must not contain script");
    }

    var asset = new MediaAsset
    {
        Id = Guid.NewGuid(),
        ContentType = request.ContentType,
        Data = bytes,
        ByteSize = bytes.Length,
        FileName = request.FileName,
        CreatedBy = ctx.User.FindFirst("preferred_username")?.Value ?? "system",
        CreatedAt = DateTimeOffset.UtcNow,
    };
    db.MediaAssets.Add(asset);
    await db.SaveChangesAsync();
    return Results.Ok(new { id = asset.Id, contentType = asset.ContentType, byteSize = asset.ByteSize });
}).RequireAuthorization("DisplayEdit");

// ── GET /displays/media/{id} ─────────────────────────────────────────────────
app.MapGet("/displays/media/{id:guid}", async (Guid id, DisplayDbContext db) =>
{
    var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id);
    if (asset is null) return Results.NotFound();
    return Results.File(asset.Data, asset.ContentType);
}).RequireAuthorization("DisplayView");

// ── DELETE /displays/{id} ────────────────────────────────────────────────────
// Soft-delete a display.
app.MapDelete("/displays/{id:guid}", async (Guid id, ClaimsPrincipal user,
                                            DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();

    display.IsDeleted = true;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();

    await PublishDisplayEvent(redis, "display.deleted", display.Id, display.Name);
    audit.Emit("DISPLAY_DELETED", PublisherName(user), display.Id, display.Name);

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

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5 — Folders (a governed tree, replacing free-text hierarchy_path)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /folders — flat list; the client assembles the tree from parentId. ────
app.MapGet("/folders", async (DisplayDbContext db) =>
{
    var folders = await db.Folders
        .OrderBy(f => f.Name)
        .Select(f => new { f.Id, f.Name, f.ParentId, f.OwnerId })
        .ToListAsync();
    return Results.Ok(new { total = folders.Count, folders });
}).RequireAuthorization("DisplayView");

app.MapPost("/folders", async (FolderRequest request, ClaimsPrincipal user, DisplayDbContext db, AuditEmitter audit) =>
{
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("name is required");
    var folder = new Folder
    {
        Id = Guid.NewGuid(),
        Name = request.Name,
        ParentId = request.ParentId,
        OwnerId = PublisherName(user),
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };
    db.Folders.Add(folder);
    await db.SaveChangesAsync();
    audit.Emit("FOLDER_CREATED", folder.OwnerId, folder.Id, folder.Name);
    return Results.Created($"/folders/{folder.Id}", new { folder.Id, folder.Name, folder.ParentId });
}).RequireAuthorization("DisplayEdit");

app.MapPut("/folders/{id:guid}", async (Guid id, FolderRequest request, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id);
    if (folder is null) return Results.NotFound();
    if (!IsAdmin(user) && !string.Equals(folder.OwnerId, PublisherName(user), StringComparison.OrdinalIgnoreCase))
        return Results.Forbid();
    if (!string.IsNullOrWhiteSpace(request.Name)) folder.Name = request.Name;
    // Reparenting: guard against making a folder its own ancestor (would orphan the subtree).
    if (request.ParentId != folder.ParentId)
    {
        if (request.ParentId == id) return Results.BadRequest("A folder cannot be its own parent");
        var chain = await FolderChainAsync(db, request.ParentId);
        if (chain.Contains(id)) return Results.BadRequest("Cannot move a folder into its own descendant");
        folder.ParentId = request.ParentId;
    }
    folder.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { folder.Id, folder.Name, folder.ParentId });
}).RequireAuthorization("DisplayEdit");

app.MapDelete("/folders/{id:guid}", async (Guid id, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id);
    if (folder is null) return Results.NotFound();
    if (!IsAdmin(user) && !string.Equals(folder.OwnerId, PublisherName(user), StringComparison.OrdinalIgnoreCase))
        return Results.Forbid();
    // Displays in the folder are detached (folder_id → NULL by FK ON DELETE SET NULL); child folders
    // cascade. The displays themselves are never deleted by removing their folder.
    db.Folders.Remove(folder);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("DisplayEdit");

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5 — Access control (sharing) on displays and folders
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /displays/{id}/permissions — direct grants + inherited folder grants. ─
app.MapGet("/displays/{id:guid}/permissions", async (Guid id, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    var folders = await FolderChainAsync(db, display.FolderId);
    var grants = await db.DisplayAcls
        .Where(a => a.DisplayId == id || (a.FolderId != null && folders.Contains(a.FolderId.Value)))
        .Select(a => new { a.Id, a.PrincipalType, a.Principal, a.Access, a.DisplayId, a.FolderId, Inherited = a.DisplayId == null })
        .ToListAsync();
    return Results.Ok(new { owner = display.OwnerId, grants });
}).RequireAuthorization("DisplayView");

// Only the owner or an Admin may change who can see/edit a display.
app.MapPost("/displays/{id:guid}/permissions", async (Guid id, AclRequest request, ClaimsPrincipal user,
                                                      DisplayDbContext db, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!IsAdmin(user) && !string.Equals(display.OwnerId, PublisherName(user), StringComparison.OrdinalIgnoreCase))
        return Results.Forbid();
    if (request.PrincipalType is not ("user" or "role") || request.Access is not ("read" or "edit")
        || string.IsNullOrWhiteSpace(request.Principal))
        return Results.BadRequest("principalType∈{user,role}, access∈{read,edit}, principal required");

    var acl = new DisplayAcl
    {
        Id = Guid.NewGuid(), DisplayId = id, PrincipalType = request.PrincipalType,
        Principal = request.Principal, Access = request.Access,
        CreatedBy = PublisherName(user), CreatedAt = DateTimeOffset.UtcNow,
    };
    db.DisplayAcls.Add(acl);
    await db.SaveChangesAsync();
    audit.Emit("DISPLAY_SHARED", PublisherName(user), id, display.Name,
        new { request.PrincipalType, request.Principal, request.Access });
    return Results.Ok(new { acl.Id });
}).RequireAuthorization("DisplayEdit");

app.MapDelete("/displays/{id:guid}/permissions/{aclId:guid}", async (Guid id, Guid aclId, ClaimsPrincipal user,
                                                                     DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!IsAdmin(user) && !string.Equals(display.OwnerId, PublisherName(user), StringComparison.OrdinalIgnoreCase))
        return Results.Forbid();
    var acl = await db.DisplayAcls.FirstOrDefaultAsync(a => a.Id == aclId && a.DisplayId == id);
    if (acl is null) return Results.NotFound();
    db.DisplayAcls.Remove(acl);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("DisplayEdit");

// Folder-level grant (inherits to every display in/under the folder). Admin/Engineer only.
app.MapPost("/folders/{id:guid}/permissions", async (Guid id, AclRequest request, ClaimsPrincipal user,
                                                     DisplayDbContext db) =>
{
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id);
    if (folder is null) return Results.NotFound();
    // Only the folder owner or an Admin may grant access — otherwise any editor could grant THEMSELVES
    // edit on a folder and thereby inherit edit on every display under it (privilege escalation).
    if (!IsAdmin(user) && !string.Equals(folder.OwnerId, PublisherName(user), StringComparison.OrdinalIgnoreCase))
        return Results.Forbid();
    if (request.PrincipalType is not ("user" or "role") || request.Access is not ("read" or "edit")
        || string.IsNullOrWhiteSpace(request.Principal))
        return Results.BadRequest("principalType∈{user,role}, access∈{read,edit}, principal required");
    var acl = new DisplayAcl
    {
        Id = Guid.NewGuid(), FolderId = id, PrincipalType = request.PrincipalType,
        Principal = request.Principal, Access = request.Access,
        CreatedBy = PublisherName(user), CreatedAt = DateTimeOffset.UtcNow,
    };
    db.DisplayAcls.Add(acl);
    await db.SaveChangesAsync();
    return Results.Ok(new { acl.Id });
}).RequireAuthorization("DisplayEdit");

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5 — Personal (operator) views: non-versioned, per-user displays
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /me/views — the caller's own views plus views explicitly shared with them.
app.MapGet("/me/views", async (ClaimsPrincipal user, DisplayDbContext db) =>
{
    var who = PublisherName(user);
    var views = await db.PersonalViews
        .Where(v => !v.IsDeleted && (v.UserId == who || (v.IsShared && v.SharedWith.Contains(who))))
        .OrderByDescending(v => v.UpdatedAt)
        .Select(v => new { v.Id, v.Name, v.Description, v.UserId, v.IsShared, v.SourceDisplayId, v.UpdatedAt, mine = v.UserId == who })
        .ToListAsync();
    return Results.Ok(new { total = views.Count, views });
}).RequireAuthorization("DisplayView");

app.MapGet("/me/views/{id:guid}", async (Guid id, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var who = PublisherName(user);
    var v = await db.PersonalViews.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted
        && (x.UserId == who || (x.IsShared && x.SharedWith.Contains(who))));
    if (v is null) return Results.NotFound();
    return Results.Ok(new { v.Id, v.Name, v.Description, v.Width, v.Height, v.BackgroundColor, v.Config, v.SourceDisplayId, v.IsShared, mine = v.UserId == who });
}).RequireAuthorization("DisplayView");

app.MapPost("/me/views", async (PersonalViewRequest request, ClaimsPrincipal user, DisplayDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("name is required");
    var config = request.Config ?? JsonDocument.Parse("{\"items\":[]}");
    // Config-only invariant applies to personal views too (DB trigger enforces; pre-check for a clean 400).
    if (ContainsProcessValues(config))
        return Results.BadRequest("Personal view must not contain process values (CQRS violation)");
    var v = new PersonalView
    {
        Id = Guid.NewGuid(), UserId = PublisherName(user), Name = request.Name, Description = request.Description,
        Width = request.Width ?? 1920, Height = request.Height ?? 1080,
        BackgroundColor = request.BackgroundColor ?? "var(--ams-canvas-bg)",
        Config = config, SourceDisplayId = request.SourceDisplayId,
        CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
    };
    db.PersonalViews.Add(v);
    await db.SaveChangesAsync();
    return Results.Created($"/me/views/{v.Id}", new { v.Id, v.Name });
}).RequireAuthorization("DisplayView");

app.MapPut("/me/views/{id:guid}", async (Guid id, PersonalViewRequest request, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var who = PublisherName(user);
    var v = await db.PersonalViews.FirstOrDefaultAsync(x => x.Id == id && x.UserId == who && !x.IsDeleted);
    if (v is null) return Results.NotFound();
    if (request.Config is not null)
    {
        if (ContainsProcessValues(request.Config))
            return Results.BadRequest("Personal view must not contain process values (CQRS violation)");
        v.Config = request.Config;
    }
    if (request.Name is not null) v.Name = request.Name;
    if (request.Description is not null) v.Description = request.Description;
    if (request.Width.HasValue) v.Width = request.Width.Value;
    if (request.Height.HasValue) v.Height = request.Height.Value;
    if (request.BackgroundColor is not null) v.BackgroundColor = request.BackgroundColor;
    if (request.IsShared.HasValue) v.IsShared = request.IsShared.Value;
    if (request.SharedWith is not null) v.SharedWith = request.SharedWith;
    v.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { v.Id, v.Name, v.UpdatedAt });
}).RequireAuthorization("DisplayView");

app.MapDelete("/me/views/{id:guid}", async (Guid id, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var who = PublisherName(user);
    var v = await db.PersonalViews.FirstOrDefaultAsync(x => x.Id == id && x.UserId == who && !x.IsDeleted);
    if (v is null) return Results.NotFound();
    v.IsDeleted = true;
    v.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("DisplayView");

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5 — Favorites & Recent (server-side; were localStorage/per-browser)
// ══════════════════════════════════════════════════════════════════════════════

app.MapGet("/me/favorites", async (ClaimsPrincipal user, DisplayDbContext db) =>
{
    var who = PublisherName(user);
    var favs = await db.ViewFavorites.Where(f => f.UserId == who)
        .OrderBy(f => f.DisplayOrder).ThenByDescending(f => f.CreatedAt)
        .Select(f => new { f.Id, f.DisplayId, f.PersonalViewId, f.DisplayOrder })
        .ToListAsync();
    return Results.Ok(new { total = favs.Count, favorites = favs });
}).RequireAuthorization("DisplayView");

app.MapPost("/me/favorites", async (FavoriteRequest request, ClaimsPrincipal user, DisplayDbContext db) =>
{
    if ((request.DisplayId is null) == (request.PersonalViewId is null))
        return Results.BadRequest("Provide exactly one of displayId or personalViewId");
    var who = PublisherName(user);
    var exists = await db.ViewFavorites.AnyAsync(f => f.UserId == who
        && f.DisplayId == request.DisplayId && f.PersonalViewId == request.PersonalViewId);
    if (exists) return Results.Ok(new { alreadyFavorite = true });
    var fav = new ViewFavorite
    {
        Id = Guid.NewGuid(), UserId = who, DisplayId = request.DisplayId,
        PersonalViewId = request.PersonalViewId, DisplayOrder = request.DisplayOrder ?? 0,
        CreatedAt = DateTimeOffset.UtcNow,
    };
    db.ViewFavorites.Add(fav);
    await db.SaveChangesAsync();
    return Results.Created($"/me/favorites/{fav.Id}", new { fav.Id });
}).RequireAuthorization("DisplayView");

app.MapDelete("/me/favorites/{id:guid}", async (Guid id, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var who = PublisherName(user);
    var fav = await db.ViewFavorites.FirstOrDefaultAsync(f => f.Id == id && f.UserId == who);
    if (fav is null) return Results.NotFound();
    db.ViewFavorites.Remove(fav);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("DisplayView");

// ── GET /me/recent — most-recently opened displays for the caller. ────────────
app.MapGet("/me/recent", async (ClaimsPrincipal user, DisplayDbContext db, int take = 12) =>
{
    var who = PublisherName(user);
    var recents = await db.RecentDisplays.Where(r => r.UserId == who)
        .OrderByDescending(r => r.AccessedAt)
        .Take(Math.Min(take, 50))
        .Join(db.Displays.Where(d => !d.IsDeleted), r => r.DisplayId, d => d.Id,
            (r, d) => new { d.Id, d.Name, d.Category, d.Level, r.AccessedAt, hasThumbnail = d.ThumbnailSvg != null })
        .ToListAsync();
    return Results.Ok(new { total = recents.Count, recents });
}).RequireAuthorization("DisplayView");

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5 — Version history: full list, snapshot fetch, restore-to-N, comments
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /displays/{id}/versions — the full version list (the detail DTO caps at 5). ─
app.MapGet("/displays/{id:guid}/versions", async (Guid id, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    var versions = await db.DisplayVersions.Where(v => v.DisplayId == id)
        .OrderByDescending(v => v.Version)
        .Select(v => new VersionSummaryDto(v.Id, v.Version, v.Status, v.ChangeNote, v.CreatedBy, v.CreatedAt, v.PublishedAt, v.PublishedBy))
        .ToListAsync();
    return Results.Ok(new { displayId = id, publishedVersion = display.PublishedVersion, draftVersion = display.DraftVersion, versions });
}).RequireAuthorization("DisplayView");

// ── GET /displays/{id}/versions/{n} — a specific snapshot (for diff / preview). ─
app.MapGet("/displays/{id:guid}/versions/{n:int}", async (Guid id, int n, DisplayDbContext db) =>
{
    var v = await db.DisplayVersions.FirstOrDefaultAsync(x => x.DisplayId == id && x.Version == n);
    if (v is null) return Results.NotFound();
    return Results.Ok(new { displayId = id, version = v.Version, status = v.Status, snapshot = v.Snapshot });
}).RequireAuthorization("DisplayView");

// ── POST /displays/{id}/versions/{n}/restore — copy an ARBITRARY prior version into a new draft.
// Append-only (like /revert): history is never rewritten. Unlike /revert (published-only), this can
// restore any version, e.g. to roll back a bad publish to a known-good older one.
app.MapPost("/displays/{id:guid}/versions/{n:int}/restore", async (Guid id, int n, ClaimsPrincipal user,
                                                                   DisplayDbContext db, IConnectionMultiplexer redis, AuditEmitter audit) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (!await CanEditDisplayAsync(db, user, display)) return Results.Forbid();
    var source = await db.DisplayVersions.FirstOrDefaultAsync(v => v.DisplayId == id && v.Version == n);
    if (source is null) return Results.NotFound($"Version {n} not found");

    display.DraftVersion++;
    display.UpdatedAt = DateTimeOffset.UtcNow;
    var restored = new DisplayVersion
    {
        Id = Guid.NewGuid(), DisplayId = id, Version = display.DraftVersion,
        Snapshot = JsonDocument.Parse(source.Snapshot.RootElement.GetRawText()),
        Status = "draft", ChangeNote = $"Restored from v{n}",
        CreatedBy = PublisherName(user), CreatedAt = DateTimeOffset.UtcNow,
    };
    db.DisplayVersions.Add(restored);
    await db.SaveChangesAsync();
    await PublishDisplayEvent(redis, "display.version.restored", id, display.Name);
    audit.Emit("DISPLAY_VERSION_RESTORED", PublisherName(user), id, display.Name, new { restoredFrom = n, newDraft = restored.Version });
    return Results.Ok(new { displayId = id, restoredFrom = n, draftVersion = restored.Version });
}).RequireAuthorization("DisplayEdit");

app.MapGet("/displays/{id:guid}/comments", async (Guid id, DisplayDbContext db) =>
{
    var comments = await db.DisplayComments.Where(c => c.DisplayId == id)
        .OrderByDescending(c => c.CreatedAt)
        .Select(c => new { c.Id, c.Version, c.Author, c.Body, c.CreatedAt })
        .ToListAsync();
    return Results.Ok(new { total = comments.Count, comments });
}).RequireAuthorization("DisplayView");

app.MapPost("/displays/{id:guid}/comments", async (Guid id, CommentRequest request, ClaimsPrincipal user, DisplayDbContext db) =>
{
    var display = await db.Displays.FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted);
    if (display is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.Body)) return Results.BadRequest("body is required");
    var comment = new DisplayComment
    {
        Id = Guid.NewGuid(), DisplayId = id, Version = request.Version,
        Author = PublisherName(user), Body = request.Body, CreatedAt = DateTimeOffset.UtcNow,
    };
    db.DisplayComments.Add(comment);
    await db.SaveChangesAsync();
    return Results.Created($"/displays/{id}/comments/{comment.Id}", new { comment.Id });
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

/// <summary>Mirror of the CQRS config-only guard used for display snapshots (returns true if forbidden).</summary>
static bool ContainsProcessValues(JsonDocument doc)
{
    var json = doc.RootElement.GetRawText();
    string[] forbidden = { "\"currentValue\"", "\"processValue\"", "\"liveValue\"", "\"realTimeValue\"" };
    return forbidden.Any(t => json.Contains(t, StringComparison.Ordinal));
}

/// <summary>The caller's platform role ("Admin"/"Engineer"/"Operator"/"Viewer").</summary>
static string RoleOf(ClaimsPrincipal user) =>
    user.FindFirst("role")?.Value ?? user.FindFirst(ClaimTypes.Role)?.Value ?? "";

/// <summary>Admins govern everything and bypass ownership/ACL checks.</summary>
static bool IsAdmin(ClaimsPrincipal user) =>
    string.Equals(RoleOf(user), "Admin", StringComparison.OrdinalIgnoreCase);

/// <summary>
/// A display's folder and every ancestor folder, so an ACL granted on a parent folder inherits down.
/// Guarded against cycles.
/// </summary>
static async Task<List<Guid>> FolderChainAsync(DisplayDbContext db, Guid? folderId)
{
    var chain = new List<Guid>();
    var current = folderId;
    var guard = 0;
    while (current is Guid id && guard++ < 64)
    {
        chain.Add(id);
        current = await db.Folders.Where(f => f.Id == id).Select(f => f.ParentId).FirstOrDefaultAsync();
    }
    return chain;
}

/// <summary>
/// Server-side edit authorization (Phase 5, R9/R15/R18): a mutation is allowed only if the caller owns
/// the display, is an Admin, or holds an explicit "edit" grant on the display or one of its ancestor
/// folders. UI hiding is not enforcement — this is the boundary that actually holds.
/// </summary>
static async Task<bool> CanEditDisplayAsync(DisplayDbContext db, ClaimsPrincipal user, Display display)
{
    if (IsAdmin(user)) return true;
    var who = PublisherName(user);
    if (string.Equals(display.OwnerId, who, StringComparison.OrdinalIgnoreCase)) return true;
    var role = RoleOf(user);
    var folders = await FolderChainAsync(db, display.FolderId);
    return await db.DisplayAcls.AnyAsync(a =>
        a.Access == "edit" &&
        ((a.PrincipalType == "user" && a.Principal == who) ||
         (a.PrincipalType == "role" && a.Principal == role)) &&
        (a.DisplayId == display.Id || (a.FolderId != null && folders.Contains(a.FolderId.Value))));
}

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
    short? Level, bool HasThumbnail, Guid? FolderId, string[] Tags);

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

record MediaUploadRequest(string ContentType, string DataBase64, string? FileName);

record CreateDisplayRequest(
    string Name, string? Category, string? Description, string? HierarchyPath,
    int? Width, int? Height, string? BackgroundColor, string? OwnerId, short? Level,
    Guid? FolderId, string[]? Tags);

record UpdateDisplayRequest(
    string? Name, string? Category, string? Description, string? HierarchyPath,
    int? Width, int? Height, string? BackgroundColor, short? Level,
    Guid? FolderId, string[]? Tags);

record SaveContentRequest(JsonDocument? Snapshot, string? ChangeNote, string? UserId);

record PublishRequest(string? ChangeNote);

// ── Phase 5 governance DTOs ────────────────────────────────────────────────────
record FolderRequest(string Name, Guid? ParentId);

record AclRequest(string PrincipalType, string Principal, string Access);

record PersonalViewRequest(
    string? Name, string? Description, int? Width, int? Height, string? BackgroundColor,
    JsonDocument? Config, Guid? SourceDisplayId, bool? IsShared, string[]? SharedWith);

record FavoriteRequest(Guid? DisplayId, Guid? PersonalViewId, int? DisplayOrder);

record CommentRequest(int? Version, string Body);
