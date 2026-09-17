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

-- Part 2 (Task 1G.1, R19 / R26 / spec §1.6): run identity on the EXISTING v1 result rows.
-- The v1 row IS the method run: it gains an immutable identity instead of a parallel table.
-- method_run_ids = {gate: uuid} (deterministic v5 per gate), bundle_hash = the configuration
-- the result was computed under ('legacy' when written by a pre-v2.5 jar), purpose =
-- LIVE | REPLAY | SHADOW | EVIDENCE_RECONSTRUCTION, analysis_run_id links non-LIVE rows to
-- their run. DEFAULTs are metadata-only in PG >= 11: no table rewrite.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cplm_gate_results','cplm_short_feature_results','cplm_long_feature_results'] LOOP
    EXECUTE format('ALTER TABLE analytics.%I
      ADD COLUMN IF NOT EXISTS method_run_ids   jsonb NOT NULL DEFAULT ''{}''::jsonb,
      ADD COLUMN IF NOT EXISTS bundle_hash      text  NOT NULL DEFAULT ''legacy'',
      ADD COLUMN IF NOT EXISTS context_revision int   NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS result_revision  int   NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS purpose          text  NOT NULL DEFAULT ''LIVE'',
      ADD COLUMN IF NOT EXISTS analysis_run_id  uuid,
      ADD COLUMN IF NOT EXISTS source_commit    text,
      ADD COLUMN IF NOT EXISTS jar_sha256       text,
      ADD COLUMN IF NOT EXISTS dataset_hash     text', t);
  END LOOP; END $$;
CREATE INDEX IF NOT EXISTS ix_cplm_gate_results_method_run_ids
    ON analytics.cplm_gate_results USING gin (method_run_ids);
-- 2026-09-17: the run lookup (MethodRunResolver, behind every evidence read) probes the short and long
-- tables too; without these two the probe seq-scanned 119k short rows per manifest read (Response page 7-15 s).
CREATE INDEX IF NOT EXISTS ix_cplm_short_feature_results_method_run_ids
    ON analytics.cplm_short_feature_results USING gin (method_run_ids);
CREATE INDEX IF NOT EXISTS ix_cplm_long_feature_results_method_run_ids
    ON analytics.cplm_long_feature_results USING gin (method_run_ids);
CREATE INDEX IF NOT EXISTS ix_cplm_gate_results_analysis_run
    ON analytics.cplm_gate_results (analysis_run_id) WHERE analysis_run_id IS NOT NULL;

-- Part 2b: a different configuration is a NEW row, never an overwrite. The unique key gains
-- bundle_hash. The cplm-api consumer's ON CONFLICT target changes with it (same release):
-- in the plant this block runs with cplm-api STOPPED, right before the new image starts
-- (scripts/cpm-07b-v25-result-key.sql); the lab applies it here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_gate_results_window_bundle
    ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source, bundle_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_short_window_bundle
    ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end, source, bundle_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_long_window_bundle
    ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end, source, bundle_hash);
DROP INDEX IF EXISTS analytics.uq_cplm_gate_results_window;
DROP INDEX IF EXISTS analytics.uq_cplm_short_window;
DROP INDEX IF EXISTS analytics.uq_cplm_long_window;
-- The planner's statistics reference the dropped indexes until the next ANALYZE; without this the
-- latest-row probes may pick a wrong index for minutes after the swap.
ANALYZE analytics.cplm_gate_results;
ANALYZE analytics.cplm_short_feature_results;
ANALYZE analytics.cplm_long_feature_results;


-- Part 3 (Task 1G.1): the run registry - the control plane for REPLAY / SHADOW /
-- EVIDENCE_RECONSTRUCTION (LIVE rows have analysis_run_id NULL). Replaces the
-- payload->>'replay_id' convention.
CREATE TABLE IF NOT EXISTS analytics.analysis_run (
    analysis_run_id   uuid PRIMARY KEY,
    tenant_id         text NOT NULL DEFAULT 'default',
    site              text NOT NULL DEFAULT '',
    loop_id           text NOT NULL,
    purpose           text NOT NULL CHECK (purpose IN ('REPLAY','SHADOW','EVIDENCE_RECONSTRUCTION')),
    requested_from_ms bigint,
    requested_to_ms   bigint,
    actual_from_ms    bigint,
    actual_to_ms      bigint,
    dataset_hash      text,
    bundle_hash       text,
    context_revision  int,
    source_commit     text,
    jar_sha256        text,
    state             text NOT NULL DEFAULT 'CREATED',
    flink_job_id      text,
    created_by        text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    finished_at       timestamptz,
    error             text,
    manifest          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_analysis_run_loop_created
    ON analytics.analysis_run (lower(loop_id), created_at DESC);
CREATE INDEX IF NOT EXISTS ix_analysis_run_idempotency
    ON analytics.analysis_run ((manifest->>'idempotency_key')) WHERE manifest ? 'idempotency_key';

-- Part 4 (Task 1G.1): evidence (arrays) - keyed by the per-gate method_run_id;
-- gate_result_id is the cheap join to the v1 row once it exists.
CREATE TABLE IF NOT EXISTS analytics.evidence_manifest (
    evidence_id          uuid PRIMARY KEY,
    method_run_id        uuid NOT NULL,
    gate_result_id       bigint,   -- resolved by the reconciler; no FK (the v1 tables carry no unique id constraint everywhere)
    gate_id              text NOT NULL,
    artifact_kind        text NOT NULL,
    role_or_path         text,
    x_quantity           text, x_unit text, y_quantity text, y_unit text,
    data_type            text NOT NULL DEFAULT 'f64',
    columns              jsonb NOT NULL DEFAULT '["x","y"]'::jsonb,
    encoding             text NOT NULL DEFAULT 'f64le+gzip',
    calculation_samples  int,
    display_points       int,
    chunk_count          int NOT NULL,
    total_bytes          bigint NOT NULL,
    sha256               text NOT NULL,
    chunk_sha256         jsonb NOT NULL DEFAULT '[]'::jsonb,
    readiness            text NOT NULL DEFAULT 'PENDING' CHECK (readiness IN ('PENDING','COMPLETE','FAILED','EXPIRED')),
    readiness_reason     text,
    provenance           jsonb NOT NULL DEFAULT '{}'::jsonb,
    retention_class      text NOT NULL DEFAULT 'STANDARD',
    pinned               boolean NOT NULL DEFAULT false,
    source_commit        text,
    jar_sha256           text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    completed_at         timestamptz
);
CREATE INDEX IF NOT EXISTS ix_evidence_manifest_method_run ON analytics.evidence_manifest (method_run_id);
CREATE INDEX IF NOT EXISTS ix_evidence_manifest_readiness ON analytics.evidence_manifest (readiness, created_at);
CREATE TABLE IF NOT EXISTS analytics.evidence_chunk (
    evidence_id  uuid NOT NULL REFERENCES analytics.evidence_manifest(evidence_id) ON DELETE CASCADE,
    chunk_no     int NOT NULL,
    byte_length  int NOT NULL,
    sha256       text NOT NULL,
    payload      bytea NOT NULL,
    PRIMARY KEY (evidence_id, chunk_no)
);
CREATE TABLE IF NOT EXISTS analytics.retention_policy (
    record_class text PRIMARY KEY,
    days         int
);
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('STANDARD', 90), ('PINNED', NULL)
    ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
