using AMS.HistorianBff;
using StackExchange.Redis;
using System.Security.Claims;
using System.Text.Json;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────
builder.Services.AddHttpClient<IoTDbClient>();

// Redis — used by /snapshot endpoint
var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
// RS256 bearer validation against auth-service JWKS + a policy per permission key.
// Internal callers (e.g. binding-resolver → asset-model) authenticate with X-Service-Key.
builder.AddTraverseAuth();

var app = builder.Build();

app.UseTraverseAuth();

// ── GET /health ─────────────────────────────────────────────────────────────
// Returns JSON for Edge Node Monitor / observability (default MapHealthChecks writes plain text).
app.MapGet("/health", async (
    IoTDbClient iotdb,
    IConnectionMultiplexer redis,
    CancellationToken ct) =>
{
    var checks = new Dictionary<string, object>();
    var iotdbStatus = "Healthy";
    var redisStatus = "Healthy";

    try
    {
        await iotdb.QueryAsync("SHOW VERSION", ct);
        checks["iotdb"] = new { status = "Healthy", description = "IoTDB REST query OK" };
    }
    catch (Exception ex)
    {
        iotdbStatus = "Unhealthy";
        checks["iotdb"] = new { status = "Unhealthy", description = ex.Message };
    }

    try
    {
        var db = redis.GetDatabase();
        var latency = await db.PingAsync();
        checks["redis"] = new { status = "Healthy", description = $"PING {latency.TotalMilliseconds:F1} ms" };
    }
    catch (Exception ex)
    {
        redisStatus = "Unhealthy";
        checks["redis"] = new { status = "Unhealthy", description = ex.Message };
    }

    var overall = iotdbStatus == "Healthy" && redisStatus == "Healthy" ? "Healthy" : "Degraded";
    var body = new { status = overall, iotdb = iotdbStatus, redis = redisStatus, checks };

    return overall == "Healthy"
        ? Results.Json(body)
        : Results.Json(body, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// ── GET /trend ─────────────────────────────────────────────────────────────
// Returns decimated time-series points (≤ width points) for a given series + window.
// Query params: series, start (ISO-8601), end (ISO-8601), width (px), measurements (csv)
app.MapGet("/trend", async (
    string series,
    DateTimeOffset start,
    DateTimeOffset end,
    int width,
    string? measurements,
    // Opt-in so existing consumers (Designer, TrendCore, TimeSeriesTable,
    // TableSymbol) keep their current response shape unchanged.
    bool? envelope,
    ClaimsPrincipal user,
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(series))
        return Results.BadRequest("'series' is required");
    if (!AssetScope.SeriesInScope(user, series))
        return Results.Forbid();
    if (end <= start)
        return Results.BadRequest("'end' must be after 'start'");
    if (series.Contains('*'))
        return Results.BadRequest("'series' must be a concrete device path for GROUP BY trend (use /series to list devices)");
    if (!IoTDbClient.IsValidSeries(series))
        return Results.BadRequest("'series' must be a valid IoTDB path (root.<segment>[.<segment>...])");
    if (!IoTDbClient.IsValidMeasurements(measurements))
        return Results.BadRequest("'measurements' must be a comma-separated list of bare identifiers");

    width = Math.Clamp(width, 10, 2000);

    var wantEnvelope = envelope ?? false;
    var sql    = iotdb.BuildTrendSql(series, start, end, width, measurements ?? "", wantEnvelope);
    var result = await iotdb.QueryAsync(sql, ct);
    var points = IoTDbClient.MapPoints(result);

    return Results.Ok(new { series, start, end, width, envelope = wantEnvelope, points });
}).RequireAuthorization("historian.view");

// ── GET /raw ───────────────────────────────────────────────────────────────
// Returns raw (non-decimated) records. maxCount capped at 10 000.
app.MapGet("/raw", async (
    string series,
    DateTimeOffset start,
    DateTimeOffset end,
    int maxCount,
    int offset,
    string? measurements,
    ClaimsPrincipal user,
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(series))
        return Results.BadRequest("'series' is required");
    if (!AssetScope.SeriesInScope(user, series))
        return Results.Forbid();
    if (series.Contains('*'))
        return Results.BadRequest("'series' must be a concrete device path (wildcards are not supported for /raw)");
    if (!IoTDbClient.IsValidSeries(series))
        return Results.BadRequest("'series' must be a valid IoTDB path (root.<segment>[.<segment>...])");
    if (!IoTDbClient.IsValidMeasurements(measurements))
        return Results.BadRequest("'measurements' must be a comma-separated list of bare identifiers");

    maxCount = Math.Clamp(maxCount, 1, 500);
    offset   = Math.Max(0, offset);
    var sql    = iotdb.BuildRawSql(series, start, end, maxCount, offset, measurements ?? "");
    var result = await iotdb.QueryAsync(sql, ct);
    var points = IoTDbClient.MapPoints(result);

    return Results.Ok(new {
        series, start, end, maxCount, offset,
        count = points.Count,
        hasMore = points.Count == maxCount,
        points,
    });
}).RequireAuthorization("historian.view");

// ── GET /summary ─────────────────────────────────────────────────────────────
// Aggregate summary of one measurement over a window (min/max/avg/total/count) for table summary
// columns. Query params: series, start, end, measurement.
app.MapGet("/summary", async (
    string series,
    DateTimeOffset start,
    DateTimeOffset end,
    string measurement,
    ClaimsPrincipal user,
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(series)) return Results.BadRequest("'series' is required");
    if (!AssetScope.SeriesInScope(user, series)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(measurement)) return Results.BadRequest("'measurement' is required");
    if (end <= start) return Results.BadRequest("'end' must be after 'start'");
    if (!IoTDbClient.IsValidSeries(series))
        return Results.BadRequest("'series' must be a valid IoTDB path (root.<segment>[.<segment>...])");
    if (!IoTDbClient.IsValidMeasurements(measurement))
        return Results.BadRequest("'measurement' must be a bare identifier");

    var sql = iotdb.BuildSummarySql(series, start, end, measurement);
    var result = await iotdb.QueryAsync(sql, ct);

    double? At(int i)
    {
        if (!result.TryGetProperty("values", out var vals) || vals.ValueKind != System.Text.Json.JsonValueKind.Array)
            return null;
        var cols = vals.EnumerateArray().ToList();
        if (i >= cols.Count) return null;
        var col = cols[i].EnumerateArray().ToList();
        if (col.Count == 0) return null;
        return col[0].ValueKind == System.Text.Json.JsonValueKind.Number ? col[0].GetDouble() : (double?)null;
    }

    return Results.Ok(new
    {
        series, measurement, start, end,
        min = At(0), max = At(1), avg = At(2), total = At(3), count = At(4),
    });
}).RequireAuthorization("historian.view");

