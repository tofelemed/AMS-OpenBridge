-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-22-response-redraw-retention.sql — PLANT live upgrade for CHG-199 (owner Q11, 2026-11-15): accepted System Response
-- events keep their record and quantities 90 days, their stored charts 30 days. After 30 days the System Response page redraws
-- an event's trends from the historian (CHG-198; loop samples are kept 90 days), which needs the event and its quantities.
--   * row RESPONSE days 30 -> 90: an accepted event and its 52 quantities (and the unreviewed system models, which age out with
--     the same days) are kept 90 days. Moved only where it is still the shipped 30, so an operator's own value survives;
--   * new row RESPONSE_CHARTS days = 30: the new cplm-api's evidence sweeper (every 15 min) deletes an accepted event's G12
--     charts (class RESPONSE) older than 30 days while the event stays; never the charts of a kept model (reviewed, baseline,
--     newest, newest VALIDATED per loop and path), never a pinned chart, never a censored event's (those follow the event);
--     max_bytes is not used. No row = the charts live as long as the event (the CHG-105 behaviour);
--   * RESPONSE max_bytes (2 GiB chart cap) and RESPONSE_CENSORED (3 days for a censored event and its charts) are unchanged.
-- Cost basis (Marun 2026-11-12, CHG-105): ~1,250-2,000 accepted events a day, ~21 KB per event for the event row + quantities:
-- 90 days ~ 2.4-3.8 GB, +1.6-2.5 GB over the 30 days of today; the charts stay ~0.8 GB at 30 days.
--
-- RUN ONLINE (no stop), AFTER the cplm-api swap (release step POST_SWAP). Either order is safe: the old image keeps events and
-- their charts 90 days and ignores RESPONSE_CHARTS (no evidence class has that name); the new image without the row keeps the
-- charts with the event. The first sweep after both deletes the accepted charts older than 30 days (5 min after start).
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-22-response-redraw-retention.sql
-- Idempotent: re-running changes nothing (RESPONSE moves only from 30; the RESPONSE_CHARTS row is inserted once).
-- Rollback (online): ops/cpm-22-response-redraw-retention.rollback.sql - RESPONSE 30 days again and the row removed; the next
-- sweep then deletes accepted events older than 30 days with their quantities (charts deleted by age are not restored).
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '10s';
UPDATE analytics.retention_policy SET days = 90 WHERE record_class = 'RESPONSE' AND days = 30;
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE_CHARTS', 30)
    ON CONFLICT (record_class) DO NOTHING;
SELECT 'cpm-22 OK | ' || string_agg(record_class || '=' || coalesce(days::text, '-') || 'd', ' ' ORDER BY record_class)
FROM analytics.retention_policy WHERE record_class IN ('RESPONSE', 'RESPONSE_CHARTS');
