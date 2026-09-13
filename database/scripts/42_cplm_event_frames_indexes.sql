-- ═══════════════════════════════════════════════════════════════════════════
-- 42_cplm_event_frames_indexes.sql — CPLM event-frame read-path indexes
--
-- Every CPM read predicate is case-insensitive (`lower(loop_id) = lower($1)`),
-- because loop ids arrive from DCS exports, the registry and deep-link URLs with
-- inconsistent case. The three analytics result tables each carry a matching
-- functional index (30_cplm_analytics_schema: idx_cplm_gate_results_loop_lower,
-- idx_cplm_short_loop_lower, idx_cplm_long_loop_lower) — cplm_event_frames was
-- left out, so its per-loop query could not use ANY index:
--
--   idx_cplm_event_frames_loop_time is on (loop_id, opened_at DESC), which a
--   lower(loop_id) predicate cannot match, so GET /api/v1/cpm/events?loopId=…
--   sequentially scanned the table. The Explorer History tab polls that query
--   every 30s per open tab, and the table only grows.
--
-- The second index covers the ORDER BY behind sort=recent (the chronological
-- episode list) so the newest-N read is an index scan instead of a full sort.
--
-- Idempotent: IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_cplm

-- Case-insensitive per-loop lookup (matches the other three analytics tables).
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_lower
    ON analytics.cplm_event_frames (lower(loop_id));

-- sort=recent: newest-opened first, per loop.
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_lower_opened
    ON analytics.cplm_event_frames (lower(loop_id), opened_at DESC);
