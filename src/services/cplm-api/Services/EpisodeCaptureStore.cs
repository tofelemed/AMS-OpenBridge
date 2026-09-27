using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-033 — what an episode transition keeps. A fused verdict names its method runs; when it opens,
/// escalates or closes an episode the frame service records those runs here, in the frame's own
/// transaction, and promotes the TRANSIENT manifests already stored to EPISODE. Artifacts that land
/// after the verdict (the evidence consumer is a separate group and can lag by minutes) are promoted
/// by the sweeper through <see cref="PromoteCapturedAsync"/>. OPEN and ESCALATE captures stop at
/// Cplm:EpisodeCaptureMax so an oscillating band cannot capture without bound; CLOSE always captures.
/// </summary>
public static class EpisodeCaptureStore
{
    /// <summary>Promotes every TRANSIENT manifest whose run was captured inside the lookback (transient hours + 1).</summary>
    public const string PromoteSql = """
        UPDATE analytics.evidence_manifest m
        SET retention_class = 'EPISODE'
        FROM analytics.cplm_episode_capture c
        WHERE c.method_run_id = m.method_run_id
          AND m.retention_class = 'TRANSIENT' AND m.pinned = FALSE
          AND c.captured_at > NOW() - make_interval(hours => @hours)
        """;

    /// <summary>Records the capture and promotes what is already stored. False = the automatic cap is reached; nothing written.</summary>
    public static async Task<bool> CaptureAsync(NpgsqlConnection conn, NpgsqlTransaction tx, long frameId, string kind,
        IReadOnlyList<Guid> runIds, int maxAutomatic)
    {
        if (runIds.Count == 0) return false;
        var runs = runIds.Distinct().ToArray();
        var taken = await conn.ExecuteScalarAsync<long?>("""
            UPDATE analytics.cplm_event_frames
            SET capture_count = capture_count + 1, updated_at = NOW()
            WHERE id = @id AND (@kind = 'CLOSE' OR capture_count < @cap)
            RETURNING id
            """, new { id = frameId, kind, cap = maxAutomatic }, tx);
        if (taken is null) return false;
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_episode_capture (episode_id, method_run_id, kind)
            SELECT @id, unnest(@runs), @kind
            ON CONFLICT DO NOTHING
            """, new { id = frameId, runs, kind }, tx);
        await conn.ExecuteAsync("""
            UPDATE analytics.evidence_manifest SET retention_class = 'EPISODE'
            WHERE method_run_id = ANY(@runs) AND retention_class = 'TRANSIENT' AND pinned = FALSE
            """, new { runs }, tx);
        return true;
    }

    /// <summary>The sweeper's promote step: manifests that arrived after their capture. Returns the rows promoted.</summary>
    public static async Task<int> PromoteCapturedAsync(NpgsqlDataSource db, int lookbackHours, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(PromoteSql, new { hours = Math.Max(1, lookbackHours) },
            commandTimeout: 600, cancellationToken: ct));
    }
}
