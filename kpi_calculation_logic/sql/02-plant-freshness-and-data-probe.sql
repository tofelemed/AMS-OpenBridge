-- Phase 0 / step 2 (READ-ONLY, traverse_cplm): why loops read STALE / NOT EVALUATED, and what a fair KPI basis would give.
-- Safe on the plant: SELECT only, per-loop index probes (CHG-023 indexes), no locks beyond normal reads.
-- Run on the VM:
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -X < 02-plant-freshness-and-data-probe.sql > kpi-probe-$(date +%Y%m%d).txt
-- then send back the .txt (it holds loop ids and numbers only).

\echo '== A. Freshness: newest LIVE 24h row of ANY diagnosis, per monitored loop =='
WITH mon AS (SELECT loop_id FROM cpm.loop_registry WHERE is_active AND COALESCE((monitoring->>'enabled')::boolean, FALSE)),
n AS (SELECT m.loop_id, g.window_end, g.diagnosis
      FROM mon m LEFT JOIN LATERAL (
          SELECT r.window_end, r.diagnosis FROM analytics.cplm_gate_results r
          WHERE lower(r.loop_id) = lower(m.loop_id) AND r.window_kind = '24h' AND r.purpose = 'LIVE'
          ORDER BY r.window_end DESC NULLS LAST, r.created_at DESC LIMIT 1) g ON TRUE)
SELECT CASE WHEN window_end IS NULL THEN '0 never'
            WHEN window_end > now() - interval '1 hour'  THEN '1 < 1 h'
            WHEN window_end > now() - interval '6 hours' THEN '2 1-6 h'
            WHEN window_end > now() - interval '24 hours' THEN '3 6-24 h'
            ELSE '4 > 24 h' END AS newest_row_age,
       COALESCE(diagnosis, '(none)') AS newest_diagnosis, count(*) AS loops
FROM n GROUP BY 1, 2 ORDER BY 1, 3 DESC;

\echo '== B. Newest REAL verdict (not INSUFFICIENT_DATA): age and diagnosis =='
WITH mon AS (SELECT loop_id FROM cpm.loop_registry WHERE is_active AND COALESCE((monitoring->>'enabled')::boolean, FALSE)),
v AS (SELECT m.loop_id, g.window_end, g.diagnosis
      FROM mon m LEFT JOIN LATERAL (
          SELECT r.window_end, r.diagnosis FROM analytics.cplm_gate_results r
          WHERE lower(r.loop_id) = lower(m.loop_id) AND r.window_kind = '24h' AND r.purpose = 'LIVE'
            AND r.diagnosis IS NOT NULL AND r.diagnosis <> 'INSUFFICIENT_DATA'
          ORDER BY r.window_end DESC NULLS LAST, r.created_at DESC LIMIT 1) g ON TRUE)
SELECT CASE WHEN window_end IS NULL THEN '0 never'
            WHEN window_end > now() - interval '24 hours' THEN '1 < 24 h'
            WHEN window_end > now() - interval '3 days' THEN '2 1-3 d'
            WHEN window_end > now() - interval '7 days' THEN '3 3-7 d'
            ELSE '4 > 7 d' END AS newest_real_verdict_age,
       COALESCE(diagnosis, '(none)') AS diagnosis, count(*) AS loops
FROM v GROUP BY 1, 2 ORDER BY 1, 3 DESC;

\echo '== C. Loops whose newest row is INSUFFICIENT_DATA: why (G0 inputs) =='
WITH mon AS (SELECT loop_id FROM cpm.loop_registry WHERE is_active AND COALESCE((monitoring->>'enabled')::boolean, FALSE)),
n AS (SELECT m.loop_id, g.payload
      FROM mon m JOIN LATERAL (
          SELECT r.payload, r.diagnosis FROM analytics.cplm_gate_results r
          WHERE lower(r.loop_id) = lower(m.loop_id) AND r.window_kind = '24h' AND r.purpose = 'LIVE'
          ORDER BY r.window_end DESC NULLS LAST, r.created_at DESC LIMIT 1) g ON g.diagnosis = 'INSUFFICIENT_DATA')
SELECT width_bucket((payload->>'completeness')::float, 0, 1, 10) AS completeness_decile,
       round(avg((payload->>'completeness')::float)::numeric, 3) AS avg_completeness,
       round(avg((payload->>'bad_quality_pct')::float)::numeric, 3) AS avg_bad_quality,
       round(avg((payload->>'sample_count')::float)) AS avg_samples,
       round(avg((payload->>'expected_sample_count')::float)) AS avg_expected,
       round(avg((payload->>'sample_period_sec')::float)::numeric, 2) AS avg_sample_period_s,
       round(avg((payload->>'max_gap_s')::float)) AS avg_max_gap_s,
       count(*) AS loops
FROM n GROUP BY 1 ORDER BY 1;

\echo '== D. Every diagnosis code written in the last 3 days (24h LIVE) - which codes mean "no fault found" =='
SELECT diagnosis, count(*) AS rows, count(DISTINCT lower(loop_id)) AS loops
FROM analytics.cplm_gate_results
WHERE window_kind = '24h' AND purpose = 'LIVE' AND created_at > now() - interval '3 days'
GROUP BY 1 ORDER BY 2 DESC;

\echo '== E. Acquisition contract per loop (a declared grid finer than the real cadence fails every G0) =='
SELECT COALESCE(r.acquisition::text, '(none)') AS acquisition, count(*) AS loops
FROM cpm.loop_registry r
WHERE r.is_active AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
GROUP BY 1 ORDER BY 2 DESC;
