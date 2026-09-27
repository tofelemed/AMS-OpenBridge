using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// CHG-033 — every Cplm:Partitions:MaintenanceMinutes (60) the plant's partitioned result tables get
/// their next days created and their days past retention_policy dropped (<see cref="FeaturePartitions"/>).
/// A table that is not partitioned (the lab's Timescale hypertables) is left alone, so one build
/// serves both. A lock timeout or a schema still arriving is logged and retried next tick.
/// </summary>
public sealed class FeaturePartitionMaintenance : BackgroundService
{
    private readonly NpgsqlDataSource _db;
    private readonly FeaturePartitionOptions _options;
    private readonly ILogger<FeaturePartitionMaintenance> _logger;

    public FeaturePartitionMaintenance([FromKeyedServices("cplm")] NpgsqlDataSource db, IOptions<FeaturePartitionOptions> options,
        ILogger<FeaturePartitionMaintenance> logger)
    {
        _db = db;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!_options.Enabled) { _logger.LogInformation("Partition maintenance disabled by Cplm:Partitions:Enabled"); return; }
        var interval = TimeSpan.FromMinutes(Math.Max(5, _options.MaintenanceMinutes));
        // Not at start: the result consumer's schema pass (which also runs one maintenance pass) may still be arriving.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var r = await FeaturePartitions.MaintainOnceAsync(_db, DateTime.UtcNow, _options, _logger, stoppingToken);
                if (r.Created + r.Dropped + r.Relocated + r.Pruned > 0)
                    _logger.LogInformation("Partitions: {Created} created, {Dropped} dropped, {Relocated} row(s) relocated from DEFAULT, {Pruned} DEFAULT row(s) pruned; {Skipped} table(s) not partitioned",
                        r.Created, r.Dropped, r.Relocated, r.Pruned, r.Skipped);
                else if (r.Skipped == FeaturePartitions.Tables.Length)
                    _logger.LogDebug("Partitions: no partitioned result table here (hypertables, or cpm-10b not yet applied); nothing to do");
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { _logger.LogWarning(ex, "Partition maintenance failed; will retry in {Interval}", interval); }
            try { await Task.Delay(interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }
}
