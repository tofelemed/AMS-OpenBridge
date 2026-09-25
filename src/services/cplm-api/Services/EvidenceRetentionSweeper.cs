using Dapper;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// v2.5 Task 1G.5 (spec v6 §1.6 retention; NR-060): evidence is retained by RECORD CLASS.
/// STANDARD manifests older than analytics.retention_policy.days lose their chunks and are
/// marked EXPIRED (the manifest row stays, so a reader is told EVIDENCE_EXPIRED rather than
/// 404); PINNED manifests (an investigation reference) are never touched. The v1 result rows
/// are NOT swept here - their retention stays an ops decision (CHG-023 P1-4).
/// </summary>
public sealed class EvidenceRetentionSweeper : BackgroundService
{
    private readonly NpgsqlDataSource _db;
    private readonly ILogger<EvidenceRetentionSweeper> _logger;
    private readonly TimeSpan _interval;

    public EvidenceRetentionSweeper([FromKeyedServices("cplm")] NpgsqlDataSource db, ILogger<EvidenceRetentionSweeper> logger,
        IConfiguration config)
    {
        _db = db;
        _logger = logger;
        _interval = TimeSpan.FromHours(Math.Max(1, config.GetValue("Cplm:EvidenceSweepIntervalHours", 24)));
        _expiredGraceDays = Math.Max(0, config.GetValue("Cplm:EvidenceExpiredGraceDays", 7));
    }

    /// <summary>How long an EXPIRED, unpinned manifest row is kept (so a reader is told EVIDENCE_EXPIRED) before it is purged.</summary>
    private readonly int _expiredGraceDays;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        // First sweep shortly after start (not at start: the schema may still be arriving), then daily.
        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var (expired, chunks, purged) = await SweepOnceAsync(_db, stoppingToken, _expiredGraceDays);
                if (expired > 0 || purged > 0)
                    _logger.LogInformation("Evidence retention: {Manifests} manifest(s) expired, {Chunks} chunk(s) deleted, {Purged} expired manifest(s) purged",
                        expired, chunks, purged);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Evidence retention sweep failed; will retry next interval"); }
            try { await Task.Delay(_interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>A maintenance statement, not a request: the default 30 s command timeout is for readers.</summary>
    private const int SweepCommandTimeoutSeconds = 600;

    /// <summary>One sweep. Static so a test can drive it against the lab database.</summary>
    public static async Task<(int Expired, int ChunksDeleted, int Purged)> SweepOnceAsync(NpgsqlDataSource db, CancellationToken ct,
        int expiredGraceDays = 7, int batchSize = 20_000)
    {
        // Two tiers per policy row (a NULL days means "never" = PINNED's class; pinned manifests are excluded
        // regardless of class), each in batches with one transaction per batch, so a backlog after an outage
        // is drained in bounded pieces instead of one statement that outgrows its timeout and is retried
        // bigger the next day (pre-prod review I5). Every batch is idempotent, so a committed batch is progress.
        //   1. expire:  due rows -> readiness EXPIRED, their chunks deleted; the row stays so a reader is told
        //               EVIDENCE_EXPIRED (spec §1.6) - for expiredGraceDays more days;
        //   2. purge:   EXPIRED, unpinned rows older than days + grace are deleted (~1.2 KB each; at plant scale
        //               336k-361k rows a day, i.e. ~0.4 GB/day kept for ever before this tier existed - review C1).
        // The plain parameterised predicates are served by ix_evidence_manifest_retention_due (tier 1) and
        // ix_evidence_manifest_readiness (tier 2); the former single UPDATE joined retention_policy and applied
        // `created_at < NOW() - p.days` as a join filter over the whole table (827k rows, 30 s timeout under load).
        List<(string recordClass, int days)> policies;
        await using (var conn = await db.OpenConnectionAsync(ct))
            policies = (await conn.QueryAsync<(string recordClass, int days)>(
                "SELECT record_class, days FROM analytics.retention_policy WHERE days IS NOT NULL")).ToList();

        int expired = 0, chunks = 0, purged = 0;
        var size = Math.Max(1, batchSize);
        foreach (var (recordClass, days) in policies)
        {
            while (true)
            {
                await using var conn = await db.OpenConnectionAsync(ct);
                await using var tx = await conn.BeginTransactionAsync(ct);
                var ids = (await conn.QueryAsync<Guid>(new CommandDefinition("""
                    UPDATE analytics.evidence_manifest
                    SET readiness = 'EXPIRED', readiness_reason = 'RETENTION'
                    WHERE evidence_id IN (
                        SELECT evidence_id FROM analytics.evidence_manifest
                        WHERE retention_class = @recordClass
                          AND pinned = FALSE AND readiness <> 'EXPIRED'
                          AND created_at < NOW() - make_interval(days => @days)
                        ORDER BY created_at
                        LIMIT @size
                        FOR UPDATE SKIP LOCKED)
                    RETURNING evidence_id
                    """, new { recordClass, days, size }, transaction: tx, commandTimeout: SweepCommandTimeoutSeconds, cancellationToken: ct))).ToList();
                if (ids.Count > 0)
                    chunks += await conn.ExecuteAsync(new CommandDefinition("DELETE FROM analytics.evidence_chunk WHERE evidence_id = ANY(@ids)",
                        new { ids = ids.ToArray() }, transaction: tx, commandTimeout: SweepCommandTimeoutSeconds, cancellationToken: ct));
                await tx.CommitAsync(ct);
                expired += ids.Count;
                if (ids.Count < size) break;
            }

            while (true)
            {
                await using var conn = await db.OpenConnectionAsync(ct);
                var n = await conn.ExecuteAsync(new CommandDefinition("""
                    DELETE FROM analytics.evidence_manifest
                    WHERE evidence_id IN (
                        SELECT evidence_id FROM analytics.evidence_manifest
                        WHERE retention_class = @recordClass
                          AND pinned = FALSE AND readiness = 'EXPIRED'
                          AND created_at < NOW() - make_interval(days => @days + @grace)
                        ORDER BY created_at
                        LIMIT @size
                        FOR UPDATE SKIP LOCKED)
                    """, new { recordClass, days, grace = Math.Max(0, expiredGraceDays), size },
                    commandTimeout: SweepCommandTimeoutSeconds, cancellationToken: ct));
                purged += n;
                if (n < size) break;
            }
        }
        return (expired, chunks, purged);
    }
}
