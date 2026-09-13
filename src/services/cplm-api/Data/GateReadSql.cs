namespace Traverse.CplmApi.Data;

/// <summary>
/// CHG-023 — per-loop and catalogue reads of the gate table that the page sweep caught
/// at prod scale (see tests/cplm-api.Tests/GateReadSqlTests.cs for the oracles).
/// </summary>
public static class GateReadSql
{
    /// <summary>
    /// GET /loops/{id}/gates/latest — the loop's newest REAL verdict, else its newest row
    /// of any kind (real-verdict-first, then window_end, then created_at: the ordering this
    /// endpoint has always used). Two index probes instead of sorting the loop's rows by
    /// an expression on every click.
    /// </summary>
    public const string LatestForLoop = """
        SELECT u.loop_id, u.window_kind, u.window_start, u.window_end, u.sample_count,
               u.diagnosis, u.severity, u.confidence, u.payload, u.created_at
        FROM (
            (SELECT loop_id, window_kind, window_start, window_end, sample_count,
                    diagnosis, severity, confidence, payload::text AS payload, created_at, TRUE AS real_verdict
             FROM analytics.cplm_gate_results
             WHERE lower(loop_id) = lower(@loopId) AND window_kind = @windowKind
               AND diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA'
             ORDER BY window_end DESC NULLS LAST, created_at DESC
             LIMIT 1)
            UNION ALL
            (SELECT loop_id, window_kind, window_start, window_end, sample_count,
                    diagnosis, severity, confidence, payload::text, created_at, FALSE
             FROM analytics.cplm_gate_results
             WHERE lower(loop_id) = lower(@loopId) AND window_kind = @windowKind
             ORDER BY window_end DESC NULLS LAST, created_at DESC
             LIMIT 1)
        ) u
        ORDER BY u.real_verdict DESC
        LIMIT 1
        """;

    /// <summary>
    /// GET /calculations — the versions currently producing results. Same query as
    /// before; the fix is <see cref="CplmReadIndexes.CreatedAtIndex"/>, which turns
    /// "newest row that carries a version" into an index walk that stops at the first
    /// hit instead of detoasting every payload in the table.
    /// </summary>
    public const string LatestVersions = """
        SELECT COALESCE(payload->>'calculationVersion',  payload->>'calculation_version')  AS calculation_version,
               COALESCE(payload->>'dynamicsProfileVersion', payload->>'dynamics_profile_version') AS dynamics_profile_version
        FROM analytics.cplm_gate_results
        WHERE payload ? 'calculationVersion' OR payload ? 'calculation_version'
        ORDER BY created_at DESC LIMIT 1
        """;

    /// <summary>
    /// GET /calculations — which gate keys stored results actually carry. Sampled from the
    /// NEWEST 2,000 rows: the old query took the first 2,000 rows in physical order, i.e.
    /// the oldest — so a gate added later would never show as observed until the oldest
    /// rows aged out, and the sample cost a scan-and-detoast instead of an index walk.
    /// </summary>
    public const string ObservedGates = """
        SELECT DISTINCT gate FROM (
            SELECT jsonb_object_keys(newest.payload->'gates') AS gate
            FROM (
                SELECT payload
                FROM analytics.cplm_gate_results
                WHERE payload ? 'gates'
                ORDER BY created_at DESC
                LIMIT 2000
            ) newest
        ) keys
        """;
}
