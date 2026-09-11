-- target: traverse_ingestion
-- Source: 46_ingestion_data_sources.sql. CREATE DATABASE is Phase 2.
-- Applied with: psql -d traverse_ingestion -v ON_ERROR_STOP=1 -f this file

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ingestion;

CREATE TABLE IF NOT EXISTS ingestion.data_source_configs (
    config_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type            VARCHAR(50)  NOT NULL DEFAULT 'MQTT' CHECK (source_type IN ('MQTT')),
    profile_type           VARCHAR(50),
    name                   VARCHAR(255) NOT NULL,
    description            TEXT,
    connection_url         TEXT         NOT NULL,
    username               VARCHAR(255) NOT NULL,
    password_encrypted     TEXT         NOT NULL,
    timeout_seconds        INTEGER      DEFAULT 30 CHECK (timeout_seconds > 0),
    insecure_skip_verify   BOOLEAN      DEFAULT FALSE,
    profile_config         JSONB        DEFAULT '{}',
    is_active              BOOLEAN      DEFAULT TRUE,
    last_connection_test   TIMESTAMPTZ,
    last_connection_status VARCHAR(20)  CHECK (last_connection_status IN ('SUCCESS','FAILED','PENDING')),
    last_connection_error  TEXT,
    last_data_received     TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by             VARCHAR(100) NOT NULL,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by             VARCHAR(100),
    version                INTEGER      NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_dsc_is_active    ON ingestion.data_source_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_dsc_profile_type ON ingestion.data_source_configs(profile_type);

CREATE OR REPLACE FUNCTION ingestion.touch_data_source_configs()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_data_source_configs ON ingestion.data_source_configs;
CREATE TRIGGER trg_touch_data_source_configs
    BEFORE UPDATE ON ingestion.data_source_configs
    FOR EACH ROW EXECUTE FUNCTION ingestion.touch_data_source_configs();

-- OT ingestion parking inventory (mirrors database/scripts/49_ingestion_unknown_sources.sql)
CREATE TABLE IF NOT EXISTS ingestion.unknown_sources (
    config_id     UUID         NOT NULL,
    reason        VARCHAR(40)  NOT NULL,
    source_key    VARCHAR(256) NOT NULL,
    first_seen    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    message_count BIGINT       NOT NULL DEFAULT 1,
    last_topic    TEXT,
    last_payload  JSONB,
    PRIMARY KEY (config_id, reason, source_key)
);

CREATE INDEX IF NOT EXISTS idx_unknown_sources_last_seen
    ON ingestion.unknown_sources(last_seen DESC);

-- Last-known loop signals, surviving a restart (CHG-016; mirrors
-- database/scripts/51_ingestion_loop_state.sql and the service's self-heal DDL).
-- The OT gateway publishes only on change and MQTT keeps one retained message per
-- topic, so a value not republished and not retained is unobtainable until it next
-- moves - weeks, for a stable setpoint. Holding last-known values in memory alone
-- meant every restart re-opened that hole.
CREATE TABLE IF NOT EXISTS ingestion.loop_state (
    config_id          UUID         NOT NULL,
    loop_id            VARCHAR(256) NOT NULL,
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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON SCHEMA ingestion TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA ingestion TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA ingestion TO ams_user;
    END IF;
END $$;
