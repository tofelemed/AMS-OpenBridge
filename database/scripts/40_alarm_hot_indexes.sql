-- ═══════════════════════════════════════════════════════════════════════════
-- 40_alarm_hot_indexes.sql — Plan 05 item 2 (DATA-10)
--
-- Indexes for the hot query predicates the API actually issues:
--   • alarm_current: the ingest upsert predicate is covered by Plan 01's unique
--     identity index (35_alarm_current_identity). Added here: state+time for the
--     filtered active list, and trigram on source for the sourceNameContains
--     ILIKE filter (which turns into a full scan without it).
--   • alarm_history: state+time for filtered history reads, time+source for the
--     analytics range scans, trigram on source for contains-search.
--
-- pg_trgm ships in 01_init_extensions for ams (re-asserted here, idempotent).
-- Review pg_stat_user_indexes after a week of production traffic and drop
-- anything with idx_scan = 0.
--
-- Idempotent: IF NOT EXISTS throughout. Works on both plain tables and the
-- hypertables created by 39 (indexes propagate to chunks).
-- ═══════════════════════════════════════════════════════════════════════════

\c ams

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── alarm_current (bounded, hot) ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alarm_current_source
    ON alarms.alarm_current (source);
CREATE INDEX IF NOT EXISTS idx_alarm_current_state_time
    ON alarms.alarm_current (state, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_alarm_current_source_trgm
    ON alarms.alarm_current USING gin (source gin_trgm_ops);

-- ── alarm_history (hypertable after 39) ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alarm_history_state_time
    ON alarms.alarm_history (state, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_alarm_history_time_source
    ON alarms.alarm_history (event_time, source);
CREATE INDEX IF NOT EXISTS idx_alarm_history_source_trgm
    ON alarms.alarm_history USING gin (source gin_trgm_ops);
