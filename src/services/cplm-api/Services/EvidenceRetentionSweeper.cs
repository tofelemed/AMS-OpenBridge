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
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        // First sweep shortly after start (not at start: the schema may still be arriving), then daily.
        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var (expired, chunks) = await SweepOnceAsync(_db, stoppingToken);
                if (expired > 0) _logger.LogInformation("Evidence retention: {Manifests} manifest(s) expired, {Chunks} chunk(s) deleted", expired, chunks);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Evidence retention sweep failed; will retry next interval"); }
            try { await Task.Delay(_interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>One sweep. Static so a test can drive it against the lab database.</summary>
    public static async Task<(int Expired, int ChunksDeleted)> SweepOnceAsync(NpgsqlDataSource db, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        // Expire by class: a NULL days means "never" (PINNED); pinned manifests are excluded regardless of class.
        var expired = (await conn.QueryAsync<Guid>("""
            UPDATE analytics.evidence_manifest m
            SET readiness = 'EXPIRED', readiness_reason = 'RETENTION'
            FROM analytics.retention_policy p
            WHERE p.record_class = m.retention_class AND p.days IS NOT NULL
              AND m.pinned = FALSE AND m.readiness <> 'EXPIRED'
              AND m.created_at < NOW() - make_interval(days => p.days)
            RETURNING m.evidence_id
            """, transaction: tx)).ToList();
        int chunks = 0;
        if (expired.Count > 0)
        {
            chunks = await conn.ExecuteAsync("DELETE FROM analytics.evidence_chunk WHERE evidence_id = ANY(@ids)",
                new { ids = expired.ToArray() }, transaction: tx);
        }
        await tx.CommitAsync(ct);
        return (expired.Count, chunks);
    }
}
