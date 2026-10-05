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
                   AND g.purpose = 'LIVE'
                 ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
                 LIMIT 1)
                UNION ALL
                (SELECT {cols}, FALSE
                 FROM analytics.cplm_gate_results g
                 WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
                   AND g.purpose = 'LIVE'
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
    /// <summary>
    /// v2.5 (1H.6, spec §4.7): fleet health filters. Each is an AND-clause over the registry row
    /// so a LIMITed page is filtered by the server, never re-filtered by the browser. Null for an
    /// unknown filter (the controller answers 400). The filters read the mirror as-of now:
    ///  - missing-binding: no PV device bound right now;
    ///  - stale-collection: an open loop context whose collection is STALE/OFFLINE/UNKNOWN;
    ///  - active-affected: an open loop context that is INELIGIBLE or LIMITED (a device condition
    ///    affecting a bound signal).
    /// </summary>
    public static string? HealthFilter(string? health) => health?.Trim().ToLowerInvariant() switch
    {
        null or "" => "",
        "missing-binding" => """
              AND NOT EXISTS (SELECT 1 FROM cpm.signal_device_binding_history b
                              WHERE b.loop_id = r.loop_id AND b.signal_role = 'PV'
                                AND b.valid_from <= now() AND (b.valid_to IS NULL OR b.valid_to > now()))
            """,
        // "Current" = the newest context per signal role (from_at, then revision) - never "any row
        // without to_at": a superseded interval whose close was not mirrored must not keep matching.
        "stale-collection" => """
              AND EXISTS (SELECT 1 FROM (
                            SELECT DISTINCT ON (c.signal_role) c.collection_state
                            FROM cpm.loop_health_context c WHERE c.loop_id = r.loop_id
                            ORDER BY c.signal_role, c.from_at DESC, c.interval_revision DESC) cur
                          WHERE cur.collection_state IN ('STALE','OFFLINE','UNKNOWN'))
            """,
        "active-affected" => """
              AND EXISTS (SELECT 1 FROM (
                            SELECT DISTINCT ON (c.signal_role) c.eligibility
                            FROM cpm.loop_health_context c WHERE c.loop_id = r.loop_id
                            ORDER BY c.signal_role, c.from_at DESC, c.interval_revision DESC) cur
                          WHERE cur.eligibility IN ('INELIGIBLE','LIMITED'))
            """,
        _ => null,
    };

    public static string Rankings(string rankExpr, string healthWhere = "") => $"""
        SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
               l.window_end, l.diagnosis, l.severity, l.confidence,
               l.effort_ratio, l.triangularity, l.horch_oddness, l.acf_period_s,
               l.good_error_pct, l.mae, l.flags, l.leading_hypothesis
        FROM cpm.loop_registry r
        {LatestProbe("""
            g.window_end, g.diagnosis, g.severity, g.confidence,
                    g.effort_ratio, g.triangularity, g.horch_oddness, g.acf_period_s,
                    g.good_error_pct, g.mae,
                    (g.payload->'observability_flags')::text AS flags,
                    g.payload->>'leading_hypothesis' AS leading_hypothesis
            """)}
        {MonitoredInScope}
        {healthWhere}
        ORDER BY
            (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC,
            {rankExpr},
            r.loop_id
        LIMIT @limit
        """;

    /// <summary>
    /// Loop × gate heatmap. 2026-09-17 audit F4: the row is the loop's NEWEST evaluated window (whatever
    /// its diagnosis) with its gate statuses and run ids; the newest real verdict rides beside it
    /// (<c>v_*</c> columns, null when the newest row is itself a verdict or none exists) so the UI can
    /// show a stale verdict AS stale instead of presenting it as the current window.
    /// </summary>
    public static string Heatmap => $"""
        SELECT r.loop_id, r.display_name, r.site, r.loop_type,
               n.window_end, n.diagnosis, n.confidence, n.gates, n.method_run_ids, n.insufficient_reason,
               v.window_end AS v_window_end, v.diagnosis AS v_diagnosis, v.confidence AS v_confidence
        FROM cpm.loop_registry r
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis, g.confidence, (g.payload->'gates')::text AS gates,
                   g.method_run_ids::text AS method_run_ids, g.payload->>'insufficient_evidence_reason' AS insufficient_reason
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) n ON TRUE
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis, g.confidence
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
              AND g.window_end < n.window_end
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) v ON TRUE
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

    /// <summary>
    /// SME review #5/#6 (CHG-043) — the fleet's operating picture: every MONITORED loop in scope
    /// in exactly one state, so the states add up to the monitored count (the old diagnosis
    /// distribution left loops without a verdict out and counted a months-old verdict as current).
    /// Per loop, one index probe for its newest real LIVE verdict at this resolution:
    ///  - no verdict: INSUFFICIENT_DATA when the loop has LIVE rows (all insufficient), else NO_RESULT;
    ///  - the verdict's window ended more than <c>@staleSeconds</c> ago: STALE (checked first —
    ///    an old verdict is not the current condition, whatever it says);
    ///  - EXCLUDED_* → EXCLUDED; NORMAL/NONE/HEALTHY → HEALTHY;
    ///    CONFIRMED_/SUSPECTED_/DETECTED_/CLASSIFIED_* → POOR (a finding);
    ///  - anything else (NOT_EVALUATED, an unknown token) → UNCLASSIFIED, counted, never dropped.
    /// </summary>
    public const string SummaryByStatus = """
        SELECT s.status AS "Status", COUNT(*)::int AS "Count"
        FROM cpm.loop_registry r
        LEFT JOIN LATERAL (
            SELECT g.diagnosis, g.window_end
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
              AND g.purpose = 'LIVE'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) v ON TRUE
        CROSS JOIN LATERAL (SELECT CASE
            WHEN v.diagnosis IS NULL THEN
                CASE WHEN EXISTS (SELECT 1 FROM analytics.cplm_gate_results g
                                  WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
                                    AND g.purpose = 'LIVE')
                     THEN 'INSUFFICIENT_DATA' ELSE 'NO_RESULT' END
            WHEN v.window_end IS NULL OR v.window_end < now() - make_interval(secs => @staleSeconds) THEN 'STALE'
            WHEN v.diagnosis LIKE 'EXCLUDED%' THEN 'EXCLUDED'
            WHEN v.diagnosis IN ('NORMAL', 'NONE', 'HEALTHY') THEN 'HEALTHY'
            WHEN v.diagnosis ~ '^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_' THEN 'POOR'
            ELSE 'UNCLASSIFIED' END AS status) s
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
          AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
        GROUP BY s.status
        """;

    /// <summary>
    /// A verdict is stale once its window ended longer ago than the window's own size (a 24h
    /// verdict more than 24 h old) — the rule the Loop summary card uses too. "15m", "12h", "7d";
    /// anything unparseable is treated as 24 h.
    /// </summary>
    public static int StaleAfterSeconds(string? windowKind)
    {
        var m = System.Text.RegularExpressions.Regex.Match(windowKind?.Trim() ?? "", @"^(\d+)\s*([mhd])$",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!m.Success || !int.TryParse(m.Groups[1].Value, out var n) || n <= 0) return 24 * 3600;
        return char.ToLowerInvariant(m.Groups[2].Value[0]) switch
        {
            'm' => n * 60,
            'h' => n * 3600,
            _ => n * 86_400,
        };
    }
}
