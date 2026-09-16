-- ═══════════════════════════════════════════════════════════════════════════
-- 53_cplm_v25_identity_evidence.sql — v2.5 (spec v6 Slice 1): fast-path conditions,
-- run identity on the v1 result rows, run registry and evidence store.
--
-- Part 1 (Task 1D.5): analytics.condition_event — the G10 limit-dwell and G11 freeze
-- conditions published by CplmConditionStreamJob (traverse.cpa.clpm.condition.v1) and
-- persisted verbatim by cplm-api CplmConditionConsumerService. Keyed on the condition
-- identity; a CLOSED row is never regressed by a redelivered OPEN/UPDATE.
--
-- Parts 2-4 (Task 1G) are appended by later commits: identity columns on
-- cplm_gate_results / short / long, analytics.analysis_run, evidence_manifest/chunk.
--
-- Mirrors: src/services/cplm-api/Services/ConditionEventStore.cs (self-heal DDL),
-- migration/schema/03-traverse_cplm.sql (fresh plant installs),
-- scripts/cpm-07-v25-schema.sql (plant live upgrade, run before the cplm-api swap).
--
-- Idempotent: IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_cplm

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
COMMENT ON TABLE analytics.condition_event IS
    'v2.5 fast-path G10 limit-dwell / G11 freeze conditions from CplmConditionStreamJob. Evidence, not verdicts; rebuildable from Kafka within retention.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
