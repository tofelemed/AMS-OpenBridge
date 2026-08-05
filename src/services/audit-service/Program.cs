using AMS.AuditService.Archival;
using AMS.AuditService.Consumers;
using AMS.AuditService.Hashing;
using AMS.AuditService.Persistence;
using AMS.AuditService.Verification;
using Microsoft.EntityFrameworkCore;
using Prometheus;
using Serilog;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

var connectionString = builder.Configuration.GetConnectionString("AuditDb");

// Add DB Context
builder.Services.AddDbContext<AuditDbContext>(options =>
    options.UseNpgsql(connectionString));

// Add Core Services
builder.Services.AddSingleton<AuditHashChainService>();
builder.Services.AddScoped<ImmutableAuditRepository>();
builder.Services.AddScoped<ChainIntegrityVerifier>();

// Add Background Workers
builder.Services.AddHostedService<AuditEventConsumer>();
// WORM archival to S3 is OPT-IN: AmazonS3Client() throws at construction when no AWS region/endpoint is
// configured, so a stack without object storage (dev/compose) would crash-loop. Only run the archiver
// when S3 is actually configured; the immutable hash-chained store + audit query work without it.
var s3Configured = !string.IsNullOrWhiteSpace(builder.Configuration["S3:AuditBucket"])
    || !string.IsNullOrWhiteSpace(builder.Configuration["AWS:Region"])
    || !string.IsNullOrWhiteSpace(builder.Configuration["AWS_REGION"]);
if (s3Configured)
    builder.Services.AddHostedService<WormArchiveWriter>();

// Add basic healthcheck and metrics API
builder.Services.AddHealthChecks();

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
builder.AddTraverseAuth();

var app = builder.Build();

// Run migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
    db.Database.EnsureCreated(); // Use EnsureCreated for scaffolding, normally you'd use Migrate()
}

app.UseRouting();
app.UseTraverseAuth();
app.UseHttpMetrics();

app.MapMetrics();
app.MapHealthChecks("/health");

// HTTP endpoint to manually trigger a full chain cryptographic verification
app.MapPost("/api/v1/audit/verify", async (ChainIntegrityVerifier verifier, CancellationToken ct) =>
{
    var isValid = await verifier.VerifyFullChainAsync(ct);
    return isValid ? Results.Ok("Chain verified. No tampering detected.") : Results.Problem("CHAIN TAMPERING DETECTED.");
}).RequireAuthorization("admin.audit.view");

// One-time migration: rows hashed before the canonical-JSON fix can never verify
// (jsonb rewrote their preimage). Recomputes the chain under the current
// algorithm; safe to call again (idempotent — rehashed count will be 0).
app.MapPost("/api/v1/audit/rechain", async (ChainIntegrityVerifier verifier, CancellationToken ct) =>
{
    var (total, rehashed) = await verifier.RechainAsync(ct);
    return Results.Ok(new { total, rehashed, note = "Chain recomputed under the canonical hash algorithm." });
}).RequireAuthorization("admin.audit.view");

// ── GET /api/v1/audit — query the immutable audit trail (Phase 5). ────────────
// Filter by entity (e.g. entityType=Display, entityId=<guid>), actor, event type, and time window.
// This is what surfaces "who changed this display, and when" now that display-service emits governance
// events onto the audit-events topic. Read-only; the store itself is append-only + hash-chained.
app.MapGet("/api/v1/audit", async (
    AuditDbContext db,
    string? entityType,
    string? entityId,
    string? userId,
    string? eventType,
    DateTimeOffset? from,
    DateTimeOffset? to,
    int take = 100) =>
{
    var q = db.AuditEvents.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(entityType)) q = q.Where(e => e.EntityType == entityType);
    if (!string.IsNullOrWhiteSpace(entityId))   q = q.Where(e => e.EntityId == entityId);
    if (!string.IsNullOrWhiteSpace(userId))      q = q.Where(e => e.UserId == userId);
    if (!string.IsNullOrWhiteSpace(eventType))   q = q.Where(e => e.EventType == eventType);
    if (from.HasValue) q = q.Where(e => e.TimestampUtc >= from.Value);
    if (to.HasValue)   q = q.Where(e => e.TimestampUtc <= to.Value);

    var total = await q.CountAsync();
    var events = await q
        .OrderByDescending(e => e.TimestampUtc)
        .Take(Math.Clamp(take, 1, 500))
        .Select(e => new
        {
            e.EventId, e.TimestampUtc, e.EventType, e.UserId,
            e.EntityType, e.EntityId, e.CorrelationId, e.CurrentHash
        })
        .ToListAsync();

    return Results.Ok(new { total, count = events.Count, events });
}).RequireAuthorization("admin.audit.view");

app.Run();
