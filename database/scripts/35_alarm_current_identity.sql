-- =========================================================================
-- 35 — Alarm projection identity constraint  (GAP DATA-01, Plan 01 item 5)
-- =========================================================================
-- Problem this fixes:
--   alarms.alarm_current carried no server dimension at all and its only
--   uniqueness was UNIQUE(alarm_id). The ingest path matched rows on
--   source name alone (unindexed), so:
--     * two OPC servers exposing the same tag name cross-matched and
--       overwrote each other's rows;
--     * at-least-once Kafka redelivery could create duplicate logical
--       alarms whenever Flink supplied its own AlarmId;
--     * every incoming event sequential-scanned the projection table.
--
--   The intended identity has always been
--       serverId + sourceName + conditionName + subConditionName
--   (documented in NormalizedAlarmIngestor and encoded in the v1 alarm_id
--    key format), but nothing enforced it in the database.
--
-- Idempotent: safe to run on a fresh bootstrap and on an existing database.
-- =========================================================================

-- ── 1. Add the missing server dimension ─────────────────────────────────
ALTER TABLE alarms.alarm_current
    ADD COLUMN IF NOT EXISTS server_id UUID;

-- ── 2. Backfill from the deterministic v1 instance key ──────────────────
-- AlarmPartitionKeys.AlarmInstanceKeyV1 formats alarm_id as
--   v1|{serverId}|{source}|{condition}|{subCondition}
-- so field 2 is the authoritative server id for every row we generated.
UPDATE alarms.alarm_current
   SET server_id = NULLIF(split_part(alarm_id, '|', 2), '')::uuid
 WHERE server_id IS NULL
   AND alarm_id LIKE 'v1|%'
   AND NULLIF(split_part(alarm_id, '|', 2), '') IS NOT NULL;

-- Rows whose alarm_id came from Flink (not the v1 format) carry no server
-- id anywhere. The only ingest path in this deployment is the HTTP feed
-- poller, so those rows belong to the HTTP feed server. This constant
-- matches OpcEventStreamJob.HTTP_FEED_SERVER_ID — keep the two in step.
UPDATE alarms.alarm_current
   SET server_id = 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::uuid
 WHERE server_id IS NULL;

-- ── 3. Enforce it ───────────────────────────────────────────────────────
ALTER TABLE alarms.alarm_current
    ALTER COLUMN server_id SET NOT NULL;

ALTER TABLE alarms.alarm_current
    ALTER COLUMN server_id SET DEFAULT 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::uuid;

-- COALESCE on sub_condition: NULL and '' must collide, otherwise a NULL
-- sub-condition would bypass the constraint entirely (NULLs are distinct
-- in a btree unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_alarm_current_identity
    ON alarms.alarm_current (server_id, source, condition, COALESCE(sub_condition, ''));

-- ── 4. Index the hot ingest predicate ───────────────────────────────────
-- The ingest lookup filters (server_id, source). The unique index above
-- leads with those two columns, so it already serves that probe; this
-- partial-free covering index is kept for the read path that filters by
-- source alone (history search / operator search).
CREATE INDEX IF NOT EXISTS idx_alarm_current_source
    ON alarms.alarm_current (source);

-- ── 5. Ordered active-alarm list (state + newest first) ─────────────────
CREATE INDEX IF NOT EXISTS idx_alarm_current_state_time
    ON alarms.alarm_current (state, event_time DESC);
