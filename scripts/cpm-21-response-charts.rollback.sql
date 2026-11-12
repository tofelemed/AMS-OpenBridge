-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-21-response-charts.rollback.sql — undo CHG-105 (online). Roll the cplm-api image back FIRST: the new image moves
-- accepted-event charts out of TRANSIENT again on its next sweep.
--   * RESPONSE back to 14 days, no byte cap (the CHG-049 values);
--   * every RESPONSE-class chart goes back to TRANSIENT; the next sweep (<= 15 min) deletes those older than 6 h.
--     The kept charts are LOST; the events and their quantities are not touched.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-21-response-charts.rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '10s';
UPDATE analytics.retention_policy SET days = 14, max_bytes = NULL WHERE record_class = 'RESPONSE';
UPDATE analytics.evidence_manifest SET retention_class = 'TRANSIENT' WHERE retention_class = 'RESPONSE';
SELECT 'cpm-21 rollback OK | RESPONSE=' || coalesce(days::text, '-') || 'd | RESPONSE charts left: '
       || (SELECT count(*) FROM analytics.evidence_manifest WHERE retention_class = 'RESPONSE')
FROM analytics.retention_policy WHERE record_class = 'RESPONSE';
