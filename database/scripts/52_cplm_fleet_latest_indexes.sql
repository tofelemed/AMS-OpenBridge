-- ═══════════════════════════════════════════════════════════════════════════
-- 52_cplm_fleet_latest_indexes.sql — CHG-023: fleet "latest verdict per loop" indexes
--
-- The fleet endpoints (summary / rankings / heatmap) resolve each registry loop's newest
-- gate verdict with two index probes: the newest REAL verdict (partial index) and the
-- newest row of any kind (fallback). Before these existed the endpoints sorted the whole
-- gate table on every call — 10–23 s at plant size and growing daily.
--
-- Mirrors: src/services/cplm-api/Data/FleetLatestSql.cs (self-heal DDL) and
-- migration/schema/03-traverse_cplm.sql (fresh plant installs). The plant's live upgrade
-- path is scripts/cpm-04-fleet-latest-indexes.sql (CONCURRENTLY, plain table only).
--
-- Idempotent: IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_cplm

CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_latest_real
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC)
    WHERE diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA';

CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_latest_any
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC);

-- /calculations: "newest row carrying a version" becomes an index walk that stops at the
-- first hit, and the observed-gates sample reads the newest 2,000 rows instead of the oldest.
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_created_at
    ON analytics.cplm_gate_results (created_at DESC);
