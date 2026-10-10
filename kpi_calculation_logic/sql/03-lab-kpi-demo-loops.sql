-- LAB ONLY (traverse_cplm): ten probe loops in site `kpi_demo`, one per KPI state / condition, so the Overview tiles and every
-- drill-down can be checked when the lab feed is stopped. Fresh for 1 h (then they read Stale). Open /cpm?site=kpi_demo.
--   create : psql -d traverse_cplm -X -v ON_ERROR_STOP=1 -v action=create -f 03-lab-kpi-demo-loops.sql
--   cleanup: psql -d traverse_cplm -X -v ON_ERROR_STOP=1 -v action=cleanup -f 03-lab-kpi-demo-loops.sql
-- Expected (fresh): monitored 10 · acceptable 2 · finding 3 · no fault but limited 1 · not assessable 2 (incomplete 1, manual 1)
--                   · stale 1 · never 1 · in normal mode 6 of 7 · saturated 1 of 7 · oscillating / valve / effort 1 of 6 each.
\if :{?action}
\else
  \set action create
\endif
SELECT (:'action' = 'cleanup') AS is_cleanup \gset

DELETE FROM analytics.cplm_gate_results WHERE loop_id LIKE 'KDEMO\_%';
DELETE FROM cpm.loop_registry WHERE site = 'kpi_demo';

\if :is_cleanup
  \echo 'kpi_demo removed'
\else
INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring, criticality)
SELECT 'KDEMO_' || n, d, 'FIC', 'kpi_demo', 'area1', 'unit1', '{"enabled":true}'::jsonb, 'medium'
FROM (VALUES ('OK1','Feed flow'),('OK2','Reflux flow'),('OSC','Steam flow'),('VLV','Level control'),('EFF','Pressure'),
             ('SAT','Cooling water'),('MAN','Bypass flow'),('GAP','Drum level'),('OLD','Old loop'),('NEW','New loop')) v(n,d);
INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, confidence, purpose, payload, created_at)
VALUES
 ('KDEMO_OK1','24h', NOW()-interval '5 min','NO_CALL',0.2,'LIVE','{"auto_pct":1.0,"manual_pct":0.0,"saturation_pct":0.0,"limit_source":"REGISTRY"}',NOW()),
 ('KDEMO_OK2','24h', NOW()-interval '9 min','INSUFFICIENT_EVIDENCE',0.3,'LIVE','{"auto_pct":0.97,"manual_pct":0.03,"saturation_pct":0.02,"limit_source":"REGISTRY"}',NOW()),
 ('KDEMO_OSC','24h', NOW()-interval '7 min','CONFIRMED_OSCILLATION',0.96,'LIVE','{"auto_pct":1.0,"saturation_pct":0.0,"period_status":"VALID","validated_period_s":142,"acf_regularity":0.81}',NOW()),
 ('KDEMO_VLV','24h', NOW()-interval '6 min','SUSPECTED_FINAL_ELEMENT_NONLINEARITY',0.89,'LIVE','{"auto_pct":0.99,"saturation_pct":0.0,"confirmation":{"state":"NOT_CONFIRMED"}}',NOW()),
 ('KDEMO_EFF','24h', NOW()-interval '8 min','SUSPECTED_EXCESSIVE_EFFORT',0.8,'LIVE','{"auto_pct":1.0,"saturation_pct":0.0,"effort_ratio":3.4,"travel_per_day":1820,"reversals_per_hour":41}',NOW()),
 ('KDEMO_SAT','24h', NOW()-interval '4 min','NO_CALL',0.1,'LIVE','{"auto_pct":1.0,"saturation_pct":0.27,"limit_source":"FALLBACK_0_100","sat_limit_dwell_s":5400}',NOW()),
 ('KDEMO_MAN','24h', NOW()-interval '5 min','EXCLUDED_MODE',0.0,'LIVE','{"auto_pct":0.12,"manual_pct":0.88,"saturation_pct":0.0}',NOW()),
 ('KDEMO_GAP','24h', NOW()-interval '6 min','INSUFFICIENT_DATA',0.0,'LIVE','{"completeness":0.66,"bad_quality_pct":0.0,"sample_count":11481,"expected_sample_count":17280,"max_gap_s":20511}',NOW()),
 ('KDEMO_GAP','24h', NOW()-interval '3 days','CONFIRMED_OSCILLATION',0.95,'LIVE','{"auto_pct":1.0}',NOW()),
 ('KDEMO_OLD','24h', NOW()-interval '5 hours','NO_CALL',0.2,'LIVE','{"auto_pct":1.0}',NOW());
\echo 'kpi_demo created: open /cpm?site=kpi_demo'
\endif
