using AMS.HistorianBff;
using Microsoft.Extensions.Caching.Memory;
using Prometheus;
using StackExchange.Redis;
using System.Security.Claims;
using System.Text.Json;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────
// RES-01: retry + circuit breaker + timeout on every outbound HttpClient in this service.
builder.Services.ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler());

builder.Services.AddHttpClient<IoTDbClient>();
// Keeps IoTDB's query/aggregation engine warm so the first trend query on the
// Historical / Trend page isn't a cold ~2s hit (SHOW VERSION health probes only
// warm the connection, not the data path). See IoTDbWarmupService.
builder.Services.AddHostedService<IoTDbWarmupService>();
// DATA-09: 2s burst cache for /snapshot results.
builder.Services.AddMemoryCache();

// Redis (CONTRACT tier — snapshot keys, DATA-03) — used by /snapshot endpoint
var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false{(string.IsNullOrEmpty(builder.Configuration["Redis:Password"]) ? "" : $",password={builder.Configuration["Redis:Password"]}")}"));

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
// RS256 bearer validation against auth-service JWKS + a policy per permission key.
// Internal callers (e.g. binding-resolver → asset-model) authenticate with X-Service-Key.
builder.AddTraverseAuth();

var app = builder.Build();

app.UseTraverseAuth();

// OPS-01: request-duration histograms per endpoint — trend p95 comes from here.
app.UseHttpMetrics();
app.MapMetrics();

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

// ── GET /raw/cursor ────────────────────────────────────────────────────────
// Cursor-paged raw read for evidence replay (Phase 6.5). Pass the returned
// nextCursor back to fetch the next page. Unlike OFFSET paging this costs the
// same per page over an 86 400-row day, and cannot skip or repeat a row when
// data lands mid-walk.
app.MapGet("/raw/cursor", async (
    string series,
    DateTimeOffset start,
    DateTimeOffset end,
    int maxCount,
    long? cursor,
    string? measurements,
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
    if (!IoTDbClient.IsValidSeries(series))
        return Results.BadRequest("'series' must be a valid IoTDB path (root.<segment>[.<segment>...])");
    if (!IoTDbClient.IsValidMeasurements(measurements))
        return Results.BadRequest("'measurements' must be a comma-separated list of bare identifiers");

    maxCount = Math.Clamp(maxCount <= 0 ? 1000 : maxCount, 1, 10_000);

    var sql    = iotdb.BuildRawCursorSql(series, start, end, maxCount, cursor, measurements ?? "");
    var result = await iotdb.QueryAsync(sql, ct);
    var points = IoTDbClient.MapPoints(result);

    long? nextCursor = points.Count == maxCount && points.Count > 0
        ? Convert.ToInt64(points[^1]["ts"])
        : null;

    return Results.Ok(new {
        series, start, end, maxCount,
        count  = points.Count,
        cursor,
        // null means the walk is complete - callers should stop, not retry.
        nextCursor,
        hasMore = nextCursor is not null,
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
// Query params: assets (comma-separated device names, or "*" for all devices);
//               limit/offset page over the device list (deterministic order).
// Redis key: snapshot:metric:ams_site1:ams_edge1:<device>:<metricName>
//
// DATA-09: this endpoint used to run a keyspace SCAN plus one GET per key on
// EVERY request — the shift-change hot path (~4,000 reads). It now serves from
// the snapshot index the edge node maintains on write:
//   snapshot:devices          SET of device ids
//   snapshot:index:<device>   SET of that device's full snapshot keys
// Reads are SMEMBERS + one batched MGET per device; index entries whose key has
// expired (TTL) are pruned lazily. A 2-second in-memory result cache absorbs
// request bursts (shift change: every console repainting at once).
app.MapGet("/snapshot", async (
    string assets,
    int? limit,
    int? offset,
    ClaimsPrincipal user,
    IConnectionMultiplexer redis,
    Microsoft.Extensions.Caching.Memory.IMemoryCache cache,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(assets))
        return Results.BadRequest("'assets' is required");

    // Phase 7 (R17) — a scoped user must not receive the live-value firehose for out-of-scope sites.
    var siteTokens = AssetScope.SiteTokens(user);
    bool GroupAllowed(string group) => siteTokens.Length == 0
        || siteTokens.Any(t => group.Contains(t, StringComparison.OrdinalIgnoreCase));

    var take = Math.Clamp(limit ?? 500, 1, 2000);
    var skip = Math.Max(offset ?? 0, 0);

    // Short burst cache, scoped by query + the caller's site scope (never cross-scope).
    var cacheKey = $"snap:{assets}:{take}:{skip}:{string.Join('|', siteTokens)}";
    if (cache.TryGetValue(cacheKey, out object? cached) && cached is not null)
        return Results.Ok(cached);

    var db = redis.GetDatabase();

    // Resolve the device list from the index (no SCAN).
    string[] deviceList;
    var assetList = assets.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    if (assetList.Length == 1 && assetList[0] == "*")
    {
        var members = await db.SetMembersAsync("snapshot:devices");
        deviceList = members.Select(m => (string)m!).OrderBy(d => d, StringComparer.Ordinal).ToArray();
    }
    else
    {
        deviceList = assetList.Select(a => a.Replace(" ", "_")).OrderBy(d => d, StringComparer.Ordinal).ToArray();
    }

    var totalDevices = deviceList.Length;
    deviceList = deviceList.Skip(skip).Take(take).ToArray();

    var result = new Dictionary<string, Dictionary<string, object?>>();
    foreach (var device in deviceList)
    {
        var indexKey = $"snapshot:index:{device}";
        var keys = await db.SetMembersAsync(indexKey);
        if (keys.Length == 0) continue;

        var redisKeys = keys.Select(k => (RedisKey)(string)k!).ToArray();
        var values    = await db.StringGetAsync(redisKeys);

        Dictionary<string, object?>? assetMetrics = null;
        var stale = new List<RedisValue>();
        for (var i = 0; i < redisKeys.Length; i++)
        {
            var keyStr = (string)redisKeys[i]!;
            var parts  = keyStr.Split(':');
            if (parts.Length < 6) continue;
            if (values[i].IsNullOrEmpty) { stale.Add((string)redisKeys[i]!); continue; }  // TTL-expired -> prune
            if (!GroupAllowed(parts[2])) continue;   // parts[2] = sparkplug group (site)

            assetMetrics ??= result.TryGetValue(device, out var existing)
                ? existing
                : (result[device] = new Dictionary<string, object?>());

            var metricName = parts[^1];
            try   { assetMetrics[metricName] = JsonSerializer.Deserialize<JsonElement>(values[i]!); }
            catch { assetMetrics[metricName] = (string?)values[i]; }
        }

        // Lazy index hygiene: drop members whose snapshot key expired (fire-and-forget).
        if (stale.Count > 0)
            _ = db.SetRemoveAsync(indexKey, stale.ToArray(), CommandFlags.FireAndForget);
    }

    var payload = new { assets = result, totalDevices };
    cache.Set(cacheKey, (object)payload, TimeSpan.FromSeconds(2));
    return Results.Ok(payload);
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
