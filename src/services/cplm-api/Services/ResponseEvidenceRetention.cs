using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-105 — the System Response (G12) charts live as long as their event. The response job's arrays arrive TRANSIENT (6 h)
/// like every live artifact; each sweep moves those of an ACCEPTED event (capture_state other than CENSORED) to class
/// RESPONSE, which follows retention_policy row RESPONSE:
///   * <see cref="ResponseRetention.PurgeAsync"/> deletes them in the same transaction as their event, so an event a system
///     model was built from keeps its charts while it is kept;
///   * <see cref="PurgeOrphansAsync"/> removes RESPONSE charts whose event is gone by any other route;
///   * row RESPONSE max_bytes caps the class (<see cref="TrimOverBudgetAsync"/>): oldest charts first, the events and their
///     quantities stay, and the charts of a kept model (reviewed, baseline, newest, newest VALIDATED) are never trimmed.
/// Censored candidates keep the TRANSIENT hours. RESPONSE is in the sweeper's NotEvidenceClasses, so the day-based expiry
/// never touches the class.
/// </summary>
public static class ResponseEvidenceRetention
{
    public const string Class = "RESPONSE";
    public const int CommandTimeoutSeconds = 600;

    /// <summary>The TRANSIENT G12 manifests of accepted events created inside the lookback, moved to RESPONSE.</summary>
    public const string PromoteSql = """
        UPDATE analytics.evidence_manifest m
        SET retention_class = 'RESPONSE'
        FROM analytics.response_event e
        WHERE e.method_run_id = m.method_run_id
          AND e.capture_state <> 'CENSORED'
          AND m.gate_id = 'G12'
          AND m.retention_class = 'TRANSIENT' AND m.pinned = FALSE AND m.readiness <> 'EXPIRED'
          AND m.created_at > NOW() - make_interval(hours => @hours)
        """;

    /// <summary>
    /// The method runs whose charts the byte cap never trims: the events of the models <see cref="ResponseRetention.PurgeModelsAsync"/>
    /// keeps for ever (reviewed, ACTIVE_BASELINE, the newest and the newest VALIDATED model per loop and path).
    /// </summary>
    private const string KeptModelRuns = """
        SELECT e.method_run_id FROM analytics.response_event e
        JOIN analytics.system_model s ON s.created_from_event = e.event_id
        WHERE s.reviewed_by IS NOT NULL OR s.model_state = 'ACTIVE_BASELINE'
           OR s.model_id IN (SELECT DISTINCT ON (lower(loop_id), path_id) model_id FROM analytics.system_model
                             ORDER BY lower(loop_id), path_id, created_at DESC)
           OR s.model_id IN (SELECT DISTINCT ON (lower(loop_id), path_id) model_id FROM analytics.system_model
                             WHERE model_state = 'VALIDATED' ORDER BY lower(loop_id), path_id, created_at DESC)
        """;

    /// <summary>Moves the G12 charts of accepted events (created inside the lookback) to RESPONSE. Returns rows moved.</summary>
    public static async Task<int> PromoteAsync(NpgsqlDataSource db, int lookbackHours, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(PromoteSql, new { hours = Math.Max(1, lookbackHours) },
            commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
    }

    /// <summary>RESPONSE charts older than <paramref name="days"/> whose event no longer exists. Returns rows deleted.</summary>
    public static async Task<int> PurgeOrphansAsync(NpgsqlDataSource db, int days, int batch, CancellationToken ct)
    {
        var total = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            var n = await conn.ExecuteAsync(new CommandDefinition("""
                DELETE FROM analytics.evidence_manifest WHERE evidence_id IN (
                    SELECT m.evidence_id FROM analytics.evidence_manifest m
                    WHERE m.retention_class = 'RESPONSE' AND m.pinned = FALSE AND m.readiness <> 'EXPIRED'
                      AND m.created_at < NOW() - make_interval(days => @days)
                      AND NOT EXISTS (SELECT 1 FROM analytics.response_event e WHERE e.method_run_id = m.method_run_id)
                    ORDER BY m.created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                """, new { days = Math.Max(0, days), batch }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
            total += n;
            if (n < batch) return total;
        }
    }

    /// <summary>
    /// While the RESPONSE class is over <paramref name="maxBytes"/> (payload + <see cref="EvidenceRetentionTiers.ManifestRowBytes"/>
    /// per row), the oldest charts outside <see cref="KeptModelRuns"/> are deleted, one batch at a time. Returns rows deleted.
    /// </summary>
    public static async Task<int> TrimOverBudgetAsync(NpgsqlDataSource db, long maxBytes, int batch, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var used = await conn.ExecuteScalarAsync<long>(new CommandDefinition("""
            SELECT COALESCE(SUM(total_bytes + @row), 0) FROM analytics.evidence_manifest
            WHERE retention_class = 'RESPONSE' AND pinned = FALSE AND readiness <> 'EXPIRED'
            """, new { row = EvidenceRetentionTiers.ManifestRowBytes }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct));
        var total = 0;
        while (used > maxBytes)
        {
            var bytes = (await conn.QueryAsync<long>(new CommandDefinition($"""
                DELETE FROM analytics.evidence_manifest WHERE evidence_id IN (
                    SELECT m.evidence_id FROM analytics.evidence_manifest m
                    WHERE m.retention_class = 'RESPONSE' AND m.pinned = FALSE AND m.readiness <> 'EXPIRED'
                      AND m.method_run_id NOT IN ({KeptModelRuns})
                    ORDER BY m.created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                RETURNING total_bytes
                """, new { batch }, commandTimeout: CommandTimeoutSeconds, cancellationToken: ct))).ToList();
            if (bytes.Count == 0) break;                     // only kept-model charts are left: never trimmed
            total += bytes.Count;
            used -= bytes.Sum() + (long)bytes.Count * EvidenceRetentionTiers.ManifestRowBytes;
        }
        return total;
    }
}
