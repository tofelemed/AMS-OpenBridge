-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-07-v25-schema.sql — PLANT live upgrade for release v2.5 (additive schema).
--
-- Run on the Marun VM BEFORE the cplm-api image swap:
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-07-v25-schema.sql
--
-- This is database/scripts/53..58 minus the \c headers (the plant applies per database).
-- Everything is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS; no locks beyond metadata-only
-- ADD COLUMN ... DEFAULT (PostgreSQL >= 11). Re-runnable.
--
-- Part 1 — Task 1D.5: fast-path condition events.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.condition_event (
    loop_id        VARCHAR(256) NOT NULL,
    gate           VARCHAR(8)   NOT NULL,
    kind           VARCHAR(32)  NOT NULL,
    start_ms       BIGINT       NOT NULL,
    last_ms        BIGINT       NOT NULL,
    end_ms         BIGINT,
    state          VARCHAR(16)  NOT NULL,
    close_reason   VARCHAR(32)  NOT NULL DEFAULT '',
    duration_s     DOUBLE PRECISION NOT NULL DEFAULT 0,
    evidence       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    emitted_at_ms  BIGINT,
    source_commit  VARCHAR(64),
    jar_sha256     VARCHAR(64),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (loop_id, gate, kind, start_ms)
);
CREATE INDEX IF NOT EXISTS idx_condition_event_loop_lower_start
    ON analytics.condition_event (lower(loop_id), start_ms DESC);
CREATE INDEX IF NOT EXISTS idx_condition_event_open
    ON analytics.condition_event (state) WHERE state <> 'CLOSED';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
