using Npgsql;
using Prometheus;
using Traverse.Auth;

// ═══════════════════════════════════════════════════════════════════════════
// cplm-api — Control Loop Performance Monitoring service (extraction Phase 2).
//
// Phase 2 is the skeleton: auth, data source, health, metrics — deployed and
// healthy but serving no domain traffic. The CPLM controllers arrive in
// Phase 3 (reads) and the Kafka result consumers in Phase 4 (hard cutover —
// see docs/cplm-intake/cplm-service-extraction-plan.md before touching them).
// ═══════════════════════════════════════════════════════════════════════════

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── Database: traverse_cplm (one logical database per service) ─────────────
// Required, no fallback: a silent default pointing anywhere else would write
// to the wrong database without ever logging an error.
var connStr = config.GetConnectionString("CplmDb")
    ?? throw new InvalidOperationException("CplmDb connection string is required (traverse_cplm database)");
var dataSource = new NpgsqlDataSourceBuilder(connStr)
    .EnableDynamicJson()
    .Build();
builder.Services.AddSingleton(dataSource);
// The controllers copied from AMS.Api inject [FromKeyedServices("cplm")]
// (Phase 1 wiring). Register the same source under that key so the files stay
// byte-close to the originals until Phase 6 deletes them there.
builder.Services.AddKeyedSingleton("cplm", dataSource);

// ── HTTP control plane ─────────────────────────────────────────────────────
// asset-model: peer-link projection at onboarding (service-principal call).
builder.Services.AddHttpClient("AssetModel", client =>
{
    client.BaseAddress = new Uri(config["Cpm:AssetModelUrl"] ?? "http://asset-model:5000");
    client.Timeout = TimeSpan.FromSeconds(15);
    var serviceKey = config["Auth:ServiceKey"];
    if (!string.IsNullOrEmpty(serviceKey))
        client.DefaultRequestHeaders.Add(TraverseAuthExtensions.ServiceKeyHeader, serviceKey);
});
// Flink REST: A8 recompute submission + pipeline status/metrics proxies.
builder.Services.AddHttpClient("Flink", client =>
{
    client.BaseAddress = new Uri(config["Cpm:FlinkUrl"] ?? "http://flink-jobmanager:8081");
    client.Timeout = TimeSpan.FromSeconds(30);
});

