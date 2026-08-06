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

builder.Services.AddControllers();

// ── Auth (platform RBAC): RS256 JWKS + one policy per permission key ───────
// analytics.view / cpm.manage / system.manage ride Perms.All in the shared
// TraverseAuth module (synced by scripts/sync-auth-module.ps1).
builder.AddTraverseAuth();

var app = builder.Build();

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
app.MapGet("/health", async (NpgsqlDataSource ds) =>
{
    try
    {
        await using var conn = await ds.OpenConnectionAsync();
        await using var cmd = conn.CreateCommand();
        // Not SELECT 1: prove we are in the RIGHT database, not just A database.
        cmd.CommandText = "SELECT current_database()";
        var db = (string?)await cmd.ExecuteScalarAsync();
        return db == "traverse_cplm"
            ? Results.Json(new { status = "Healthy", database = db })
            : Results.Json(new { status = "Unhealthy", error = $"connected to '{db}', expected traverse_cplm" }, statusCode: 503);
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "Unhealthy", error = ex.Message }, statusCode: 503);
    }
});

app.Run();
