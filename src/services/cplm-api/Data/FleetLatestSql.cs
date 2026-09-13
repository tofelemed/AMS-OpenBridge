namespace Traverse.CplmApi.Data;

/// <summary>
/// CHG-023 — the fleet "latest verdict per loop" read path.
///
/// The fleet endpoints used to find each loop's newest verdict with
/// <c>DISTINCT ON (loop_id)</c> over the WHOLE gate table, ordered by an expression no
/// index can serve, and dragged every row's 3 KB payload through that sort. At the plant's
/// size (171 loops × 192 rows/day) that was 10–23 s per call, four calls per Performance
/// mount, repeated every 60 s per console.
///
/// Now: one registry scan, and per loop two index probes — "newest REAL verdict" (partial
/// index) and "newest row of any kind" — with the real one preferred. Same rows as before
/// (proven by tests/cplm-api.Tests), ~20 ms, flat as the table grows.
/// </summary>
public static class FleetLatestSql
{
    // The two probe indexes these queries depend on are defined in CplmReadIndexes.

    /// <summary>Registry scope shared by rankings and heatmap (summary has no monitoring filter — see below).</summary>
    private const string MonitoredInScope = """
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
          AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
        """;

    /// <summary>
    /// Per-loop probe: newest real verdict if the loop has one, else its newest row of any
    /// kind — the ordering the endpoints have always used (real verdict first, then
    /// window_end, then created_at). Each branch is one index probe returning its first entry.
    /// <paramref name="cols"/> is the projected gate column list (aliases come from the first branch).
    /// </summary>
    private static string LatestProbe(string cols) => $"""
        LEFT JOIN LATERAL (
            SELECT u.* FROM (
                (SELECT {cols}, TRUE AS real_verdict
                 FROM analytics.cplm_gate_results g
                 WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
                   AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
                 ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
                 LIMIT 1)
                UNION ALL
                (SELECT {cols}, FALSE
                 FROM analytics.cplm_gate_results g
                 WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
                 ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
                 LIMIT 1)
            ) u
            ORDER BY u.real_verdict DESC
            LIMIT 1
        ) l ON TRUE
        """;

    /// <summary>
    /// Bad-actor ranking. <paramref name="rankExpr"/> is the controller's whitelisted ORDER BY
    /// fragment (e.g. <c>l.confidence DESC NULLS LAST</c>). Only the observability flags are
    /// pulled out of the payload — the old query shipped the whole 3 KB message per row.
    /// </summary>
    public static string Rankings(string rankExpr) => $"""
        SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
               l.window_end, l.diagnosis, l.severity, l.confidence,
               l.effort_ratio, l.triangularity, l.horch_oddness, l.acf_period_s,
               l.good_error_pct, l.mae, l.flags
        FROM cpm.loop_registry r
        {LatestProbe("""
            g.window_end, g.diagnosis, g.severity, g.confidence,
                    g.effort_ratio, g.triangularity, g.horch_oddness, g.acf_period_s,
                    g.good_error_pct, g.mae,
                    (g.payload->'observability_flags')::text AS flags
            """)}
        {MonitoredInScope}
        ORDER BY
            (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC,
            {rankExpr},
            r.loop_id
        LIMIT @limit
        """;

    /// <summary>Loop × gate heatmap; only <c>payload->'gates'</c> leaves the database.</summary>
    public static string Heatmap => $"""
        SELECT r.loop_id, r.display_name, r.site, r.loop_type,
               l.window_end, l.diagnosis, l.confidence, l.gates
        FROM cpm.loop_registry r
        {LatestProbe("g.window_end, g.diagnosis, g.confidence, (g.payload->'gates')::text AS gates")}
        {MonitoredInScope}
        ORDER BY r.loop_id
        LIMIT @limit
        """;

    /// <summary>
    /// Fleet diagnosis distribution: one row per registry loop in scope that has a real
    /// verdict at this resolution (its newest one). Unlike rankings/heatmap this is NOT
    /// limited to monitoring-enabled loops — the old query never was, and the Overview's
    /// "N loops evaluated" is compared against the registry total.
    /// </summary>
    public const string SummaryByDiagnosis = """
        SELECT l.diagnosis AS "Diagnosis", COUNT(*)::int AS "Count"
        FROM cpm.loop_registry r
        JOIN LATERAL (
            SELECT g.diagnosis
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) l ON TRUE
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
        GROUP BY l.diagnosis ORDER BY 2 DESC
        """;
}
