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
COMMENT ON TABLE analytics.condition_event IS
    'v2.5 fast-path G10 limit-dwell / G11 freeze conditions from CplmConditionStreamJob. Evidence, not verdicts; rebuildable from Kafka within retention.';

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
