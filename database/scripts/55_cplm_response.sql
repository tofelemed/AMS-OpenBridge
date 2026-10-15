-- v2.5 Task 2B.2 (spec v6 §2.2, §2.8, §2.10, §6.6): the G12 system-response tables.
-- G12 is EVENT-keyed, not window-keyed, so it cannot share the window result tables.
-- Every row is persisted verbatim from traverse.cpa.clpm.response.results.v1; cplm-api never
-- recomputes a metric. Models have a governed lifecycle (CANDIDATE -> VALIDATED ->
-- ACTIVE_BASELINE -> EXPIRED / SUPERSEDED / REJECTED) driven only by the review endpoint.
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant), scripts/cpm-07-v25-schema.sql (live plant, additive).
\c traverse_cplm

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
CREATE INDEX IF NOT EXISTS ix_response_event_created ON analytics.response_event (created_at);   -- CHG-049: retention purge
-- CHG-049 (final review I3): the RESPONSE retention row (response_event / response_metric, read by the evidence sweeper)
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE', 14) ON CONFLICT (record_class) DO NOTHING;
-- CHG-091: CENSORED response events (rejected captures) keep 3 days, not the 14 of RESPONSE
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE_CENSORED', 3) ON CONFLICT (record_class) DO NOTHING;

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
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA cpm TO ams_user;
    END IF;
END $$;
