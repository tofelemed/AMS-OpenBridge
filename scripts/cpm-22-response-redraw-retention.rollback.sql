-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-22-response-redraw-retention.rollback.sql — undo CHG-199 (online).
--   * RESPONSE back to 30 days where cpm-22 set 90: the next sweep (<= 15 min) deletes accepted events older than 30 days with
--     their quantities and charts (LOST: those events can no longer be redrawn from the historian either);
--   * row RESPONSE_CHARTS removed: an accepted event's charts live as long as the event again (charts already deleted by age
--     are not restored; G12 charts cannot be rebuilt).
-- Safe with either cplm-api image; roll the image back before or after.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-22-response-redraw-retention.rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '10s';
UPDATE analytics.retention_policy SET days = 30 WHERE record_class = 'RESPONSE' AND days = 90;
DELETE FROM analytics.retention_policy WHERE record_class = 'RESPONSE_CHARTS';
SELECT 'cpm-22 rollback OK | RESPONSE=' || coalesce(days::text, '-') || 'd | RESPONSE_CHARTS rows: '
       || (SELECT count(*) FROM analytics.retention_policy WHERE record_class = 'RESPONSE_CHARTS')
FROM analytics.retention_policy WHERE record_class = 'RESPONSE';
