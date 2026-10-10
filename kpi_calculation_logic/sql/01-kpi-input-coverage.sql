-- Phase 0 / step 1 (read-only, traverse_cplm): for each KPI input, how many monitored loops have a real value on their
-- newest LIVE 24h result, how many have none (NULL / absent), and how many carry an exact 0.
-- Run: psql -d traverse_cplm -X -v basis=latest -f 01-kpi-input-coverage.sql   (basis = latest | real)
--   latest = the newest LIVE 24h row of any diagnosis (what the loop looks like now)
--   real   = the newest LIVE 24h row with a real verdict (not INSUFFICIENT_DATA) — what a KPI can be computed from
WITH mon AS (
    SELECT loop_id, engineering FROM cpm.loop_registry
    WHERE is_active AND COALESCE((monitoring->>'enabled')::boolean, FALSE)
), l AS (
    SELECT g.*
    FROM mon m
    CROSS JOIN LATERAL (
        SELECT r.loop_id, r.window_end, r.diagnosis, r.payload, r.confidence,
               (r.payload->>'good_error_pct')::float AS good_error_pct, (r.payload->>'mae')::float AS mae,
               (r.payload->>'travel_per_day')::float AS travel_per_day, (r.payload->>'reversals_per_hour')::float AS reversals_per_hour,
               (r.payload->>'acf_period_s')::float AS acf_period_s
        FROM analytics.cplm_gate_results r
        WHERE lower(r.loop_id) = lower(m.loop_id) AND r.window_kind = '24h' AND r.purpose = 'LIVE'
          AND (:'basis' = 'latest' OR (r.diagnosis IS NOT NULL AND r.diagnosis <> 'INSUFFICIENT_DATA'))
        ORDER BY r.window_end DESC NULLS LAST, r.created_at DESC
        LIMIT 1) g
), v AS (
    SELECT l.loop_id, l.window_end, l.diagnosis,
           (l.payload->>'completeness')::float      AS completeness,
           l.payload->'gates'->>'G0'                AS g0,
           (l.payload->>'auto_pct')::float          AS auto_pct,
           (l.payload->>'manual_pct')::float        AS manual_pct,
           (l.payload->>'saturation_pct')::float    AS saturation_pct,
           (l.payload->>'pv_std')::float            AS pv_std,
           (l.payload->>'sp_changes_per_h')::float  AS sp_changes_per_h,
           l.good_error_pct, l.mae, l.travel_per_day, l.reversals_per_hour, l.acf_period_s, l.confidence
    FROM l
)
SELECT 'monitored loops' AS input, (SELECT count(*) FROM mon)::text AS value, NULL::bigint AS has_value, NULL::bigint AS is_null, NULL::bigint AS is_zero
UNION ALL SELECT 'loops with a LIVE 24h row', count(*)::text, NULL, NULL, NULL FROM v
UNION ALL SELECT 'row newer than 1 h', count(*) FILTER (WHERE window_end > now() - interval '1 hour')::text, NULL, NULL, NULL FROM v
UNION ALL SELECT 'row newer than 24 h', count(*) FILTER (WHERE window_end > now() - interval '24 hours')::text, NULL, NULL, NULL FROM v
UNION ALL SELECT 'row window_end oldest / newest', min(window_end)::text || ' / ' || max(window_end)::text, NULL, NULL, NULL FROM v
UNION ALL SELECT x.input, NULL, count(*) FILTER (WHERE x.val IS NOT NULL AND x.val <> 0), count(*) FILTER (WHERE x.val IS NULL), count(*) FILTER (WHERE x.val = 0)
FROM v CROSS JOIN LATERAL (VALUES
    ('completeness', completeness), ('auto_pct', auto_pct), ('manual_pct', manual_pct), ('saturation_pct', saturation_pct),
    ('pv_std', pv_std), ('sp_changes_per_h', sp_changes_per_h), ('good_error_pct', good_error_pct), ('mae', mae),
    ('travel_per_day', travel_per_day), ('reversals_per_hour', reversals_per_hour), ('acf_period_s', acf_period_s),
    ('confidence', confidence)) AS x(input, val)
GROUP BY x.input
UNION ALL SELECT 'diagnosis = ' || COALESCE(diagnosis, '(null)'), count(*)::text, NULL, NULL, NULL FROM v GROUP BY diagnosis
UNION ALL SELECT 'G0 = ' || COALESCE(g0, '(null)'), count(*)::text, NULL, NULL, NULL FROM v GROUP BY g0
UNION ALL SELECT 'loops with a PV span (pvMin/pvMax)', count(*)::text, NULL, NULL, NULL FROM mon
    WHERE (engineering->>'pvMin') IS NOT NULL AND (engineering->>'pvMax') IS NOT NULL;
