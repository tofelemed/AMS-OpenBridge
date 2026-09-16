-- target: traverse_cplm
-- DDL only (cpm + analytics). No Timescale (39_ omitted unless T1-lite).
-- Source: 30_, 32_, 34_, 42_, 44_. CREATE DATABASE is Phase 2.
-- Applied with: psql -d traverse_cplm -v ON_ERROR_STOP=1 -f this file

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS cpm;
CREATE SCHEMA IF NOT EXISTS analytics;

-- ── cpm.loop_registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpm.loop_registry (
    loop_id              VARCHAR(64) PRIMARY KEY,
    asset_id             UUID,
    display_name         VARCHAR(255) NOT NULL,
    site                 VARCHAR(64)  NOT NULL,
    area                 VARCHAR(64),
    unit                 VARCHAR(64),
    loop_type            VARCHAR(32)  NOT NULL
                         CHECK (loop_type IN ('FIC','PIC','PIC_GAS','PIC_VAPOUR','LIC','TIC','UNKNOWN')),
    criticality          VARCHAR(16)  NOT NULL DEFAULT 'medium'
                         CHECK (criticality IN ('low','medium','high','critical')),
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    monitoring           JSONB        NOT NULL DEFAULT '{"enabled": false}'::jsonb,
    tags                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
    engineering          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    threshold_profile_id VARCHAR(64),
    timezone             VARCHAR(64)  DEFAULT 'UTC',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_asset ON cpm.loop_registry (asset_id);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_site  ON cpm.loop_registry (site);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpm_loop_registry_loop_ci ON cpm.loop_registry (lower(loop_id));
CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_enabled
    ON cpm.loop_registry ((COALESCE((monitoring->>'enabled')::boolean, FALSE)));

CREATE TABLE IF NOT EXISTS cpm.loop_tag_map (
    loop_id         VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    signal_role     VARCHAR(16) NOT NULL
                    CHECK (signal_role IN ('PV','SP','OP','VP','MODE','STATUS','QUALITY','UPSTREAM','UTILITY')),
    uns_path        VARCHAR(512) NOT NULL,
    source_system   VARCHAR(32),
    source_tag      VARCHAR(128),
    unit_conversion JSONB,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (loop_id, signal_role, uns_path)
);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_tag_map_loop ON cpm.loop_tag_map (loop_id);

CREATE TABLE IF NOT EXISTS cpm.loop_tag_catalog (
    site             VARCHAR(64)  NOT NULL,
    area             VARCHAR(64)  NOT NULL DEFAULT '',
    unit             VARCHAR(64)  NOT NULL DEFAULT '',
    source_system    VARCHAR(32)  NOT NULL DEFAULT 'uns',
    raw_tag_name     VARCHAR(256) NOT NULL,
    uns_path         VARCHAR(512),
    data_type        VARCHAR(16)  DEFAULT 'float',
    engineering_unit VARCHAR(32),
    discovered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (site, area, unit, source_system, raw_tag_name)
);

CREATE TABLE IF NOT EXISTS cpm.threshold_profile (
    profile_id      VARCHAR(64) NOT NULL,
    loop_type       VARCHAR(32) NOT NULL,
    gate_name       VARCHAR(64) NOT NULL,
    pass_threshold  JSONB,
    warn_threshold  JSONB,
    fail_threshold  JSONB,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to    TIMESTAMPTZ,
    PRIMARY KEY (profile_id, loop_type, gate_name)
);

CREATE TABLE IF NOT EXISTS cpm.loop_group (
    group_id    VARCHAR(64) PRIMARY KEY,
    group_name  VARCHAR(255) NOT NULL,
    site        VARCHAR(64),
    area        VARCHAR(64),
    unit        VARCHAR(64),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cpm.loop_group_member (
    group_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_group(group_id) ON DELETE CASCADE,
    loop_id  VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, loop_id)
);

CREATE TABLE IF NOT EXISTS cpm.loop_link (
    from_loop_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    to_loop_id   VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    rel_type     VARCHAR(24) NOT NULL
                 CHECK (rel_type IN ('PEER','UPSTREAM_OF','DOWNSTREAM_OF','CASCADE_PRIMARY','CASCADE_SECONDARY')),
    origin       VARCHAR(16) NOT NULL DEFAULT 'asset-graph',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (from_loop_id, to_loop_id, rel_type),
    CONSTRAINT chk_loop_link_not_self CHECK (from_loop_id <> to_loop_id)
);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_link_from ON cpm.loop_link (from_loop_id);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_link_to   ON cpm.loop_link (to_loop_id);

CREATE TABLE IF NOT EXISTS cpm.loop_signal_asset (
    loop_id               VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    signal_role           VARCHAR(16) NOT NULL,
    contextual_path       VARCHAR(512) NOT NULL,
    asset_id              UUID NOT NULL,
    created_by_projection BOOLEAN NOT NULL DEFAULT FALSE,
    projected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (loop_id, signal_role)
);
COMMENT ON TABLE cpm.loop_signal_asset IS
    'Which UNS asset each loop-signal role was projected onto, and whether the projection created it (deletable on unmap) or only overrode it (clear-only).';

-- ── analytics.cplm_gate_results ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.cplm_gate_results (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id                     VARCHAR(256) NOT NULL,
    window_kind                 VARCHAR(16)  NOT NULL DEFAULT '24h',
    window_start                TIMESTAMPTZ,
    window_end                  TIMESTAMPTZ,
    sample_count                INT,
    mae                         DOUBLE PRECISION,
    rmse                        DOUBLE PRECISION,
    iae                         DOUBLE PRECISION,
    good_error_pct              DOUBLE PRECISION,
    acf_period_s                DOUBLE PRECISION,
    acf_regularity              DOUBLE PRECISION,
    effort_ratio                DOUBLE PRECISION,
    triangularity               DOUBLE PRECISION,
    horch_oddness               DOUBLE PRECISION,
    phase_area_norm_per_cycle   DOUBLE PRECISION,
    corner_score                DOUBLE PRECISION,
    travel_per_day              DOUBLE PRECISION,
    reversals_per_hour          DOUBLE PRECISION,
    harmonic_amplitude_ratio    DOUBLE PRECISION,
    harmonic_energy_ratio       DOUBLE PRECISION,
    diagnosis                   VARCHAR(128),
    severity                    VARCHAR(32),
    confidence                  DOUBLE PRECISION,
    payload                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    source                      VARCHAR(32) NOT NULL DEFAULT 'flink',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_gate_results_window
    ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source);
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_time
    ON analytics.cplm_gate_results (loop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_kind_end
    ON analytics.cplm_gate_results (loop_id, window_kind, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_lower
    ON analytics.cplm_gate_results (lower(loop_id));
-- CHG-023: fleet "latest verdict per loop" probes (newest real verdict / newest any row).
-- Mirrors src/services/cplm-api/Data/FleetLatestSql.cs; live plants get them from
-- scripts/cpm-04-fleet-latest-indexes.sql (CONCURRENTLY) before the image swap.
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_latest_real
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC)
    WHERE diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA';
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_latest_any
    ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC);
-- CHG-023: /calculations reads the engine versions from the newest row; without this it
-- detoasted every payload in the table (30 s -> HTTP 500 at plant size).
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_created_at
    ON analytics.cplm_gate_results (created_at DESC);

CREATE OR REPLACE VIEW analytics.cplm_gate_latest AS
SELECT DISTINCT ON (loop_id, window_kind) *
FROM analytics.cplm_gate_results
ORDER BY loop_id, window_kind,
         (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC,
         window_end DESC NULLS LAST,
         created_at DESC;

CREATE TABLE IF NOT EXISTS analytics.cplm_short_feature_results (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id             VARCHAR(256) NOT NULL,
    window_kind         VARCHAR(16)  NOT NULL,
    window_start        TIMESTAMPTZ,
    window_end          TIMESTAMPTZ,
    sample_count        INT,
    iae                 DOUBLE PRECISION,
    ise                 DOUBLE PRECISION,
    mae                 DOUBLE PRECISION,
    rmse                DOUBLE PRECISION,
    good_error_pct      DOUBLE PRECISION,
    effort_ratio        DOUBLE PRECISION,
    travel_per_day      DOUBLE PRECISION,
    reversals_per_hour  DOUBLE PRECISION,
    auto_pct            DOUBLE PRECISION,
    completeness        DOUBLE PRECISION,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    source              VARCHAR(32) NOT NULL DEFAULT 'flink',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_short_window
    ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end, source);
CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_time
    ON analytics.cplm_short_feature_results (loop_id, window_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_end
    ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_lower
    ON analytics.cplm_short_feature_results (lower(loop_id));

CREATE OR REPLACE VIEW analytics.cplm_short_feature_latest AS
SELECT DISTINCT ON (loop_id, window_kind) *
FROM analytics.cplm_short_feature_results
ORDER BY loop_id, window_kind,
         (COALESCE(completeness, 0) >= 0.95 AND COALESCE(sample_count, 0) >= 10) DESC,
         created_at DESC;

CREATE TABLE IF NOT EXISTS analytics.cplm_long_feature_results (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id                     VARCHAR(256) NOT NULL,
    window_kind                 VARCHAR(16)  NOT NULL,
    window_start                TIMESTAMPTZ,
    window_end                  TIMESTAMPTZ,
    sample_count                INT,
    acf_period_s                DOUBLE PRECISION,
    acf_regularity              DOUBLE PRECISION,
    effort_ratio                DOUBLE PRECISION,
    triangularity               DOUBLE PRECISION,
    horch_oddness               DOUBLE PRECISION,
    corner_score                DOUBLE PRECISION,
    travel_per_day              DOUBLE PRECISION,
    reversals_per_hour          DOUBLE PRECISION,
    harmonic_amplitude_ratio    DOUBLE PRECISION,
    harmonic_energy_ratio       DOUBLE PRECISION,
    payload                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    source                      VARCHAR(32) NOT NULL DEFAULT 'flink',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_long_window
    ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end, source);
CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_time
    ON analytics.cplm_long_feature_results (loop_id, window_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_end
    ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_lower
    ON analytics.cplm_long_feature_results (lower(loop_id));

CREATE OR REPLACE VIEW analytics.cplm_long_feature_latest AS
SELECT DISTINCT ON (loop_id, window_kind) *
FROM analytics.cplm_long_feature_results
ORDER BY loop_id, window_kind, created_at DESC;

CREATE TABLE IF NOT EXISTS analytics.cplm_event_frames (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id                  VARCHAR(256) NOT NULL,
    window_kind              VARCHAR(16)  NOT NULL,
    family                   VARCHAR(64)  NOT NULL,
    opened_at                TIMESTAMPTZ  NOT NULL,
    closed_at                TIMESTAMPTZ,
    peak_diagnosis           VARCHAR(128) NOT NULL,
    peak_confidence          DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_diagnosis           VARCHAR(128),
    last_confidence          DOUBLE PRECISION,
    severity                 VARCHAR(32),
    window_count             INT NOT NULL DEFAULT 1,
    ack_state                VARCHAR(24) NOT NULL DEFAULT 'UNACKNOWLEDGED'
                             CHECK (ack_state IN ('UNACKNOWLEDGED','ACKNOWLEDGED','SHELVED')),
    acked_by                 VARCHAR(128),
    acked_at                 TIMESTAMPTZ,
    shelve_until             TIMESTAMPTZ,
    note                     TEXT,
    calculation_version      VARCHAR(32),
    dynamics_profile_version VARCHAR(32),
    mirrored_alarm_id        VARCHAR(128),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_event_frames_open
    ON analytics.cplm_event_frames (loop_id, window_kind, family)
    WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_time
    ON analytics.cplm_event_frames (loop_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_open
    ON analytics.cplm_event_frames (closed_at, ack_state) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_lower
    ON analytics.cplm_event_frames (lower(loop_id));
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_lower_opened
    ON analytics.cplm_event_frames (lower(loop_id), opened_at DESC);
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

COMMENT ON TABLE analytics.cplm_event_frames IS
    'Durable CPLM diagnosis episodes. Derived from cplm_gate_results and rebuildable; ack/shelve state is operator input and is not.';

-- ── v2.5 (Task 1D.5) — fast-path condition events (mirror of database/scripts/53, part 1) ──
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


COMMENT ON TABLE analytics.condition_event IS
    'v2.5 fast-path G10 limit-dwell / G11 freeze conditions from CplmConditionStreamJob. Evidence, not verdicts; rebuildable from Kafka within retention.';


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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON SCHEMA cpm TO ams_user;
        GRANT ALL ON SCHEMA analytics TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA cpm TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA cpm TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
