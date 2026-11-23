// KPI Phase 1 (kpi_calculation_logic/KPI-LOGIC.md): the ONE read behind every Overview KPI tile and its drill-down.
// Per monitored loop in scope: its newest LIVE row of any diagnosis (what the loop looks like now) and its newest real
// verdict (context for "last verdict N days ago"). Both are per-loop index probes — the same CHG-023 shape as FleetLatestSql —
// so the cost stays one probe pair per loop at any table size. @asOf = now for the current picture, now − 24 h for the
// "change since yesterday" (the same rules applied to the rows that existed then). Classification happens in FleetKpiClassifier (C#), so the
// tile counts and the drill-down rows can never disagree.
// CHG-226: while the newest row is a refill window after a Flink restart (RefillSql), the loop's last real verdict in reach is read
// as well (f_*, a third probe that only runs for a warming_up newest row) and classified in its place; freshness stays the newest row's.
namespace Traverse.CplmApi.Data;

public static class FleetKpiSql
{
    /// <summary>The stored values one window gives the classifier, under a column prefix: n_ = the newest row, f_ = the refill fallback.</summary>
    private static string Window(string a) => $"""
               {a}.window_end            AS {a}_window_end,
               {a}.diagnosis             AS {a}_diagnosis,
               {a}.confidence            AS {a}_confidence,
               ({a}.payload->>'auto_pct')::float8            AS {a}_auto_pct,
               ({a}.payload->>'manual_pct')::float8          AS {a}_manual_pct,
               ({a}.payload->>'saturation_pct')::float8      AS {a}_saturation_pct,
               {a}.payload->>'limit_source'                  AS {a}_limit_source,
               ({a}.payload->>'sat_limit_dwell_s')::float8   AS {a}_sat_limit_dwell_s,
               ({a}.payload->>'completeness')::float8        AS {a}_completeness,
               ({a}.payload->>'bad_quality_pct')::float8     AS {a}_bad_quality_pct,
               ({a}.payload->>'sample_count')::float8        AS {a}_sample_count,
               ({a}.payload->>'expected_sample_count')::float8 AS {a}_expected_sample_count,
               ({a}.payload->>'max_gap_s')::float8           AS {a}_max_gap_s,
               {a}.payload->>'gate0_reason'                  AS {a}_gate0_reason,
               {a}.payload->>'period_status'                 AS {a}_period_status,
               ({a}.payload->>'validated_period_s')::float8  AS {a}_validated_period_s,
               ({a}.payload->>'acf_regularity')::float8      AS {a}_acf_regularity,
               ({a}.payload->>'effort_ratio')::float8        AS {a}_effort_ratio,
               ({a}.payload->>'travel_per_day')::float8      AS {a}_travel_per_day,
               ({a}.payload->>'reversals_per_hour')::float8  AS {a}_reversals_per_hour,
               {a}.payload->'confirmation'->>'state'         AS {a}_g14_state,
               -- CHG-093 (SME review 2 #12): the window's own performance gates, beside the diagnosis
               {a}.payload->'gates'->>'G3'                   AS {a}_g3_status,
               {a}.payload->'gates'->>'G4'                   AS {a}_g4_status,
               {a}.good_error_pct                            AS {a}_good_error_pct,
               {a}.mae                                       AS {a}_mae
        """;

    public static readonly string Rows = $"""
        SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
        {Window("n")},
               {RefillSql.Refilling("n", "@asOf", "@freshSeconds")} AS n_refilling,
               {RefillSql.CoverageFrom("n")} AS n_coverage_from,
        {Window("f")},
               -- SME review 2 #11: error is only compared across loops as a share of the registered PV span
               CASE WHEN jsonb_typeof(r.engineering->'pvMax') = 'number' AND jsonb_typeof(r.engineering->'pvMin') = 'number'
                    THEN (r.engineering->>'pvMax')::float8 - (r.engineering->>'pvMin')::float8 END AS pv_span,
               -- Task 7: the "Diagnostic capability" gap, the same rule as the registry count in CpmFleetController
               (NOT (r.tags ? 'vp') AND {Traverse.CplmApi.Services.Registry.OptionalInputs.VpApplicabilitySql} = 'EXPECTED') AS vp_expected_unmapped,
               v.window_end            AS v_window_end,
               v.diagnosis             AS v_diagnosis
        FROM cpm.loop_registry r
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis, g.confidence, g.payload, g.good_error_pct, g.mae
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
              AND g.window_end <= @asOf
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) n ON TRUE
        -- CHG-226: while the newest row is a fresh refill window (flagged, ended within @freshSeconds of @asOf), the last real verdict
        -- of the streaming engine within one window length of the refill's coverage start; the leading conditions name only the
        -- outer row, so for a newest row that is not a refill window no index is touched
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis, g.confidence, g.payload, g.good_error_pct, g.mae
            FROM analytics.cplm_gate_results g
            WHERE {RefillSql.Refilling("n", "@asOf", "@freshSeconds")} AND NOT {RefillSql.IsVerdict("n")}
              AND lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE' AND g.source = 'flink'
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
              AND g.window_end <= @asOf
              AND g.window_end >= {RefillSql.CoverageFrom("n")} - {RefillSql.WindowLength}
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) f ON TRUE
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
              AND g.window_end <= @asOf
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) v ON TRUE
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
          AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
        ORDER BY r.loop_id
        """;
}
