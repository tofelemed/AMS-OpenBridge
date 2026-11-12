-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-21-response-charts.sql — PLANT live upgrade for CHG-105: the System Response (G12) charts live as long as their event.
-- Before: the response job's arrays (response chart, residuals, candidate models, delay curve, parameter uncertainty, Bode)
-- were TRANSIENT like every live artifact and deleted after 6 h, while the event stayed listed 14 days (Marun 2026-11-12:
-- 563 of 17,773 accepted events still had charts). Now the new cplm-api's evidence sweeper (every 15 min) moves the G12
-- charts of every ACCEPTED event (capture_state other than CENSORED) to retention class RESPONSE, which follows this row:
--   * RESPONSE days = 30: an accepted event, its 52 quantities and its charts are kept 30 days (was 14); unreviewed system
--     models age out with the same days; an event a kept model was built from keeps its charts while it is kept;
--   * RESPONSE max_bytes = 2 GiB: cap on the charts only (oldest first; the events and quantities stay; the charts of a
--     reviewed / baseline / newest / newest VALIDATED model are never trimmed). Estimate at Marun: ~0.5-0.8 GB at 30 days;
--   * censored candidates are unchanged: RESPONSE_CENSORED days (3) for the event, TRANSIENT (6 h) for the charts.
-- Measured cost basis (Marun 2026-11-12): ~1,250 accepted events a day (1,800-2,000 recently), ~4.9 KB of charts per event
-- (~13 KB on disk with row overhead), ~21 KB per event for the event row + quantities; disk 194 GB, 81 GB free.
--
-- RUN ONLINE (no stop), BEFORE the cplm-api swap (release step PRE_SWAP, after cpm-19 / cpm-20 / cpm-20b). The old image
-- reads only RESPONSE days (it keeps events 30 days and ignores max_bytes); the new one keeps the charts from its first sweep
-- (5 min after start) - the charts of the last 6 h are moved too, nothing older exists.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-21-response-charts.sql
-- Idempotent: the row is an upsert (re-running resets 30 d / 2 GiB). Needs cpm-19 (the max_bytes column; added here too).
-- Rollback (online): ops/cpm-21-response-charts.rollback.sql - 14 days again, the kept charts go back to TRANSIENT and are
-- deleted by the next sweep. Roll the cplm-api image back FIRST (the new one would move them out again).
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '10s';
ALTER TABLE analytics.retention_policy ADD COLUMN IF NOT EXISTS max_bytes bigint;
INSERT INTO analytics.retention_policy (record_class, days, max_bytes) VALUES ('RESPONSE', 30, 2147483648)
    ON CONFLICT (record_class) DO UPDATE SET days = EXCLUDED.days, max_bytes = EXCLUDED.max_bytes;
SELECT 'cpm-21 OK | ' || record_class || '=' || coalesce(days::text, '-') || 'd/' || coalesce((max_bytes >> 30)::text, '-') || 'GiB'
FROM analytics.retention_policy WHERE record_class = 'RESPONSE';
