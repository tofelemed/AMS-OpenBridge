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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON SCHEMA ingestion TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA ingestion TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA ingestion TO ams_user;
    END IF;
END $$;
