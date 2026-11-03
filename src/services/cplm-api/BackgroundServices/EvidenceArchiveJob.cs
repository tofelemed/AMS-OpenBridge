using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// CHG-102 Phase 5b-1 — runs <see cref="EvidenceArchiver"/> every Cplm:EvidenceArchive:IntervalMinutes (5) on the consumers
/// instance: boundary evidence sets packed into analytics.evidence_archive before the TRANSIENT sweep deletes them, then the
/// archive's day partitions created ahead / dropped by retention. Cplm:EvidenceArchive:Enabled=false turns it off. A
/// database without cpm-19 is logged hourly ("apply cpm-19") and nothing is archived.
/// </summary>
public sealed class EvidenceArchiveJob : BackgroundService
{
    private readonly EvidenceArchiver _archiver;
    private readonly EvidenceArchiveOptions _options;
    private readonly EvidenceArchiveStats _stats;
    private readonly ILogger<EvidenceArchiveJob> _logger;
    private DateTime _lastMissingLog = DateTime.MinValue;

    public EvidenceArchiveJob([FromKeyedServices("cplm")] NpgsqlDataSource db, IOptions<EvidenceArchiveOptions> options,
        EvidenceArchiveStats stats, ILogger<EvidenceArchiveJob> logger, IIotDbSeriesReader? series = null,
        IOptions<IotDbWriteOptions>? iotdb = null)
    {
        _options = options.Value;
        _stats = stats;
        _logger = logger;
        // CHG-102 Phase 5b-2: verify-then-reference of the raw-sample columns (Cplm:EvidenceArchive:TraceReferences)
        var traces = iotdb is not null && _options.TraceReferencesFor(iotdb.Value.IsLayoutV2) && series is not null
            ? new EvidenceTraceReferencer(series, _options, iotdb.Value.LoopRootPrefix, stats.Traces, logger) : null;
        _archiver = new EvidenceArchiver(db, _options, stats, logger, traces);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        _stats.Enabled = _options.Enabled;
        if (!_options.Enabled) { _logger.LogInformation("Evidence archive disabled by Cplm:EvidenceArchive:Enabled"); return; }
        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.IntervalMinutes));
        _logger.LogInformation("Evidence archive: every {Minutes} min, settle {Settle} min after the window end, lookback {Lookback} h",
            interval.TotalMinutes, _options.SettleMinutes, _options.LookbackHours);
        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var r = await _archiver.RunOnceAsync(DateTime.UtcNow, stoppingToken);
                if (!r.Installed)
                {
                    if (DateTime.UtcNow - _lastMissingLog > TimeSpan.FromHours(1))
                    {
                        _logger.LogWarning("Evidence archive: analytics.evidence_archive is missing - apply cpm-19 (CHG-102); boundary evidence ages out as TRANSIENT until then");
                        _lastMissingLog = DateTime.UtcNow;
                    }
                }
                else if (r.SetsArchived > 0 || r.Retention is { DroppedByAge: > 0 } or { DroppedByBytes: > 0 })
                    _logger.LogInformation("Evidence archive: {Sets} set(s) / {Artifacts} artifact(s) archived ({Pack} KiB packed from {Source} KiB of chunks, {Missing} missing); {Pending} pending; partitions {Created} created, {Age} dropped by age, {Bytes} by bytes",
                        r.SetsArchived, r.ArtifactsArchived, r.PackBytes >> 10, r.SourceBytes >> 10, r.MissingArtifacts, r.Pending,
                        r.Retention?.Created ?? 0, r.Retention?.DroppedByAge ?? 0, r.Retention?.DroppedByBytes ?? 0);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                _stats.LastError = ex.Message;
                _logger.LogWarning(ex, "Evidence archive pass failed; will retry in {Interval}", interval);
            }
            try { await Task.Delay(interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }
}
