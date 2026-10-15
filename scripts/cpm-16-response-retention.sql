-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-16-response-retention.sql — CHG-091 (online): the RESPONSE_CENSORED retention row (3 days).
-- The rules themselves ship in the new cplm-api (EvidenceRetentionSweeper / ResponseRetention):
--   * unreviewed system models older than the RESPONSE days (14) are deleted - except ACTIVE_BASELINE, a reviewed
--     model, the newest model and the newest VALIDATED model of each loop and path, and any model a superseded_by
--     names - which unpins their events for the normal 14-day purge;
--   * CENSORED response events keep RESPONSE_CENSORED days (3) instead of 14.
--
-- RUN ONLINE (no stop), after deploy.sh (the cplm-api swap); the sweeper reads the row on its next pass (<= 15 min):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < scripts/cpm-16-response-retention.sql
-- Idempotent: the row is an upsert (re-running resets days to 3). No row = CENSORED events follow RESPONSE (14 d), as before.
-- Rollback: DELETE FROM analytics.retention_policy WHERE record_class = 'RESPONSE_CENSORED';
--   (deleted models and events do not come back; the model rule has no switch other than the RESPONSE row itself.)
--
-- The first sweep after the deploy deletes the backlog (Marun 2026-10-15: 4,744 unreviewed models older than 14 d,
-- ~35,000 CENSORED events older than 3 d, plus the ~4,700 events those models pinned; ~1,000 more models a day age out after). Postgres reuses the space
-- inside the tables; the files do not shrink (nothing to do: the tables stop growing instead).
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_cplm
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE_CENSORED', 3)
    ON CONFLICT (record_class) DO UPDATE SET days = EXCLUDED.days;