// ── GET /snapshot ──────────────────────────────────────────────────────────
// Returns current metric values from Redis for one or more assets (device IDs).
// Query params: assets (comma-separated device names, or "*" for all devices)
// Redis key: snapshot:metric:ams_site1:ams_edge1:<device>:<metricName>
app.MapGet("/snapshot", async (
    string assets,
    ClaimsPrincipal user,
    IConnectionMultiplexer redis,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(assets))
        return Results.BadRequest("'assets' is required");

    // Phase 7 (R17) — a scoped user must not receive the live-value firehose for out-of-scope sites.
    // Snapshot keys carry the Sparkplug group (site) at position 2; filter results to allowed sites.
    var siteTokens = AssetScope.SiteTokens(user);
    bool GroupAllowed(string group) => siteTokens.Length == 0
        || siteTokens.Any(t => group.Contains(t, StringComparison.OrdinalIgnoreCase));

    var assetList = assets.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    var db        = redis.GetDatabase();
    // Multi-site: scan across ALL sparkplug groups/edges. Snapshot keys are
    // snapshot:metric:<group>:<edge>:<device>:<metric>; device is unique per site
    // in the seeded model, so we match on device position rather than a fixed site.
    var server    = redis.GetServer(redis.GetEndPoints().First());
    var result    = new Dictionary<string, Dictionary<string, object?>>();

    async Task AddKeyAsync(RedisKey key, string deviceId)
    {
        if (!result.TryGetValue(deviceId, out var assetMetrics))
        {
            assetMetrics = new Dictionary<string, object?>();
            result[deviceId] = assetMetrics;
        }

        var metricName = ((string)key!).Split(':').Last();
        var val        = await db.StringGetAsync(key);
        if (val.IsNullOrEmpty) return;
        try
        {
            assetMetrics[metricName] = JsonSerializer.Deserialize<JsonElement>(val!);
        }
        catch
        {
            assetMetrics[metricName] = (string?)val;
        }
    }

    if (assetList.Length == 1 && assetList[0] == "*")
    {
        // Discover all devices across every Sparkplug group/edge
        var pattern = "snapshot:metric:*";
        foreach (var key in server.Keys(pattern: pattern))
        {
            var parts = ((string)key!).Split(':');
            if (parts.Length < 6) continue;
            if (!GroupAllowed(parts[2])) continue;   // parts[2] = sparkplug group (site)
            await AddKeyAsync(key, parts[4]); // parts[4] = device
        }
    }
    else
    {
        foreach (var asset in assetList)
        {
            var safeAsset = asset.Replace(" ", "_");
            // group/edge wildcarded — device is the discriminator
            var pattern   = $"snapshot:metric:*:*:{safeAsset}:*";
            foreach (var key in server.Keys(pattern: pattern))
            {
                var parts = ((string)key!).Split(':');
                if (parts.Length < 6 || !GroupAllowed(parts[2])) continue;
                await AddKeyAsync(key, safeAsset);
            }
        }
    }

    return Results.Ok(new { assets = result });
}).RequireAuthorization("historian.view");

