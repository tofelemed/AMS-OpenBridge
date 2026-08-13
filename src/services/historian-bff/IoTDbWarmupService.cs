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
/// This service runs a small GROUP-BY aggregation on boot (retrying while IoTDB is
/// still starting) and every 60s thereafter — the SAME engine path the trend query
/// uses — so the aggregation engine and recent pages are already warm when an
/// operator opens the Historical / Trend page. The query is bounded to the last
/// 5 minutes (mostly served from the in-memory memtable) so it stays cheap.
/// </summary>
public sealed class IoTDbWarmupService(IServiceProvider sp, ILogger<IoTDbWarmupService> log)
    : BackgroundService
{
    private static readonly TimeSpan KeepWarm = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan RetryWhileStarting = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan RetryAfterPrimed = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var primed = false;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = sp.CreateScope();
                var iotdb = scope.ServiceProvider.GetRequiredService<IoTDbClient>();

                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var from = now - 300_000; // last 5 minutes — bounded, mostly in-memtable
                // GROUP-BY aggregation exercises the same engine path as /trend.
                await iotdb.QueryAsync(
                    $"SELECT count(*) FROM root.** GROUP BY ([{from},{now}), 300000ms)", ct);

                if (!primed)
                {
                    log.LogInformation("IoTDB warmup: query engine primed; trend cold-start avoided.");
                    primed = true;
                }
                await Task.Delay(KeepWarm, ct);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // IoTDB still starting up, or a transient blip — back off and retry.
                log.LogDebug(ex, "IoTDB warmup query failed; will retry.");
                try { await Task.Delay(primed ? RetryAfterPrimed : RetryWhileStarting, ct); }
                catch (OperationCanceledException) { break; }
            }
        }
    }
}
