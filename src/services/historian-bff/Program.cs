using AMS.HistorianBff;
using StackExchange.Redis;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────
builder.Services.AddHttpClient<IoTDbClient>();

// Redis — used by /snapshot endpoint
var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

var app = builder.Build();

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
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(series))
        return Results.BadRequest("'series' is required");
    if (end <= start)
        return Results.BadRequest("'end' must be after 'start'");

    width = Math.Clamp(width, 10, 2000);

    var sql    = iotdb.BuildTrendSql(series, start, end, width, measurements ?? "");
    var result = await iotdb.QueryAsync(sql, ct);
    var points = IoTDbClient.MapPoints(result);

    return Results.Ok(new { series, start, end, width, points });
});

// ── GET /raw ───────────────────────────────────────────────────────────────
// Returns raw (non-decimated) records. maxCount capped at 10 000.
app.MapGet("/raw", async (
    string series,
    DateTimeOffset start,
    DateTimeOffset end,
    int maxCount,
    string? measurements,
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(series))
        return Results.BadRequest("'series' is required");

    maxCount = Math.Clamp(maxCount, 1, 10_000);
    var sql    = iotdb.BuildRawSql(series, start, end, maxCount, measurements ?? "");
    var result = await iotdb.QueryAsync(sql, ct);
    var points = IoTDbClient.MapPoints(result);

    return Results.Ok(new { series, start, end, maxCount, count = points.Count, points });
});

// ── GET /snapshot ──────────────────────────────────────────────────────────
// Returns current metric values from Redis for one or more assets (device IDs).
// Query params: assets (comma-separated device names, or "*" for all devices)
// Redis key: snapshot:metric:ams_site1:ams_edge1:<device>:<metricName>
app.MapGet("/snapshot", async (
    string assets,
    IConnectionMultiplexer redis,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(assets))
        return Results.BadRequest("'assets' is required");

    var assetList = assets.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    var db        = redis.GetDatabase();
    var group     = builder.Configuration["Sparkplug:Group"] ?? "ams_site1";
    var edge      = builder.Configuration["Sparkplug:Edge"]  ?? "ams_edge1";
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
        // Discover all devices under this Sparkplug group/edge
        var pattern = $"snapshot:metric:{group}:{edge}:*";
        foreach (var key in server.Keys(pattern: pattern))
        {
            var parts = ((string)key!).Split(':');
            if (parts.Length < 6) continue;
            await AddKeyAsync(key, parts[4]);
        }
    }
    else
    {
        foreach (var asset in assetList)
        {
            var safeAsset = asset.Replace(" ", "_");
            var pattern   = $"snapshot:metric:{group}:{edge}:{safeAsset}:*";
            foreach (var key in server.Keys(pattern: pattern))
                await AddKeyAsync(key, safeAsset);
        }
    }

    return Results.Ok(new { assets = result });
});

// ── GET /series ────────────────────────────────────────────────────────────
// Lists available time-series paths (for UI auto-complete).
app.MapGet("/series", async (
    string? prefix,
    IoTDbClient iotdb,
    CancellationToken ct) =>
{
    // Use ** to match all descendant levels — measurements are stored one level
    // deeper than the device path (e.g. root.ams.site1.alarms.<device>.severity).
    var path   = string.IsNullOrWhiteSpace(prefix) ? "root.ams.site1.alarms.**" : prefix;
    var sql    = $"SHOW TIMESERIES {path}";
    var result = await iotdb.QueryAsync(sql, ct);
    return Results.Ok(result);
});

app.Run();
