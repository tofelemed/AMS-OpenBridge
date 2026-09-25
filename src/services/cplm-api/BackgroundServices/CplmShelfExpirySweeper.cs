using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// CHG-032 — a shelf ends when its expiry passes, not when somebody happens to acknowledge
/// the episode. Once a minute every SHELVED frame whose shelve_until is in the past becomes
/// EXPIRED ("returned from the shelf, unreviewed"), gets its SHELVE_EXPIRED history row and an
/// audit event. The UPDATE ... RETURNING flips each row exactly once, so a second instance
/// sweeping concurrently cannot double-record. Mirrors AMS.Api's ShelveExpiryService for
/// alarms (database/scripts/36_alarm_shelving.sql).
/// </summary>
public sealed class CplmShelfExpirySweeper : BackgroundService
{
    private readonly NpgsqlDataSource _db;
    private readonly ICplmAuditEmitter _audit;
    private readonly ILogger<CplmShelfExpirySweeper> _logger;
    private readonly ShelvingOptions _options;

    public CplmShelfExpirySweeper([FromKeyedServices("cplm")] NpgsqlDataSource db, ICplmAuditEmitter audit,
        IOptions<ShelvingOptions> options, ILogger<CplmShelfExpirySweeper> logger)
    {
        _db = db;
        _audit = audit;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!_options.SweepEnabled) { _logger.LogInformation("Shelf expiry sweep disabled by Cplm:Shelving:SweepEnabled"); return; }
        var interval = TimeSpan.FromSeconds(Math.Max(10, _options.SweepSeconds));
        // Not at start: the schema (script 60 / the consumer's self-heal DDL) may still be arriving.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var expired = await EventActionStore.ExpireDueAsync(_db, stoppingToken);
                foreach (var (id, until) in expired)
                    _audit.Emit("CPM_EVENT_SHELF_EXPIRED", "system", "CpmEventFrame", id.ToString(), new { until });
                if (expired.Count > 0)
                    _logger.LogInformation("Shelf expiry: {Count} episode(s) returned from the shelf", expired.Count);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                // Schema not yet applied is the expected first-boot case; the next tick retries.
                _logger.LogWarning(ex, "Shelf expiry sweep failed; will retry in {Interval}", interval);
            }
            try { await Task.Delay(interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }
}
