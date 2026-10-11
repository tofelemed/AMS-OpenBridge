using System.Text.Json;

namespace AMS.HistorianBff;

/// <summary>
/// Keeps IoTDB warm so the first user trend query isn't a cold ~2s hit.
///
/// Why this exists: the Docker health probe hits /health every 10s, which runs
/// "SHOW VERSION" — that keeps the HTTP connection pool and IoTDB session alive,
/// but SHOW VERSION never touches the data/aggregation path. So the FIRST GROUP-BY
/// trend query after startup (or after the query engine idles) still paid IoTDB's
/// cold cost: query-engine initialisation plus loading recent TsFile pages from
/// disk (~2.3s observed, vs ~96ms warm).
///
/// This service runs a small GROUP-BY aggregation on boot and every 60s thereafter —
/// the SAME engine path the trend query uses — bounded to the last 5 minutes.
///
/// CHG-090: the query reads ONE device (found once with SHOW DEVICES … LIMIT 1), not
/// `root.**`. At plant scale `SELECT count(*) FROM root.**` touched every series; IoTDB
/// estimated it at 324 MB with 193 MB free and refused it (MemoryNotEnoughException), and
/// because the 60 s rhythm only began after a first success, it retried every 5 s for ever
/// (11–12 IoTDB warnings a minute at Marun, 2026-10-11). Now: fast retries only in the first
/// minute after start, the 60 s rhythm otherwise, and a failure is logged as a warning at
/// most once an hour instead of silently at Debug.
/// </summary>
public sealed class IoTDbWarmupService(IServiceProvider sp, ILogger<IoTDbWarmupService> log)
    : BackgroundService
{
    private static readonly TimeSpan KeepWarm = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan RetryWhileStarting = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan StartupGrace = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan WarnEvery = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var started = DateTimeOffset.UtcNow;
        var primed = false;
        string? device = null;
        DateTimeOffset? lastWarn = null;
        while (!ct.IsCancellationRequested)
        {
            var ok = false;
            try
            {
                using var scope = sp.CreateScope();
                var iotdb = scope.ServiceProvider.GetRequiredService<IoTDbClient>();
                device ??= FirstDevice(await iotdb.QueryAsync("SHOW DEVICES root.** LIMIT 1", ct));
                if (device is null)
                {
                    ok = true;   // an empty historian: nothing to warm yet, and nothing wrong
                }
                else
                {
                    await iotdb.QueryAsync(WarmupSql(device, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()), ct);
                    ok = true;
                    if (!primed)
                    {
                        log.LogInformation("IoTDB warmup: query engine primed on {Device}; trend cold-start avoided.", device);
                        primed = true;
                    }
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                device = null;   // the device may be gone (renamed loop): find another next time
                var now = DateTimeOffset.UtcNow;
                if (ShouldWarn(lastWarn, now))
                {
                    log.LogWarning(ex, "IoTDB warmup query failed; retrying at the normal rhythm (first trend may be slower).");
                    lastWarn = now;
                }
                else
                {
                    log.LogDebug(ex, "IoTDB warmup query failed; will retry.");
                }
            }
            try { await Task.Delay(NextDelay(ok, started, DateTimeOffset.UtcNow), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>The warm-up: one device's GROUP-BY count over the last 5 minutes (the trend path, constant cost).</summary>
    public static string WarmupSql(string device, long nowMs) =>
        $"SELECT count(*) FROM {device} GROUP BY ([{nowMs - 300_000},{nowMs}), 300000ms)";

    /// <summary>The first device of a SHOW DEVICES answer (IoTDB REST v2, column-major), or null when there is none
    /// or it is not a plain path (only a whitelisted path ever reaches SQL).</summary>
    public static string? FirstDevice(JsonElement answer)
    {
        if (answer.ValueKind != JsonValueKind.Object
            || !answer.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array
            || values.GetArrayLength() == 0)
            return null;
        var column = 0;
        if (answer.TryGetProperty("column_names", out var names) && names.ValueKind == JsonValueKind.Array)
        {
            var i = 0;
            foreach (var n in names.EnumerateArray())
            {
                if (string.Equals(n.GetString(), "Device", StringComparison.OrdinalIgnoreCase)) { column = i; break; }
                i++;
            }
        }
        if (column >= values.GetArrayLength()) return null;
        var col = values[column];
        if (col.ValueKind != JsonValueKind.Array || col.GetArrayLength() == 0 || col[0].ValueKind != JsonValueKind.String)
            return null;
        var device = col[0].GetString();
        return IoTDbClient.IsValidSeries(device) ? device!.Trim() : null;
    }

    /// <summary>Fast retries only in the first minute after start (IoTDB may still be starting), the 60 s rhythm otherwise.</summary>
    public static TimeSpan NextDelay(bool ok, DateTimeOffset started, DateTimeOffset now) =>
        !ok && now - started < StartupGrace ? RetryWhileStarting : KeepWarm;

    /// <summary>A failure is worth a warning once an hour; the rest go to Debug.</summary>
    public static bool ShouldWarn(DateTimeOffset? lastWarn, DateTimeOffset now) =>
        lastWarn is null || now - lastWarn.Value >= WarnEvery;
}
