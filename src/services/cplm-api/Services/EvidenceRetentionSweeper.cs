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

    /// <summary>A maintenance statement, not a request: the default 30 s command timeout is for readers.</summary>
    private const int SweepCommandTimeoutSeconds = 600;

    /// <summary>One sweep. Static so a test can drive it against the lab database.</summary>
    public static async Task<(int Expired, int ChunksDeleted)> SweepOnceAsync(NpgsqlDataSource db, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        // Expire by class: a NULL days means "never" (PINNED); pinned manifests are excluded regardless of class.
        // One UPDATE per policy row with a plain parameterised predicate, so the planner uses the partial index
        // ix_evidence_manifest_retention_due (retention_class, created_at) WHERE pinned = FALSE AND readiness <> 'EXPIRED'
        // and touches only the rows that are due. The former single UPDATE joined retention_policy and applied
        // `created_at < NOW() - p.days` as a join filter over the whole table: 827k manifests on the lab, a 3 s seq
        // scan for the bare SELECT and a 30 s timeout for the UPDATE under load - so nothing ever expired
        // (InvestigationsApiTests, 2026-09-25).
        var policies = (await conn.QueryAsync<(string recordClass, int days)>(
            "SELECT record_class, days FROM analytics.retention_policy WHERE days IS NOT NULL", transaction: tx)).ToList();
        var expired = new List<Guid>();
        foreach (var (recordClass, days) in policies)
        {
            expired.AddRange(await conn.QueryAsync<Guid>(new CommandDefinition("""
                UPDATE analytics.evidence_manifest
                SET readiness = 'EXPIRED', readiness_reason = 'RETENTION'
                WHERE retention_class = @recordClass
                  AND pinned = FALSE AND readiness <> 'EXPIRED'
                  AND created_at < NOW() - make_interval(days => @days)
                RETURNING evidence_id
                """, new { recordClass, days }, transaction: tx, commandTimeout: SweepCommandTimeoutSeconds, cancellationToken: ct)));
        }
        int chunks = 0;
        if (expired.Count > 0)
        {
            chunks = await conn.ExecuteAsync(new CommandDefinition("DELETE FROM analytics.evidence_chunk WHERE evidence_id = ANY(@ids)",
                new { ids = expired.ToArray() }, transaction: tx, commandTimeout: SweepCommandTimeoutSeconds, cancellationToken: ct));
        }
        await tx.CommitAsync(ct);
        return (expired.Count, chunks);
    }
}
