-- ═══════════════════════════════════════════════════════════════════════════
-- 54_cpm_instrument_bindings.sql — v2.5 (spec v6 §4.2, §4.5; Tasks 1H.3-1H.5):
-- effective-dated primary device bindings and the Instrumental NE107 health mirror.
--
--   cpm.signal_device_binding_history  which Instrumental device was the PRIMARY source of a
--                                      loop signal over [valid_from, valid_to). A replacement
--                                      splits the binding; overlap is refused by the database.
--   cpm.instrument_health_observation  the durable ledger of every accepted observation
--                                      (snapshot / event / availability), verbatim + gateway facts.
--   cpm.device_health_interval         status intervals per device (from CplmInstrumentContextJob):
--                                      begin at supported observed time, end on newer state /
--                                      freshness expiry / source offline; late records add revisions.
--   cpm.source_availability            the source's ONLINE/OFFLINE history.
--
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant installs),
-- scripts/cpm-07-v25-schema.sql (plant live upgrade, additive, before the swap).
-- Idempotent: IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_cplm

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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA cpm TO ams_user;
    END IF;
END $$;
