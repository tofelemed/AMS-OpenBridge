-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-12-evidence-response-retention.sql — CHG-049 (online): the response_event created_at index and the
-- RESPONSE retention row (14 days). The retention sweeper that reads the row ships in the new cplm-api.
--
-- RUN ONLINE (no stop), after deploy.sh (the cplm-api swap); the sweeper reads the row on its next pass:
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-12-evidence-response-retention.sql
-- THEN check the index is valid - an interrupted CONCURRENTLY build leaves an INVALID index behind. Must print t:
--   docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select indisvalid from pg_index where indexrelid = 'analytics.ix_response_event_created'::regclass"
-- If it prints f: DROP INDEX analytics.ix_response_event_created; and re-run this file.
-- Do NOT wrap in a transaction and do NOT use `psql -1`: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block (it does not lock writers; the index builds in the background of normal traffic).
--
-- Idempotent: the index is IF NOT EXISTS, the policy row is an upsert (re-running resets days to 14).
-- The postgres-owned index is normalized to ams_user by 02-apply-schemas.sh (run it after this file).
-- The space itself is returned later by cpm-12b (cplm-api STOPPED).
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_cplm
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_response_event_created ON analytics.response_event (created_at);
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE', 14)
    ON CONFLICT (record_class) DO UPDATE SET days = EXCLUDED.days;
