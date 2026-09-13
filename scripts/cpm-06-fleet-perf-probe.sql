-- cpm-06-fleet-perf-probe.sql — CHG-023: record the fleet read-path cost on the plant.
--
--   docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-06-fleet-perf-probe.sql | tee fleet-probe-$(date +%Y%m%d-%H%M).txt
--
-- Run it TWICE: once before ops/cpm-04 (BEFORE), once after the v6 cplm-api is up (AFTER).
-- Section 3 is the query shape the v5 controllers ran (whole-table DISTINCT ON); section 4
-- is the v6 shape (per-loop index probes) — it only finds the indexes after cpm-04.
-- READ-ONLY apart from the EXPLAIN ANALYZE executions themselves.
\timing on

\echo '=== 1. Table size, rows, growth ==='
SELECT count(*) AS rows, min(window_end) AS oldest, max(window_end) AS newest,
       pg_size_pretty(pg_total_relation_size('analytics.cplm_gate_results')) AS total_size,
       count(*) FILTER (WHERE diagnosis IS NULL) AS null_diagnosis_rows   -- expected 0
FROM analytics.cplm_gate_results;
SELECT window_kind, count(*) FROM analytics.cplm_gate_results GROUP BY 1 ORDER BY 1;
SHOW shared_buffers;
SHOW work_mem;

\echo '=== 2. Indexes on the gate table (cpm-04 adds the two idx_cplm_gate_results_latest_* ) ==='
SELECT indexname, pg_size_pretty(pg_relation_size(('analytics.' || indexname)::regclass)) AS size
FROM pg_indexes WHERE schemaname = 'analytics' AND tablename = 'cplm_gate_results' ORDER BY 1;

\echo '=== 3. v5 rankings shape (whole-table DISTINCT ON) — windowKind 24h, limit 50, confidence ==='
EXPLAIN (ANALYZE, BUFFERS, SUMMARY)
WITH latest AS (
    SELECT DISTINCT ON (g.loop_id)
           g.loop_id, g.window_kind, g.window_end, g.diagnosis, g.severity,
           g.confidence, g.effort_ratio, g.triangularity, g.horch_oddness,
           g.acf_period_s, g.good_error_pct, g.mae, g.payload::text AS payload
    FROM analytics.cplm_gate_results g
    WHERE g.window_kind = '24h'
    ORDER BY g.loop_id,
             (g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') DESC,
             g.window_end DESC NULLS LAST, g.created_at DESC
)
SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
       l.window_end, l.diagnosis, l.severity, l.confidence,
       l.effort_ratio, l.triangularity, l.horch_oddness, l.acf_period_s,
       l.good_error_pct, l.mae, l.payload
FROM cpm.loop_registry r
LEFT JOIN latest l ON lower(l.loop_id) = lower(r.loop_id)
WHERE COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
ORDER BY (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC,
         l.confidence DESC NULLS LAST, r.loop_id
LIMIT 50;

\echo '=== 4. v6 rankings shape (per-loop probes) — same parameters ==='
EXPLAIN (ANALYZE, BUFFERS, SUMMARY)
SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
       l.window_end, l.diagnosis, l.severity, l.confidence,
       l.effort_ratio, l.triangularity, l.horch_oddness, l.acf_period_s,
       l.good_error_pct, l.mae, l.flags
FROM cpm.loop_registry r
LEFT JOIN LATERAL (
    SELECT u.* FROM (
        (SELECT g.window_end, g.diagnosis, g.severity, g.confidence, g.effort_ratio, g.triangularity,
                g.horch_oddness, g.acf_period_s, g.good_error_pct, g.mae,
                (g.payload->'observability_flags')::text AS flags, TRUE AS real_verdict
         FROM analytics.cplm_gate_results g
         WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = '24h'
           AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
         ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC LIMIT 1)
        UNION ALL
        (SELECT g.window_end, g.diagnosis, g.severity, g.confidence, g.effort_ratio, g.triangularity,
                g.horch_oddness, g.acf_period_s, g.good_error_pct, g.mae,
                (g.payload->'observability_flags')::text, FALSE
         FROM analytics.cplm_gate_results g
         WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = '24h'
         ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC LIMIT 1)
    ) u ORDER BY u.real_verdict DESC LIMIT 1
) l ON TRUE
WHERE COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
ORDER BY (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC,
         l.confidence DESC NULLS LAST, r.loop_id
LIMIT 50;
