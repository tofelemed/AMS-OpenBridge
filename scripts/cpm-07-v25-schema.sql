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

-- Part 1b (Task 1F.1, R10 / NR-029 / NR-030): availability vs condition on event frames.
-- A window the engine could not judge marks the episode UNOBSERVABLE and leaves the condition
-- OPEN; only an evaluable fault-free result with >= recovery_support_s of qualified support
-- closes it; overlapping windows add only their non-overlapping support (support union).
ALTER TABLE analytics.cplm_event_frames
    ADD COLUMN IF NOT EXISTS availability_state   VARCHAR(16) NOT NULL DEFAULT 'OBSERVED',
    ADD COLUMN IF NOT EXISTS condition_state      VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS result_revision      INT         NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS qualified_support_ms BIGINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS support_until        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS close_reason         VARCHAR(32);
UPDATE analytics.cplm_event_frames SET condition_state = 'CLOSED'
    WHERE closed_at IS NOT NULL AND condition_state = 'OPEN';
COMMENT ON COLUMN analytics.cplm_event_frames.availability_state IS
    'v2.5 R10: OBSERVED | UNOBSERVABLE - whether the newest result could judge the loop; independent of the condition.';
COMMENT ON COLUMN analytics.cplm_event_frames.qualified_support_ms IS
    'v2.5 NR-029: union of the qualified support the episode rests on; overlapping windows counted once.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
