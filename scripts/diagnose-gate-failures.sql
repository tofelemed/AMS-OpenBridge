-- Which gate is failing, and why — run on the CPA host against traverse_cplm.
--
--   docker exec -i <postgres> psql -U ams_user -d traverse_cplm -f - < scripts/diagnose-gate-failures.sql
--
-- Gate statuses live only in the payload JSONB (analytics.cplm_gate_results has no
-- per-gate columns), so every query below digs into payload->'gates'.

\echo '=== 1. Verdict mix (last 24h) — EXCLUDED_MODE here means G1 killed the window ==='
SELECT diagnosis, count(*) AS windows, round(avg(confidence)::numeric, 3) AS avg_conf
FROM analytics.cplm_gate_results
WHERE created_at > now() - interval '24 hours'
GROUP BY diagnosis
ORDER BY windows DESC;

\echo ''
\echo '=== 2. Per-gate status counts (last 24h) — find the gate that never passes ==='
SELECT g.key AS gate,
       g.value ->> 'status' AS status,
       count(*) AS windows
FROM analytics.cplm_gate_results r,
     LATERAL jsonb_each(r.payload -> 'gates') AS g
WHERE r.created_at > now() - interval '24 hours'
GROUP BY 1, 2
ORDER BY gate, windows DESC;

\echo ''
\echo '=== 3. Mode vocabulary actually reaching the engine (G1 root cause) ==='
-- auto_pct near 0 across the fleet = mode strings are not in the auto vocabulary,
-- i.e. mode_value_map is missing or wrong in the ingestion data-source config.
SELECT round(avg((payload ->> 'auto_pct')::numeric), 3) AS avg_auto_pct,
       count(*) FILTER (WHERE (payload ->> 'auto_pct')::numeric = 0) AS windows_zero_auto,
       count(*) AS windows
FROM analytics.cplm_gate_results
WHERE created_at > now() - interval '24 hours'
  AND payload ? 'auto_pct';

\echo ''
\echo '=== 4. Error band vs engineering units (G3 / OCE root cause) ==='
-- good_error_pct is the share of samples with |SP-PV| <= 0.5 ABSOLUTE EU (hardcoded).
-- A fleet-wide 0 with non-zero mae means the loops are simply not in percent units.
SELECT round(avg(good_error_pct)::numeric, 3) AS avg_good_error_pct,
       round(avg(mae)::numeric, 3)            AS avg_mae,
       count(*) FILTER (WHERE good_error_pct = 0) AS windows_zero,
       count(*) AS windows
FROM analytics.cplm_gate_results
WHERE created_at > now() - interval '24 hours';

\echo ''
\echo '=== 5. Data sufficiency (G0) — completeness and sample counts ==='
SELECT window_kind,
       count(*) AS windows,
       round(avg(sample_count)::numeric, 1) AS avg_samples,
       round(avg((payload ->> 'completeness')::numeric), 3) AS avg_completeness
FROM analytics.cplm_gate_results
WHERE created_at > now() - interval '24 hours'
GROUP BY window_kind
ORDER BY window_kind;

\echo ''
\echo '=== 6. Worst offenders — loops whose newest verdict is not a real diagnosis ==='
SELECT DISTINCT ON (loop_id)
       loop_id, window_kind, diagnosis, severity, confidence, sample_count, window_end
FROM analytics.cplm_gate_results
WHERE created_at > now() - interval '24 hours'
ORDER BY loop_id, window_end DESC
LIMIT 25;