// ── GET /series ────────────────────────────────────────────────────────────
// Lists available time-series paths (for UI auto-complete).
app.MapGet("/series", async (
    string? prefix,
    ClaimsPrincipal user,
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    // The prefix is interpolated into IoTDB SQL — restrict it to a safe path charset (letters, digits,
    // '_', '.', and the '*'/'**' wildcards) so it can't inject SHOW-clause syntax.
    if (!string.IsNullOrWhiteSpace(prefix) && !System.Text.RegularExpressions.Regex.IsMatch(prefix, @"^[A-Za-z0-9_.*]+$"))
        return Results.BadRequest("'prefix' must be a valid IoTDB path prefix");
    // A scoped user may only enumerate series under an allowed prefix.
    if (!string.IsNullOrWhiteSpace(prefix) && !AssetScope.SeriesInScope(user, prefix))
        return Results.Forbid();

    // Use ** to match all descendant levels — measurements are stored one level
    // deeper than the device path (e.g. root.ams.site1.alarms.<device>.severity).
    var path   = string.IsNullOrWhiteSpace(prefix) ? "root.ams.site1.alarms.**" : prefix;
    var sql    = $"SHOW TIMESERIES {path}";
    var result = await iotdb.QueryAsync(sql, ct);
    return Results.Ok(result);
}).RequireAuthorization("historian.view");

app.Run();

// ── Phase 7 (R17) — asset-scoped authorization ────────────────────────────────
static class AssetScope
{
    /// <summary>
    /// A caller may query a historian series only if it falls under one of the token's <c>assetScope</c>
    /// prefixes. Scope prefixes are UNS paths ("site/unit"); an IoTDB series is dotted with a "root."
    /// prefix ("root.site.unit.device"), so each scope is normalised to "root.site.unit" before the
    /// prefix check. No scope claim = unrestricted (opt-in per user).
    /// </summary>
    public static bool SeriesInScope(ClaimsPrincipal user, string series)
    {
        var scopes = user.FindAll("assetScope").Select(c => c.Value)
            .Where(s => !string.IsNullOrWhiteSpace(s)).ToArray();
        if (scopes.Length == 0) return true;
        return scopes.Any(s =>
        {
            var iot = "root." + s.Trim().TrimEnd('/').Replace('/', '.');
            return series.Equals(iot, StringComparison.OrdinalIgnoreCase)
                || series.StartsWith(iot + ".", StringComparison.OrdinalIgnoreCase);
        });
    }

    /// <summary>
    /// The site (first path segment) of each scope prefix — used to filter Redis snapshot keys, whose
    /// Sparkplug group encodes the site (e.g. "ams_site1"). Empty = unrestricted.
    /// </summary>
    public static string[] SiteTokens(ClaimsPrincipal user) =>
        user.FindAll("assetScope").Select(c => c.Value)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim().TrimStart('/').Split('/')[0])
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct().ToArray();
}
