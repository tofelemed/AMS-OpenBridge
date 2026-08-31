-- =============================================================================
-- 49_ingestion_unknown_sources.sql - OT ingestion parking inventory
--
-- Aggregated inventory for OT MQTT messages that could not be resolved
-- (LOOP_NOT_REGISTERED / UNKNOWN_PARAMETER): one COUNTED row per
-- (config, reason, source), never one row per message. Engineers review the
-- list (GET /api/ingestion/unknown-sources); registering the loop makes the
-- source flow on the next registry refresh - no redeploy.
--
-- Mirrored by the ingestion-service startup self-heal DDL (init scripts only
-- run on an EMPTY postgres volume) - keep the two in sync.
-- =============================================================================
\c traverse_ingestion

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

DO $$ BEGIN RAISE NOTICE 'ingestion.unknown_sources ready'; END $$;
