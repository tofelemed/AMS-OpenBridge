-- cpm-04-fleet-latest-indexes.sql — CHG-023: fleet read-path indexes (plant, run BEFORE the
-- v6 cplm-api image is loaded).
--
--   docker exec -i instrumental-postgres psql -U ams_user -d traverse_cplm -f - < ops/cpm-04-fleet-latest-indexes.sql
--
-- Why: /api/v1/cpm/fleet/{summary,rankings,heatmap} found each loop's newest verdict by
-- sorting the ENTIRE analytics.cplm_gate_results table (10–23 s per call at 171 loops ×
-- 11 days). The new queries probe these two indexes per loop instead (~20 ms).
--
-- CONCURRENTLY: no write lock, the consumer keeps writing. It cannot run inside a
-- transaction — do NOT wrap this file in BEGIN/COMMIT and do NOT pass psql -1.
-- Idempotent (IF NOT EXISTS). The cplm-api self-heal DDL creates the same two indexes
-- (non-concurrently) if they are missing at startup, so running this first makes the
-- image swap a no-op on the database.
--
-- NOTE: prod's gate table is a plain table. On a TimescaleDB hypertable (the lab)
-- CONCURRENTLY is not supported — use database/scripts/52_cplm_fleet_latest_indexes.sql there.
\timing on

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cplm_gate_results_latest_real
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC)
    WHERE diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cplm_gate_results_latest_any
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC);

-- /calculations (Calculations, Explorer, Governance, Replay pages): the engine-version lookup
-- ordered by created_at with no usable index detoasted every payload -- 30 s -> HTTP 500.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cplm_gate_results_created_at
    ON analytics.cplm_gate_results (created_at DESC);

ANALYZE analytics.cplm_gate_results;

-- Proof: both present AND valid (a CONCURRENTLY build that was interrupted leaves an
-- INVALID index behind — drop it and re-run this file if indisvalid is false).
SELECT i.relname AS index_name, x.indisvalid AS valid,
       pg_size_pretty(pg_relation_size(i.oid)) AS size
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'analytics' AND t.relname = 'cplm_gate_results'
  AND i.relname IN ('idx_cplm_gate_results_latest_real', 'idx_cplm_gate_results_latest_any', 'idx_cplm_gate_results_created_at')
ORDER BY 1;
