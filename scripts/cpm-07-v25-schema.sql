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
CREATE INDEX IF NOT EXISTS ix_cplm_gate_results_analysis_run
    ON analytics.cplm_gate_results (analysis_run_id) WHERE analysis_run_id IS NOT NULL;

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

-- ── 54_cpm_instrument_bindings (v2.5 1H.3-1H.5): device bindings + Instrumental health mirror ──
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cpm.signal_device_binding_history (
    binding_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        text NOT NULL DEFAULT 'default',
    site             text NOT NULL DEFAULT '',
    loop_id          VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    signal_role      text NOT NULL CHECK (signal_role IN ('PV','SP','OP','VP','MODE')),
    device_id        text NOT NULL,
    installation_id  text,
    source_id        text NOT NULL,
    valid_from       timestamptz NOT NULL,
    valid_to         timestamptz,                       -- half-open [valid_from, valid_to); NULL = open
    approved_by      text NOT NULL,
    approved_at      timestamptz NOT NULL DEFAULT now(),
    note             text,
    CONSTRAINT ck_binding_range CHECK (valid_to IS NULL OR valid_to > valid_from)
);
-- One primary binding per signal and time (spec §4.2): accidental overlapping primaries are refused
-- by the database itself; legitimate redundancy is modelled explicitly, never by overlap.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_binding_no_overlap') THEN
        ALTER TABLE cpm.signal_device_binding_history ADD CONSTRAINT ex_binding_no_overlap
            EXCLUDE USING gist (loop_id WITH =, signal_role WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_binding_loop_role_from ON cpm.signal_device_binding_history (loop_id, signal_role, valid_from DESC);
CREATE INDEX IF NOT EXISTS ix_binding_device ON cpm.signal_device_binding_history (device_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS cpm.instrument_health_observation (
    observation_id         text NOT NULL,
    tenant_id              text NOT NULL,
    site                   text NOT NULL,
    source_id              text NOT NULL,
    device_id              text NOT NULL DEFAULT '',
    message_kind           text NOT NULL,
    producer_id            text NOT NULL DEFAULT '',
    producer_epoch         bigint NOT NULL DEFAULT 0,
    sequence               bigint NOT NULL DEFAULT 0,
    state_revision         bigint NOT NULL DEFAULT 0,
    state_complete         boolean NOT NULL DEFAULT false,
    observed_at            timestamptz,
    verified_at            timestamptz,
    published_at           timestamptz,
    received_at            timestamptz NOT NULL,
    mqtt_retained          boolean NOT NULL DEFAULT false,
    authenticated_producer text,
    gateway_flags          text[] NOT NULL DEFAULT '{}',
    active_flags           text[] NOT NULL DEFAULT '{}',
    collection_state       text NOT NULL DEFAULT 'UNKNOWN',
    measurement_impact     text NOT NULL DEFAULT 'UNKNOWN',
    payload                jsonb NOT NULL,
    interpretation_version int NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, site, source_id, observation_id)
);
CREATE INDEX IF NOT EXISTS ix_iho_device_observed ON cpm.instrument_health_observation (tenant_id, site, device_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS cpm.device_health_interval (
    interval_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              text NOT NULL,
    site                   text NOT NULL,
    device_id              text NOT NULL,
    from_at                timestamptz NOT NULL,
    to_at                  timestamptz,
    boundary_kind          text NOT NULL,              -- NEWER_STATE | FRESHNESS_EXPIRED | SOURCE_OFFLINE | OPEN
    active_flags           text[] NOT NULL DEFAULT '{}',
    collection_state       text NOT NULL,
    measurement_impact     text NOT NULL,
    health_state_id        text NOT NULL,
    affected_variable_ids  text[] NOT NULL DEFAULT '{}',
    from_observation_id    text NOT NULL,
    revision               int NOT NULL DEFAULT 1,
    recorded_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, site, device_id, from_at, revision)
);
CREATE INDEX IF NOT EXISTS ix_dhi_device_time ON cpm.device_health_interval (tenant_id, site, device_id, from_at DESC);

CREATE TABLE IF NOT EXISTS cpm.loop_health_context (
    loop_id                 VARCHAR(64) NOT NULL,
    signal_role             text NOT NULL,
    device_id               text NOT NULL DEFAULT '',
    binding_id              text NOT NULL DEFAULT '',
    from_at                 timestamptz NOT NULL,
    to_at                   timestamptz,
    eligibility             text NOT NULL,               -- ELIGIBLE | LIMITED | INELIGIBLE | UNKNOWN | NOT_CONFIGURED
    descriptive_eligibility text NOT NULL,
    reason                  text NOT NULL DEFAULT '',
    health_state_id         text NOT NULL DEFAULT '',
    active_flags            text[] NOT NULL DEFAULT '{}',
    collection_state        text NOT NULL DEFAULT 'UNKNOWN',
    measurement_impact      text NOT NULL DEFAULT 'UNKNOWN',
    interval_revision       int NOT NULL DEFAULT 0,
    emitted_at              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (loop_id, signal_role, from_at, interval_revision)
);
CREATE INDEX IF NOT EXISTS ix_lhc_loop_from ON cpm.loop_health_context (lower(loop_id), from_at DESC);

CREATE TABLE IF NOT EXISTS cpm.source_availability (
    tenant_id    text NOT NULL,
    site         text NOT NULL,
    source_id    text NOT NULL,
    state        text NOT NULL,
    since_at     timestamptz NOT NULL,
    received_at  timestamptz NOT NULL,
    last_will    boolean NOT NULL DEFAULT false,
    PRIMARY KEY (tenant_id, site, source_id, since_at)
);


-- ---- v2.5 Task 2B.2: G12 system-response tables (mirror of database/scripts/55_cplm_response.sql) ----


CREATE TABLE IF NOT EXISTS analytics.response_event (
    event_id          uuid PRIMARY KEY,
    loop_id           VARCHAR(256) NOT NULL,
    method_run_id     uuid NOT NULL,
    event_type        VARCHAR(48)  NOT NULL,
    path_id           VARCHAR(32)  NOT NULL,
    t0_ms             BIGINT       NOT NULL,
    t_end_ms          BIGINT,
    capture_state     VARCHAR(24)  NOT NULL,                 -- COMPLETE | CENSORED | REJECTED
    censor_reason     VARCHAR(64)  NOT NULL DEFAULT '',
    evaluation_state  VARCHAR(24)  NOT NULL,                 -- WAITING | EVALUATED | CENSORED | REJECTED
    eligibility       VARCHAR(24)  NOT NULL,
    finding           VARCHAR(64)  NOT NULL DEFAULT 'NONE',
    model_state       VARCHAR(24)  NOT NULL DEFAULT 'NONE',
    purpose           VARCHAR(32)  NOT NULL DEFAULT 'LIVE',
    analysis_run_id   uuid,
    bundle_hash       VARCHAR(80)  NOT NULL DEFAULT 'legacy',
    context_revision  INT          NOT NULL DEFAULT 0,
    result_revision   INT          NOT NULL DEFAULT 1,
    dataset_hash      VARCHAR(80),
    source_commit     VARCHAR(64),
    jar_sha256        VARCHAR(64),
    result            JSONB        NOT NULL,                 -- the full G12Result record
    emitted_at_ms     BIGINT,
    created_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_response_event_loop_t0 ON analytics.response_event (lower(loop_id), t0_ms DESC);
CREATE INDEX IF NOT EXISTS ix_response_event_method_run ON analytics.response_event (method_run_id);
CREATE INDEX IF NOT EXISTS ix_response_event_purpose ON analytics.response_event (purpose, loop_id);

-- One row per (method run, quantity): the 52 catalogue quantities, null WITH reason.
CREATE TABLE IF NOT EXISTS analytics.response_metric (
    method_run_id     uuid         NOT NULL,
    quantity_id       VARCHAR(48)  NOT NULL,
    value             DOUBLE PRECISION,
    unit              VARCHAR(32)  NOT NULL,
    path_id           VARCHAR(32)  NOT NULL DEFAULT '',
    uncertainty       DOUBLE PRECISION,
    method            VARCHAR(64)  NOT NULL DEFAULT '',
    support_from_ms   BIGINT,
    support_to_ms     BIGINT,
    config_hash       VARCHAR(80)  NOT NULL DEFAULT 'legacy',
    reason            VARCHAR(80)  NOT NULL DEFAULT '',
    PRIMARY KEY (method_run_id, quantity_id)
);

-- A candidate / validated path model with its governance state. Never "latest": read as-of.
CREATE TABLE IF NOT EXISTS analytics.system_model (
    model_id               uuid PRIMARY KEY,
    loop_id                VARCHAR(256) NOT NULL,
    path_id                VARCHAR(32)  NOT NULL,
    family                 VARCHAR(32)  NOT NULL,
    parameters             JSONB        NOT NULL,            -- catalogue quantities of the model
    estimator              VARCHAR(64)  NOT NULL DEFAULT '',
    uncertainty_method     VARCHAR(32)  NOT NULL DEFAULT 'COVARIANCE',
    training_support       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    validation_support     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    model_state            VARCHAR(24)  NOT NULL CHECK (model_state IN ('CANDIDATE','VALIDATED','ACTIVE_BASELINE','REJECTED','EXPIRED','SUPERSEDED')),
    approved_domain        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    controller_snapshot_id uuid,
    context_revision       INT          NOT NULL DEFAULT 0,
    created_from_event     uuid,
    method_run_id          uuid,
    bundle_hash            VARCHAR(80)  NOT NULL DEFAULT 'legacy',
    revision               INT          NOT NULL DEFAULT 1,  -- bumps on every review (If-Match)
    reviewed_by            VARCHAR(128),
    reviewed_at            timestamptz,
    review_note            TEXT,
    created_at             timestamptz  NOT NULL DEFAULT now(),
    superseded_by          uuid
);
CREATE INDEX IF NOT EXISTS ix_system_model_loop ON analytics.system_model (lower(loop_id), created_at DESC);

CREATE TABLE IF NOT EXISTS analytics.model_validation (
    validation_id     uuid PRIMARY KEY,
    model_id          uuid NOT NULL REFERENCES analytics.system_model(model_id) ON DELETE CASCADE,
    holdout_support   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    free_run_rmse     DOUBLE PRECISION,
    prediction_rmse   DOUBLE PRECISION,
    fit_improvement   DOUBLE PRECISION,
    residual_bias     DOUBLE PRECISION,
    whiteness         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    verdict           VARCHAR(24)  NOT NULL,
    details           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz  NOT NULL DEFAULT now()
);

-- Configured controller settings as READ metadata (spec §2.9): imported, never estimated.
CREATE TABLE IF NOT EXISTS cpm.controller_snapshot (
    snapshot_id       uuid PRIMARY KEY,
    loop_id           VARCHAR(256) NOT NULL,
    valid_from        timestamptz  NOT NULL,
    valid_to          timestamptz,
    vendor            VARCHAR(64)  NOT NULL DEFAULT '',
    algorithm_family  VARCHAR(32)  NOT NULL DEFAULT 'PID',
    form              VARCHAR(16)  NOT NULL CHECK (form IN ('PARALLEL','IDEAL','SERIES','UNKNOWN')),
    native            JSONB        NOT NULL,
    normalized        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    adapter_version   VARCHAR(32)  NOT NULL DEFAULT 'NONE',
    source            VARCHAR(64)  NOT NULL DEFAULT 'MANUAL_IMPORT',
    imported_by       VARCHAR(128) NOT NULL,
    imported_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_controller_snapshot_loop ON cpm.controller_snapshot (lower(loop_id), valid_from DESC);

-- Approved control objective per loop, effective-dated.
CREATE TABLE IF NOT EXISTS cpm.loop_objective_version (
    objective_id      uuid PRIMARY KEY,
    loop_id           VARCHAR(256) NOT NULL,
    objective_type    VARCHAR(24)  NOT NULL,
    band              JSONB        NOT NULL DEFAULT '{}'::jsonb,
    approved_by       VARCHAR(128) NOT NULL,
    approved_at       timestamptz  NOT NULL DEFAULT now(),
    valid_from        timestamptz  NOT NULL,
    valid_to          timestamptz
);
CREATE INDEX IF NOT EXISTS ix_loop_objective_loop ON cpm.loop_objective_version (lower(loop_id), valid_from DESC);

-- ---- v2.5 Task 2D.2: investigation references (mirror of database/scripts/56_cplm_investigation_refs.sql; additive) ----
CREATE TABLE IF NOT EXISTS analytics.investigation_reference (
    ref_id         uuid PRIMARY KEY,
    loop_id        VARCHAR(256) NOT NULL,
    method_run_id  uuid,
    evidence_ids   uuid[] NOT NULL DEFAULT '{}',
    note           text NOT NULL DEFAULT '',
    outcome        text NOT NULL DEFAULT 'INCONCLUSIVE'
                   CHECK (outcome IN ('WORK_COMPLETED', 'PERFORMANCE_RESTORED', 'INCONCLUSIVE')),
    created_by     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    pinned         boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ix_investigation_reference_loop ON analytics.investigation_reference (lower(loop_id), created_at DESC);
CREATE INDEX IF NOT EXISTS ix_investigation_reference_run ON analytics.investigation_reference (method_run_id);


DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA cpm TO ams_user;
    END IF;
END $$;

-- ---- v2.5 Task 2G.1: loop model dimensions + acquisition contract (mirror of database/scripts/57_cpm_loop_model_dimensions.sql; additive) ----
ALTER TABLE cpm.loop_registry
    ADD COLUMN IF NOT EXISTS service_family VARCHAR(40)
        CHECK (service_family IS NULL OR service_family IN ('FLOW','PRESSURE_LIQUID','PRESSURE_GAS','PRESSURE_VAPOUR','LEVEL','TEMPERATURE','COMPOSITION_ANALYZER','PH_CONDUCTIVITY','SPEED_POSITION_POWER','CASCADE','SPLIT_RANGE_OVERRIDE_RATIO','UNKNOWN_UNSTABLE_INVERSE_MIMO')),
    ADD COLUMN IF NOT EXISTS dynamic_class VARCHAR(24)
        CHECK (dynamic_class IS NULL OR dynamic_class IN ('FAST_SELF_REG','SLOW_SELF_REG','INTEGRATING','INTEGRATING_LAG','UNDERDAMPED','UNKNOWN')),
    ADD COLUMN IF NOT EXISTS objective_type VARCHAR(16) NOT NULL DEFAULT 'UNSET'
        CHECK (objective_type IN ('TIGHT','AVERAGING','RATIO','CONSTRAINT','RAMP','BATCH','QUALITY','SUPERVISORY','UNSET')),
    ADD COLUMN IF NOT EXISTS topology VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (topology IN ('SINGLE','CASCADE_MASTER','CASCADE_SLAVE','SPLIT_RANGE','OVERRIDE','RATIO','FEEDFORWARD','UNKNOWN')),
    ADD COLUMN IF NOT EXISTS command_path VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (command_path IN ('OP_TO_VALVE','OP_TO_VFD','OP_TO_SLAVE_SP','UNKNOWN')),
    -- {mode: PERIODIC|RBE|SAMPLE_HOLD, grid_seconds, source_filter_s, timestamp_quantization_ms, declared_scan_s}
    ADD COLUMN IF NOT EXISTS acquisition JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS classification_source VARCHAR(24) NOT NULL DEFAULT 'PRESET_FROM_LOOP_TYPE'
        CHECK (classification_source IN ('PRESET_FROM_LOOP_TYPE','EXPLICIT'));

COMMENT ON COLUMN cpm.loop_registry.classification_source IS
    'PRESET_FROM_LOOP_TYPE = service_family/dynamic_class/objective_type/topology/command_path derived from loop_type; EXPLICIT = set by a person and never overwritten by a preset.';

-- ---- v2.5 Task 3B.1: governed gate configuration (mirror of database/scripts/58_cpm_config_governance.sql; additive) ----
CREATE TABLE IF NOT EXISTS cpm.gate_config_bundle (
    bundle_id            uuid PRIMARY KEY,
    version              int NOT NULL,
    content_hash         text NOT NULL,                       -- SHA-256 of the RFC 8785 canonical JSON of {scope, layers, resolved}
    tenant_id            text NOT NULL DEFAULT 'default',
    site                 text NOT NULL,
    scope_kind           text NOT NULL CHECK (scope_kind IN ('SITE','PROFILE','LOOP','REGIME')),
    scope_ref            text,
    parent_bundle_id     uuid,
    parent_hash          text,
    catalogue_hash       text NOT NULL,
    execution_plan_hash  text NOT NULL,
    change_class         text NOT NULL CHECK (change_class IN ('POLICY','STATE_BOUNDARY','DEPLOYMENT')),
    state                text NOT NULL CHECK (state IN ('DRAFT','VALIDATED','SHADOW_EVALUATED','APPROVED','SCHEDULED','PREPARED','ACTIVE_VERIFIED','REJECTED','EXPIRED','PARTIALLY_ACKNOWLEDGED','ACTIVATION_FAILED','ROLLED_BACK','SUPERSEDED')),
    layers               jsonb NOT NULL,                      -- [{kind, ref, ordinal, content, content_hash}]
    resolved             jsonb NOT NULL,                      -- {properties, sources, execution_plan}
    validation           jsonb,                               -- the validator's report (errors, warnings, not_read_by_build)
    shadow               jsonb,                               -- the shadow run's before/after diff
    effective_from       timestamptz,
    created_by           text NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    etag                 text NOT NULL,
    note                 text,
    UNIQUE (site, scope_kind, scope_ref, version)
);
CREATE INDEX IF NOT EXISTS ix_gate_config_bundle_scope ON cpm.gate_config_bundle (site, scope_kind, scope_ref, state);
CREATE INDEX IF NOT EXISTS ix_gate_config_bundle_hash ON cpm.gate_config_bundle (content_hash);

CREATE TABLE IF NOT EXISTS cpm.gate_config_layer (
    layer_id      uuid PRIMARY KEY,
    bundle_id     uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id) ON DELETE CASCADE,
    layer_kind    text NOT NULL CHECK (layer_kind IN ('FACTORY','SITE','PROFILE','LOOP','REGIME')),
    layer_ref     text,
    content       jsonb NOT NULL,
    content_hash  text NOT NULL,
    ordinal       int NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_gate_config_layer_bundle ON cpm.gate_config_layer (bundle_id, ordinal);

CREATE TABLE IF NOT EXISTS cpm.config_approval (
    approval_id   uuid PRIMARY KEY,
    bundle_id     uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id) ON DELETE CASCADE,
    content_hash  text NOT NULL,                              -- the approval binds to THIS content; an edit invalidates it
    approver      text NOT NULL,
    role          text NOT NULL,
    decision      text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
    note          text,
    expires_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_config_approval_bundle ON cpm.config_approval (bundle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cpm.config_deployment (
    deployment_id        uuid PRIMARY KEY,
    bundle_id            uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id),
    content_hash         text NOT NULL,
    kind                 text NOT NULL CHECK (kind IN ('ACTIVATE','ROLLBACK')),
    rollback_of          uuid,
    scheduled_for        timestamptz,
    topology_generation  text,
    required_members     jsonb NOT NULL,                      -- [{job_name, parallelism}] the ACK matrix must cover
    state                text NOT NULL CHECK (state IN ('SCHEDULED','PREPARING','PREPARED','APPLYING','APPLIED','PROBING','ACTIVE_VERIFIED','PARTIALLY_ACKNOWLEDGED','ACTIVATION_FAILED','ROLLED_BACK','SUPERSEDED')),
    probe_results        jsonb,
    epoch                int,
    error                text,
    created_by           text NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_config_deployment_bundle ON cpm.config_deployment (bundle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_config_deployment_state ON cpm.config_deployment (state, created_at DESC);

CREATE TABLE IF NOT EXISTS cpm.config_worker_ack (
    deployment_id        uuid NOT NULL REFERENCES cpm.config_deployment(deployment_id) ON DELETE CASCADE,
    job_name             text NOT NULL,
    subtask_index        int NOT NULL,
    phase                text NOT NULL CHECK (phase IN ('PREPARE','APPLY')),
    status               text NOT NULL CHECK (status IN ('ACK','NACK')),
    bundle_hash          text NOT NULL,
    jar_sha256           text NOT NULL,
    source_commit        text,
    topology_generation  text,
    reason               text,
    received_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (deployment_id, job_name, subtask_index, phase)
);

CREATE TABLE IF NOT EXISTS cpm.config_active (
    site          text NOT NULL,
    scope_kind    text NOT NULL,
    scope_ref     text NOT NULL DEFAULT '',
    bundle_id     uuid NOT NULL REFERENCES cpm.gate_config_bundle(bundle_id),
    content_hash  text NOT NULL,
    since         timestamptz NOT NULL,
    deployment_id uuid,
    PRIMARY KEY (site, scope_kind, scope_ref)
);

-- v2.5 Task 3A.2: what each RUNNING job announced it can be configured with (newest per job).
CREATE TABLE IF NOT EXISTS cpm.config_worker_capability (
    job_name              text PRIMARY KEY,
    jar_sha256            text NOT NULL,
    source_commit         text,
    catalogue_hash        text NOT NULL,
    readable_property_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    unsupported           jsonb NOT NULL DEFAULT '{}'::jsonb,
    execution_plan_capacity jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload               jsonb NOT NULL,
    announced_at_ms       bigint NOT NULL,
    received_at           timestamptz NOT NULL DEFAULT now()
);
