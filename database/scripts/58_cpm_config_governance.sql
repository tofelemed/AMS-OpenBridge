-- v2.5 Task 3B.1 (spec v6 §5.3-5.6, R16 / R17): governed gate configuration - immutable bundles with
-- their layers, approvals bound to the content hash, deployments with the required worker membership
-- and every worker's PREPARE / APPLY ACK, the active bundle per scope, and the capability each running
-- job announced. Nothing here is a runtime value the engine reads directly: Flink consumes only a
-- COMPLETE bundle from the compacted topic and pins its hash on every result.
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant), scripts/cpm-07-v25-schema.sql (live plant, additive).
\c traverse_cplm

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