// JSON options MUST match AMS.Api exactly (camelCase, omit nulls, enums as
// strings) — the Phase 3 exit gate is a byte-identical response diff, and the
// first run failed on exactly this: golden omits null fields, defaults don't.
builder.Services.AddControllers().AddJsonOptions(opt =>
{
    opt.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    opt.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    opt.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

// ── CPLM domain services (Phase 3 read path) ───────────────────────────────
builder.Services.Configure<Traverse.CplmApi.Services.CpmRegistryOptions>(
    config.GetSection(Traverse.CplmApi.Services.CpmRegistryOptions.SectionName));
builder.Services.AddSingleton<Traverse.CplmApi.Services.ICpmLoopRegistryService,
    Traverse.CplmApi.Services.CpmLoopRegistryService>();
builder.Services.Configure<Traverse.CplmApi.Services.CplmRecomputeOptions>(
    config.GetSection(Traverse.CplmApi.Services.CplmRecomputeOptions.SectionName));
builder.Services.AddSingleton<Traverse.CplmApi.Services.ICplmRecomputeService,
    Traverse.CplmApi.Services.CplmRecomputeService>();
builder.Services.AddSingleton<Traverse.CplmApi.Services.ICplmAuditEmitter,
    Traverse.CplmApi.Services.CplmAuditEmitter>();

// ── CPLM write path (Phase 4 — the hard cutover) ───────────────────────────
// Both consumers use the SAME group ids as their AMS.Api originals so committed
// offsets carry over. Two processes in one group would split partitions and
// each persist half the windows with no error anywhere — the flag makes the
// cutover an env flip on each side, ordered: AMS.Api off → zero members
// confirmed → this on. Default OFF: a freshly deployed cplm-api must never
// steal partitions from a still-consuming AMS.Api.
builder.Services.Configure<Traverse.CplmApi.Infrastructure.KafkaOptions>(
    config.GetSection("Kafka"));
builder.Services.Configure<Traverse.CplmApi.Services.IotDbWriteOptions>(
    config.GetSection(Traverse.CplmApi.Services.IotDbWriteOptions.SectionName));
builder.Services.AddHttpClient("IotDbWrite");
builder.Services.AddSingleton<Traverse.CplmApi.Services.IotDbWriteClient>();
builder.Services.Configure<Traverse.CplmApi.BackgroundServices.CplmOptions>(
    config.GetSection(Traverse.CplmApi.BackgroundServices.CplmOptions.SectionName));
// P3-11: always registered so /health can tell "consumers disabled by config"
// apart from "consumers enabled but silent".
builder.Services.AddSingleton<Traverse.CplmApi.Services.ConsumerHeartbeat>();
if (config.GetValue("Cplm:ConsumersEnabled", false))
{
    builder.Services.AddHostedService<Traverse.CplmApi.BackgroundServices.CplmResultConsumerService>();
    builder.Services.AddHostedService<Traverse.CplmApi.BackgroundServices.CplmEventFrameService>();
}

// ── Auth (platform RBAC): RS256 JWKS + one policy per permission key ───────
// analytics.view / cpm.manage / system.manage ride Perms.All in the shared
// TraverseAuth module (synced by scripts/sync-auth-module.ps1).
builder.AddTraverseAuth();

var app = builder.Build();

// ── Phase 3 gate: reads only ───────────────────────────────────────────────
// The mutation endpoints exist in the copied controllers, but until Phase 5
// the frontend still writes through AMS.Api — two live write paths would mean
// two audit trails and two evidence publishers for the same click. 503 (not
// 404/405) so a misrouted caller sees "temporarily not here", which is true.
if (!config.GetValue("Cpm:EnableMutations", false))
{
    app.Use(async (ctx, next) =>
    {
        var m = ctx.Request.Method;
        if (ctx.Request.Path.StartsWithSegments("/api")
            && !HttpMethods.IsGet(m) && !HttpMethods.IsHead(m) && !HttpMethods.IsOptions(m))
        {
            ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await ctx.Response.WriteAsJsonAsync(new
            {
                error = "CPLM mutations are served by AMS.Api until extraction Phase 5",
                enableWith = "Cpm__EnableMutations=true"
            });
            return;
        }
        await next();
    });
}

app.UseTraverseAuth();
app.MapControllers();
app.UseHttpMetrics();
app.MapMetrics();

// ── GET /authcheck — proves the RS256/JWKS + policy chain end to end ───────
// The skeleton has no domain routes yet, and an unmapped route 404s for
// everyone, which proves nothing. This stays useful after Phase 3 as a cheap
// "is auth wired" probe: 401 without a token, 200 with analytics.view.
app.MapGet("/authcheck", (System.Security.Claims.ClaimsPrincipal user) => Results.Json(new
{
    user = user.FindFirst("preferred_username")?.Value,
    permissions = user.FindAll("permission").Count(),
})).RequireAuthorization(Perms.AnalyticsView);

// ── GET /health — liveness + the one dependency that must never be wrong ───
// P3-11: also surfaces both Kafka consumers. A stalled/missing consumer makes
// the status "Degraded" but still HTTP 200 — the container healthcheck must
// not restart-loop the read API because Kafka wobbled; 503 stays DB-only.
var cplmConsumersEnabled = config.GetValue("Cplm:ConsumersEnabled", false);
app.MapGet("/health", async (NpgsqlDataSource ds, Traverse.CplmApi.Services.ConsumerHeartbeat beats) =>
{
    try
    {
        await using var conn = await ds.OpenConnectionAsync();
        await using var cmd = conn.CreateCommand();
        // Not SELECT 1: prove we are in the RIGHT database, not just A database.
        cmd.CommandText = "SELECT current_database()";
        var db = (string?)await cmd.ExecuteScalarAsync();
        if (db != "traverse_cplm")
            return Results.Json(new { status = "Unhealthy", error = $"connected to '{db}', expected traverse_cplm" }, statusCode: 503);

        (string State, string? Phase, double? AgeSeconds) ConsumerState(string name)
        {
            if (!cplmConsumersEnabled) return ("DISABLED_BY_CONFIG", null, null);
            var b = beats.Get(name);
            if (b == null) return ("NEVER_STARTED", null, null);
            var age = (DateTimeOffset.UtcNow - b.Value.At).TotalSeconds;
            // Poll cycle is 500 ms; 60 s of silence means the loop is wedged.
            return (age > 60 ? "STALLED" : "RUNNING", b.Value.Phase, Math.Round(age, 1));
        }

        var r = ConsumerState("results");
        var f = ConsumerState("frames");
        var results = new { state = r.State, phase = r.Phase, heartbeatAgeSeconds = r.AgeSeconds };
        var frames = new { state = f.State, phase = f.Phase, heartbeatAgeSeconds = f.AgeSeconds };
        var degraded = r.State is "STALLED" or "NEVER_STARTED" || f.State is "STALLED" or "NEVER_STARTED";
        return Results.Json(new
        {
            status = degraded ? "Degraded" : "Healthy",
            database = db,
            consumers = new { enabled = cplmConsumersEnabled, results, frames }
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "Unhealthy", error = ex.Message }, statusCode: 503);
    }
});

app.Run();
