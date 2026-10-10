// KPI Phase 1 (kpi_calculation_logic/KPI-LOGIC.md): the ONE read behind every Overview KPI tile and its drill-down.
// Per monitored loop in scope: its newest LIVE 24 h row of any diagnosis (what the loop looks like now) and its newest real
// verdict (context for "last verdict N days ago"). Both are per-loop index probes — the same CHG-023 shape as FleetLatestSql —
// so the cost stays one probe pair per loop at any table size. Classification happens in FleetKpiClassifier (C#), so the
// tile counts and the drill-down rows can never disagree.
namespace Traverse.CplmApi.Data;

public static class FleetKpiSql
{
    public const string Rows = """
        SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
               n.window_end            AS n_window_end,
               n.diagnosis             AS n_diagnosis,
               n.confidence            AS n_confidence,
               (n.payload->>'auto_pct')::float8            AS auto_pct,
               (n.payload->>'manual_pct')::float8          AS manual_pct,
               (n.payload->>'saturation_pct')::float8      AS saturation_pct,
               n.payload->>'limit_source'                  AS limit_source,
               (n.payload->>'sat_limit_dwell_s')::float8   AS sat_limit_dwell_s,
               (n.payload->>'completeness')::float8        AS completeness,
               (n.payload->>'bad_quality_pct')::float8     AS bad_quality_pct,
               (n.payload->>'sample_count')::float8        AS sample_count,
               (n.payload->>'expected_sample_count')::float8 AS expected_sample_count,
               (n.payload->>'max_gap_s')::float8           AS max_gap_s,
               n.payload->>'gate0_reason'                  AS gate0_reason,
               n.payload->>'period_status'                 AS period_status,
               (n.payload->>'validated_period_s')::float8  AS validated_period_s,
               (n.payload->>'acf_regularity')::float8      AS acf_regularity,
               (n.payload->>'effort_ratio')::float8        AS effort_ratio,
               (n.payload->>'travel_per_day')::float8      AS travel_per_day,
               (n.payload->>'reversals_per_hour')::float8  AS reversals_per_hour,
               n.payload->'confirmation'->>'state'         AS g14_state,
               v.window_end            AS v_window_end,
               v.diagnosis             AS v_diagnosis
        FROM cpm.loop_registry r
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis, g.confidence, g.payload
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) n ON TRUE
        LEFT JOIN LATERAL (
            SELECT g.window_end, g.diagnosis
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
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
