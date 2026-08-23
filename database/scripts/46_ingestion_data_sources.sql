-- ═══════════════════════════════════════════════════════════════════════════
-- 46_ingestion_data_sources.sql — OT data-source configuration store
--
-- One row per configured broker connection (MQTT only for now). Ported from
-- the Instrumental Pro handoff spec §2
-- (docs/ot-data-integration/mqtt _feature_configuration _specification.md)
-- with platform adaptations: TIMESTAMPTZ, schema-qualified table.
--
-- password_encrypted is AES-256-GCM (base64(salt‖nonce‖tag‖ct)), master key =
-- ingestion-service's ENCRYPTION_KEY env. Never stored or logged in plaintext.
--
-- NOTE (init-path caveat): this script only runs on an EMPTY postgres volume.
-- ingestion-service self-heals the identical DDL at startup for existing
-- volumes — keep the two in sync (Program.cs SelfHealDdl).
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_ingestion

CREATE SCHEMA IF NOT EXISTS ingestion;
GRANT ALL ON SCHEMA ingestion TO ams_user;

CREATE TABLE IF NOT EXISTS ingestion.data_source_configs (
    config_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- identity
    source_type            VARCHAR(50)  NOT NULL DEFAULT 'MQTT' CHECK (source_type IN ('MQTT')),
    profile_type           VARCHAR(50),
    name                   VARCHAR(255) NOT NULL,
    description            TEXT,

    -- connection
    connection_url         TEXT         NOT NULL,
    username               VARCHAR(255) NOT NULL,
    password_encrypted     TEXT         NOT NULL,
    timeout_seconds        INTEGER      DEFAULT 30 CHECK (timeout_seconds > 0),
    insecure_skip_verify   BOOLEAN      DEFAULT FALSE,

    -- everything MQTT-shaped (topics, qos, client_id, session, keepalive, tls)
    -- rides in JSON under the "mqtt" key — spec §3 contract
    profile_config         JSONB        DEFAULT '{}',

    -- status & control
    is_active              BOOLEAN      DEFAULT TRUE,
    last_connection_test   TIMESTAMPTZ,
    last_connection_status VARCHAR(20)  CHECK (last_connection_status IN ('SUCCESS','FAILED','PENDING')),
    last_connection_error  TEXT,
    last_data_received     TIMESTAMPTZ,     -- written by the phase-2 subscriber

    -- audit
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

DO $$ BEGIN RAISE NOTICE 'ingestion.data_source_configs ready'; END $$;
