-- CHG-225 impact check (read only): temperature and vapour-pressure loops whose fused verdict rests on valve geometry.
-- Today those two class packs let geometry decide alone; after CHG-225 a geometry verdict needs the stiction evidence too.
\pset footer off
SET statement_timeout = '300s';

\echo '1) Last 14 days, fused 12h / 24h verdicts (will_change = geometry chosen without qualified stiction evidence; may_change = geometry chosen at all)'
SELECT payload->>'gate_profile_id' AS profile, window_kind,
       count(*) AS verdicts,
       count(DISTINCT loop_id) AS loops,
       count(*) FILTER (WHERE payload->>'selected_family' = 'geometry') AS may_change,
       count(*) FILTER (WHERE payload->>'selected_family' = 'geometry' AND payload->>'stiction_qualified' IS DISTINCT FROM 'true') AS will_change,
       count(DISTINCT loop_id) FILTER (WHERE payload->>'selected_family' = 'geometry') AS loops_may_change
FROM analytics.cplm_gate_results
WHERE purpose = 'LIVE' AND source = 'flink' AND window_kind IN ('12h', '24h')
  AND created_at >= now() - interval '14 days'
  AND payload->>'gate_profile_id' IN ('TEMP_SLOW_SELF_REG', 'PRESSURE_VAPOUR_SLOW')
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '2) Loops whose latest 24h verdict (last 2 days) rests on geometry'
SELECT * FROM (
  SELECT DISTINCT ON (loop_id) loop_id, payload->>'gate_profile_id' AS profile, window_end, diagnosis,
         round(confidence::numeric, 2) AS confidence, payload->>'stiction_qualified' AS stiction_qualified
  FROM analytics.cplm_gate_results
  WHERE purpose = 'LIVE' AND source = 'flink' AND window_kind = '24h'
    AND created_at >= now() - interval '2 days'
    AND payload->>'gate_profile_id' IN ('TEMP_SLOW_SELF_REG', 'PRESSURE_VAPOUR_SLOW')
  ORDER BY loop_id, window_end DESC, result_revision DESC, created_at DESC
) latest
WHERE latest.loop_id IN (
  SELECT loop_id FROM analytics.cplm_gate_results
  WHERE purpose = 'LIVE' AND source = 'flink' AND window_kind = '24h' AND created_at >= now() - interval '2 days'
    AND payload->>'selected_family' = 'geometry')
ORDER BY loop_id;

\echo '3) Loops per class pack (registry, active)'
SELECT loop_type, count(*) FROM cpm.loop_registry WHERE is_active AND upper(loop_type) IN ('TIC', 'PIC_VAPOUR') GROUP BY 1 ORDER BY 1;
