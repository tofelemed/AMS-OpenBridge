-- =============================================================================
-- 51_ingestion_loop_state.sql - last-known loop signals, surviving a restart
--
-- WHY THIS EXISTS (plant evidence, 2026-09-11)
--   The OT gateway publishes ONLY on change. A setpoint that has not moved for
--   weeks is therefore never republished, and MQTT keeps exactly one retained
--   message per topic - if the broker's retained store is lost (it was, some
--   time before 2026-09-06 20:15 on this plant), that value becomes
--   unobtainable by ANY client until the next time it happens to change.
--
--   The joiner held last-known values in memory only, so every ingestion restart
--   threw away everything learned and fell back to whatever the broker still
--   retained. This table makes that memory durable: once a signal has been
--   received, it is never lost again.
--
--   It does NOT invent data. Only values actually received are stored, with
--   their original source timestamp and quality, so a restored member is
--   indistinguishable from one that arrived a second ago - which is exactly
--   what would have happened had the process never stopped.
--
--   last_emitted_ts_ms travels with it: event_ts_ms must advance strictly
--   (IoTDB keys rows by device+timestamp), so a restart must not re-emit a
--   timestamp it has already published.
--
-- Mirrored by the ingestion-service startup self-heal DDL (init scripts only
-- run on an EMPTY postgres volume) - keep the two in sync.
-- =============================================================================
\c traverse_ingestion

CREATE TABLE IF NOT EXISTS ingestion.loop_state (
    config_id          UUID         NOT NULL,
    loop_id            VARCHAR(256) NOT NULL,
    -- members: {"pv":{"v":42.1,"ts":1789,"good":true}, ...}; extras the same;
    -- mode is a token ("AUT"), not a number, because that is what the tuple carries.
    members            JSONB        NOT NULL DEFAULT '{}'::jsonb,
    extras             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    mode_token         VARCHAR(64),
    mode_ts_ms         BIGINT,
    last_emitted_ts_ms BIGINT       NOT NULL DEFAULT 0,
    source_fcs         VARCHAR(64),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (config_id, loop_id)
);

CREATE INDEX IF NOT EXISTS idx_loop_state_updated
    ON ingestion.loop_state(updated_at DESC);

DO $$ BEGIN RAISE NOTICE 'ingestion.loop_state ready'; END $$;
