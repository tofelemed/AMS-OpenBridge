using Dapper;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>What one sweep did; every count is rows.</summary>
public sealed record SweepResult(int Promoted, int TransientPurged, int Expired, int ChunksDeleted, int Purged, int ResponsePurged,
    int ResponseModelsPurged = 0);

/// <summary>
/// v2.5 Task 1G.5 (spec v6 §1.6 retention; NR-060) + CHG-033: evidence is retained by RECORD CLASS.
///   TRANSIENT  every live artifact: deleted outright past Cplm:EvidenceTransientHours (6) and, oldest first,
///              whenever the class exceeds Cplm:EvidenceTransientBudgetBytes (2 GiB) - no grace, no EXPIRED row;
///   EPISODE    captured at an episode transition (EpisodeCaptureStore): expires retention_policy.EPISODE days
///              after the episode CLOSED, never while it is open; then purged after the grace like STANDARD;
///   STANDARD   reconstructions / replays: retention_policy days, then EXPIRED for Cplm:EvidenceExpiredGraceDays,
///              then purged;
///   PINNED     an investigation reference: never touched.
/// The sweep runs every Cplm:EvidenceSweepIntervalMinutes (15): it must run several times inside the TRANSIENT
/// lifetime, because it also promotes the captured manifests that arrived after their verdict. The v1 result
/// rows are NOT swept here (FeaturePartitionMaintenance owns those).
/// </summary>
public sealed class EvidenceRetentionSweeper : BackgroundService
{
    private readonly NpgsqlDataSource _db;
    private readonly ILogger<EvidenceRetentionSweeper> _logger;
    private readonly TimeSpan _interval;
    private readonly int _expiredGraceDays, _transientHours;
    private readonly long _transientBudgetBytes;

    public EvidenceRetentionSweeper([FromKeyedServices("cplm")] NpgsqlDataSource db, ILogger<EvidenceRetentionSweeper> logger,
        IConfiguration config)
    {
        _db = db;
        _logger = logger;
        // the pre-CHG-033 setting (hours) is honoured when it is the only one given
        var minutes = config.GetValue<int?>("Cplm:EvidenceSweepIntervalMinutes")
            ?? (config.GetValue<int?>("Cplm:EvidenceSweepIntervalHours") is { } hours ? hours * 60 : 15);
        _interval = TimeSpan.FromMinutes(Math.Max(5, minutes));
        _expiredGraceDays = Math.Max(0, config.GetValue("Cplm:EvidenceExpiredGraceDays", 7));
        _transientHours = Math.Max(1, config.GetValue("Cplm:EvidenceTransientHours", 6));
        _transientBudgetBytes = Math.Max(1L << 20, config.GetValue("Cplm:EvidenceTransientBudgetBytes", 2L * 1024 * 1024 * 1024));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        _logger.LogInformation("Evidence retention: every {Minutes} min; TRANSIENT {Hours} h / {Budget} MiB; EXPIRED grace {Grace} d",
            _interval.TotalMinutes, _transientHours, _transientBudgetBytes >> 20, _expiredGraceDays);
        // First sweep shortly after start (not at start: the schema may still be arriving).
        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var r = await SweepOnceAsync(_db, stoppingToken, _expiredGraceDays, 20_000, _transientHours, _transientBudgetBytes);
                if (r.Promoted + r.TransientPurged + r.Expired + r.Purged + r.ResponsePurged + r.ResponseModelsPurged > 0)
                    _logger.LogInformation("Evidence retention: {Promoted} promoted to EPISODE, {Transient} TRANSIENT deleted, {Expired} expired, {Chunks} chunk(s) deleted, {Purged} purged, {Response} response event(s) and {Models} unreviewed model(s) purged",
                        r.Promoted, r.TransientPurged, r.Expired, r.ChunksDeleted, r.Purged, r.ResponsePurged, r.ResponseModelsPurged);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Evidence retention sweep failed; will retry next interval"); }
            try { await Task.Delay(_interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }

    // CHG-049: RESPONSE is response_event retention, not an evidence class; CHG-091: nor is RESPONSE_CENSORED
    private static readonly string[] NotEvidenceClasses = { "TRANSIENT", "SHORT_FEATURES", "LONG_FEATURES", "GATE_RESULTS", "RESPONSE", "RESPONSE_CENSORED" };

    /// <summary>One sweep. Static so a test can drive it against the lab database.</summary>
    public static async Task<SweepResult> SweepOnceAsync(NpgsqlDataSource db, CancellationToken ct,
        int expiredGraceDays = 7, int batchSize = 20_000, int transientHours = 6, long transientBudgetBytes = 2L * 1024 * 1024 * 1024)
    {
        var size = Math.Max(1, batchSize);
        // 1. captures whose artifacts arrived after the verdict (lookback = the transient lifetime + 1 h)
        var promoted = await EpisodeCaptureStore.PromoteCapturedAsync(db, transientHours + 1, ct);
        // 2. TRANSIENT by age, then by budget (DELETE cascades the chunks: smaller batches)
        var transient = await EvidenceRetentionTiers.PurgeTransientByAgeAsync(db, transientHours, Math.Min(size, 5_000), ct);
        transient += await EvidenceRetentionTiers.PurgeTransientOverBudgetAsync(db, transientHours, transientBudgetBytes, Math.Min(size, 2_000), ct);
        // 3. the day-based classes: EPISODE (clock = the episode close) and every other row of retention_policy
        List<(string recordClass, int days)> policies;
        await using (var conn = await db.OpenConnectionAsync(ct))
            policies = (await conn.QueryAsync<(string recordClass, int days)>(
                "SELECT record_class, days FROM analytics.retention_policy WHERE days IS NOT NULL AND NOT (record_class = ANY(@skip))",
                new { skip = NotEvidenceClasses })).ToList();
        if (policies.All(p => p.recordClass != "EPISODE")) policies.Add(("EPISODE", 90));   // the row ships as ops SQL (cpm-10a)
        int expired = 0, chunks = 0, purged = 0;
        foreach (var (recordClass, days) in policies)
        {
            var extra = recordClass == "EPISODE" ? EvidenceRetentionTiers.EpisodeStillProtected : "";
            var (e, c) = await EvidenceRetentionTiers.ExpireAsync(db, recordClass, days, extra, size, ct);
            expired += e; chunks += c;
            purged += await EvidenceRetentionTiers.PurgeExpiredAsync(db, recordClass, days, expiredGraceDays, size, ct);
        }
        // 4. CHG-049: response_event / response_metric; no RESPONSE row (or null days) = keep forever.
        //    CHG-091: unreviewed models first (that unpins their events), then the events, then CENSORED by its own row.
        int responsePurged = 0, modelsPurged = 0;
        int? responseDays, censoredDays;
        await using (var conn = await db.OpenConnectionAsync(ct))
        {
            responseDays = await conn.ExecuteScalarAsync<int?>("SELECT days FROM analytics.retention_policy WHERE record_class = 'RESPONSE'");
            censoredDays = await conn.ExecuteScalarAsync<int?>("SELECT days FROM analytics.retention_policy WHERE record_class = 'RESPONSE_CENSORED'");
        }
        if (responseDays is { } rd)
        {
            modelsPurged = await ResponseRetention.PurgeModelsAsync(db, rd, 2_000, ct);
            responsePurged = await ResponseRetention.PurgeAsync(db, rd, 5_000, ct);
        }
        if (censoredDays is { } cd) responsePurged += await ResponseRetention.PurgeAsync(db, cd, 5_000, ct, censoredOnly: true);
        return new SweepResult(promoted, transient, expired, chunks, purged, responsePurged, modelsPurged);
    }
}
