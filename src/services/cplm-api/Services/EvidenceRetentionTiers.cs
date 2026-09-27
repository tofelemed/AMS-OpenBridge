using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-033 — the SQL tiers behind <see cref="EvidenceRetentionSweeper"/>, each batched with one
/// transaction per batch and FOR UPDATE SKIP LOCKED, so a backlog drains in bounded pieces and a
/// concurrent promotion (EpisodeCaptureStore) never waits on a purge. TRANSIENT rows are deleted,
/// never expired: the reader's answer for them is the same "reconstructable" it gets today.
/// </summary>
public static class EvidenceRetentionTiers
{
    public const int CommandTimeoutSeconds = 600;
    /// <summary>Row overhead counted against the TRANSIENT budget on top of total_bytes (manifest row + its indexes, ~1.2-1.4 KB measured).</summary>
    public const int ManifestRowBytes = 1200;

    private const string LiveTransient = "retention_class = 'TRANSIENT' AND pinned = FALSE AND readiness <> 'EXPIRED'";

    /// <summary>TRANSIENT rows older than the hours: deleted outright (chunks cascade). Returns rows deleted.</summary>
    public static async Task<int> PurgeTransientByAgeAsync(NpgsqlDataSource db, int hours, int batch, CancellationToken ct)
    {
        var total = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            var n = await conn.ExecuteAsync(new CommandDefinition($"""
                DELETE FROM analytics.evidence_manifest
                WHERE evidence_id IN (
                    SELECT evidence_id FROM analytics.evidence_manifest
                    WHERE {LiveTransient} AND created_at < NOW() - make_interval(hours => @hours)
                    ORDER BY created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                """, new { hours, batch }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
            total += n;
            if (n < batch) return total;
        }
    }

    /// <summary>TRANSIENT over its byte budget: the oldest live rows go, one batch at a time, until the class fits.</summary>
    public static async Task<int> PurgeTransientOverBudgetAsync(NpgsqlDataSource db, int hours, long budgetBytes, int batch, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var used = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"""
            SELECT COALESCE(SUM(total_bytes + @row), 0) FROM analytics.evidence_manifest
            WHERE {LiveTransient} AND created_at >= NOW() - make_interval(hours => @hours)
            """, new { row = ManifestRowBytes, hours }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
        var total = 0;
        while (used > budgetBytes)
        {
            var bytes = (await conn.QueryAsync<long>(new CommandDefinition($"""
                DELETE FROM analytics.evidence_manifest
                WHERE evidence_id IN (
                    SELECT evidence_id FROM analytics.evidence_manifest
                    WHERE {LiveTransient}
                    ORDER BY created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                RETURNING total_bytes
                """, new { batch }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct))).ToList();
            if (bytes.Count == 0) break;
            total += bytes.Count;
            used -= bytes.Sum() + (long)bytes.Count * ManifestRowBytes;
        }
        return total;
    }

    /// <summary>EPISODE rows stay while their episode is open or closed less than the class days ago.</summary>
    public const string EpisodeStillProtected = """
        AND NOT EXISTS (SELECT 1 FROM analytics.cplm_episode_capture c
                        JOIN analytics.cplm_event_frames f ON f.id = c.episode_id
                        WHERE c.method_run_id = m.method_run_id
                          AND (f.closed_at IS NULL OR f.closed_at > NOW() - make_interval(days => @days)))
        """;

    /// <summary>Tier 1: due rows of one class -> EXPIRED, chunks deleted, row kept so a reader is told EVIDENCE_EXPIRED.</summary>
    public static async Task<(int Expired, int Chunks)> ExpireAsync(NpgsqlDataSource db, string recordClass, int days, string extraPredicate,
        int batch, CancellationToken ct)
    {
        int expired = 0, chunks = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);
            var ids = (await conn.QueryAsync<Guid>(new CommandDefinition($"""
                UPDATE analytics.evidence_manifest
                SET readiness = 'EXPIRED', readiness_reason = 'RETENTION'
                WHERE evidence_id IN (
                    SELECT m.evidence_id FROM analytics.evidence_manifest m
                    WHERE m.retention_class = @recordClass AND m.pinned = FALSE AND m.readiness <> 'EXPIRED'
                      AND m.created_at < NOW() - make_interval(days => @days)
                      {extraPredicate}
                    ORDER BY m.created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                RETURNING evidence_id
                """, new { recordClass, days, batch }, transaction: tx, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct))).ToList();
            if (ids.Count > 0)
                chunks += await conn.ExecuteAsync(new CommandDefinition("DELETE FROM analytics.evidence_chunk WHERE evidence_id = ANY(@ids)",
                    new { ids = ids.ToArray() }, transaction: tx, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
            await tx.CommitAsync(ct);
            expired += ids.Count;
            if (ids.Count < batch) return (expired, chunks);
        }
    }

    /// <summary>Tier 2: EXPIRED, unpinned rows of one class older than days + grace are deleted.</summary>
    public static async Task<int> PurgeExpiredAsync(NpgsqlDataSource db, string recordClass, int days, int grace, int batch, CancellationToken ct)
    {
        var purged = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            var n = await conn.ExecuteAsync(new CommandDefinition("""
                DELETE FROM analytics.evidence_manifest
                WHERE evidence_id IN (
                    SELECT evidence_id FROM analytics.evidence_manifest
                    WHERE retention_class = @recordClass AND pinned = FALSE AND readiness = 'EXPIRED'
                      AND created_at < NOW() - make_interval(days => @days + @grace)
                    ORDER BY created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                """, new { recordClass, days, grace = Math.Max(0, grace), batch }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
            purged += n;
            if (n < batch) return purged;
        }
    }
}
