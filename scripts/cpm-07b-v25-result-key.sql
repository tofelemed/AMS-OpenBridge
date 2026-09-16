-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-07b-v25-result-key.sql — v2.5 (Task 1G.1, spec §1.6): the result tables' unique key
-- gains bundle_hash so a re-evaluation under a different configuration is a NEW row.
--
-- RUN WITH cplm-api STOPPED, right before starting the v2.5 image: the old consumer's
-- ON CONFLICT (loop_id, window_kind, window_end, source) needs the OLD index; the new
-- consumer's ON CONFLICT (..., bundle_hash) needs the NEW one. cpm-07 (additive) must have
-- run first. Idempotent. No CONCURRENTLY: the writer is stopped; plain index builds are
-- seconds at plant size.
--   docker exec -i ams-postgres psql -U ams_user -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-07b-v25-result-key.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Part 2b: a different configuration is a NEW row, never an overwrite. The unique key gains
-- bundle_hash. The cplm-api consumer's ON CONFLICT target changes with it (same release):
-- in the plant this block runs with cplm-api STOPPED, right before the new image starts
-- (scripts/cpm-07b-v25-result-key.sql); the lab applies it here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_gate_results_window_bundle
    ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source, bundle_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_short_window_bundle
    ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end, source, bundle_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_long_window_bundle
    ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end, source, bundle_hash);
DROP INDEX IF EXISTS analytics.uq_cplm_gate_results_window;
DROP INDEX IF EXISTS analytics.uq_cplm_short_window;
DROP INDEX IF EXISTS analytics.uq_cplm_long_window;
-- The planner's statistics reference the dropped indexes until the next ANALYZE; without this the
-- latest-row probes may pick a wrong index for minutes after the swap.
ANALYZE analytics.cplm_gate_results;
ANALYZE analytics.cplm_short_feature_results;
ANALYZE analytics.cplm_long_feature_results;


DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
