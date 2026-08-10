-- ============================================================
-- AMS - Apply pending EF migrations manually (idempotent)
-- Run this when the DB was bootstrapped via raw SQL scripts
-- instead of `dotnet ef database update`.
-- ============================================================

-- --------------------------------------------------------
-- 1. EF migrations tracking table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."__EFMigrationsHistory" (
    "MigrationId"    character varying(150) NOT NULL,
    "ProductVersion" character varying(32)  NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

-- --------------------------------------------------------
-- 2. Schemas
-- --------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS alarms;
CREATE SCHEMA IF NOT EXISTS configuration;

-- --------------------------------------------------------
-- 3. Custom ENUM types (migration 20260525080915_InitialCreate)
-- --------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE alarms.event_type    AS ENUM ('Simple','Tracking','Condition');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alarms.alarm_priority AS ENUM ('Critical','High','Medium','Low','Diagnostic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alarms.alarm_category AS ENUM ('Process','Equipment','Instrument','Safety','Environmental','System','OperatorAction','Communication');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alarms.alarm_state AS ENUM ('Normal','UnackedActive','AckedActive','UnackedCleared','Shelved','SuppressedByDesign','OutOfService');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Implicit casts (safe to re-run)
DO $$ BEGIN CREATE CAST (character varying AS alarms.event_type)     WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (text            AS alarms.event_type)       WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (character varying AS alarms.alarm_priority) WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (text            AS alarms.alarm_priority)   WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (character varying AS alarms.alarm_category) WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (text            AS alarms.alarm_category)   WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (character varying AS alarms.alarm_state)    WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE CAST (text            AS alarms.alarm_state)      WITH INOUT AS IMPLICIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------
-- 4. alarms.active_alarms (migration 20260525080915_InitialCreate)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS alarms.active_alarms (
    id                   UUID         NOT NULL,
    server_id            UUID         NOT NULL,
    alarm_tag_id         UUID,
    source_name          VARCHAR(1024) NOT NULL,
    source_alarm_id      VARCHAR(1024),
    source_event_id      VARCHAR(1024),
    event_type           alarms.event_type NOT NULL,
    condition_name       VARCHAR(512),
    sub_condition_name   VARCHAR(512),
    message              TEXT,
    severity             INTEGER      NOT NULL,
    priority             alarms.alarm_priority NOT NULL,
    category             alarms.alarm_category NOT NULL,
    quality              INTEGER      NOT NULL DEFAULT 192,
    alarm_state          alarms.alarm_state    NOT NULL,
    condition_active     BOOLEAN      NOT NULL,
    acknowledged         BOOLEAN      NOT NULL DEFAULT FALSE,
    event_time           TIMESTAMPTZ(3) NOT NULL,
    active_time          TIMESTAMPTZ(3) NOT NULL,
    ack_time             TIMESTAMPTZ(3),
    acked_by             UUID,
    ack_comment          TEXT,
    server_received_at   TIMESTAMPTZ(3) NOT NULL,
    is_shelved           BOOLEAN      NOT NULL DEFAULT FALSE,
    shelved_at           TIMESTAMPTZ(3),
    shelved_by           UUID,
    shelve_until         TIMESTAMPTZ(3),
    shelve_comment       TEXT,
    is_suppressed        BOOLEAN      NOT NULL DEFAULT FALSE,
    suppressed_at        TIMESTAMPTZ(3),
    suppressed_by        UUID,
    suppression_reason   TEXT,
    is_out_of_service    BOOLEAN      NOT NULL DEFAULT FALSE,
    correlation_id       UUID,
    root_cause_alarm_id  UUID,
    is_root_cause        BOOLEAN      NOT NULL DEFAULT FALSE,
    process_value        DOUBLE PRECISION,
    process_unit         VARCHAR(64),
    opc_attributes       JSONB        NOT NULL DEFAULT '{}',
    custom_attributes    JSONB        NOT NULL DEFAULT '{}',
    kafka_offset         BIGINT,
    kafka_partition      INTEGER,
    kafka_topic          VARCHAR(255),
    created_at           TIMESTAMPTZ  NOT NULL,
    updated_at           TIMESTAMPTZ  NOT NULL,
    CONSTRAINT pk_active_alarms PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_active_alarms_correlation ON alarms.active_alarms(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_active_alarms_event_time  ON alarms.active_alarms(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_active_alarms_priority    ON alarms.active_alarms(priority);
CREATE INDEX IF NOT EXISTS idx_active_alarms_server      ON alarms.active_alarms(server_id);
CREATE INDEX IF NOT EXISTS idx_active_alarms_state       ON alarms.active_alarms(alarm_state);

-- --------------------------------------------------------
-- 5. alarms.historical_alarms (migration 20260528000000_AddTimescaleDbHypertables)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS alarms.historical_alarms (
    id             UUID         NOT NULL,
    server_id      UUID         NOT NULL,
    source_name    VARCHAR(255) NOT NULL,
    condition_name VARCHAR(255) NOT NULL,
    "timestamp"    TIMESTAMPTZ  NOT NULL,
    alarm_state    VARCHAR(64)  NOT NULL,
    priority       INTEGER      NOT NULL,
    event_type     VARCHAR(64)  NOT NULL,
    message        TEXT,
    operator_id    VARCHAR(255),
    PRIMARY KEY (id, "timestamp")
);

-- --------------------------------------------------------
-- 6. configuration.opc_connections (migration 20260530120000_AddOpcConnections)
--    NB: the init SQL created configuration.opc_servers with a different schema.
--    EF uses opc_connections. Both can coexist.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuration.opc_connections (
    id                          UUID         NOT NULL,
    name                        VARCHAR(255) NOT NULL,
    protocol                    VARCHAR(32)  NOT NULL,
    endpoint                    TEXT         NOT NULL,
    username                    VARCHAR(255),
    password_encrypted          BYTEA,
    enabled                     BOOLEAN      NOT NULL DEFAULT TRUE,
    status                      VARCHAR(32)  NOT NULL DEFAULT 'Disconnected',
    last_connected_utc          TIMESTAMPTZ,
    last_error                  TEXT,
    streampipes_adapter_id      VARCHAR(128),
    streampipes_pipeline_id     VARCHAR(128),
    streampipes_ack_pipeline_id VARCHAR(128),
    created_utc                 TIMESTAMPTZ  NOT NULL,
    updated_utc                 TIMESTAMPTZ  NOT NULL,
    -- columns from 20260530140000_AddOpcConnectionRuntimeFields
    auth_type                   VARCHAR(32)  NOT NULL DEFAULT 'Anonymous',
    pipeline_status             VARCHAR(32)  NOT NULL DEFAULT 'Stopped',
    events_per_sec              DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_event_utc              TIMESTAMPTZ,
    CONSTRAINT pk_opc_connections PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opc_connections_name    ON configuration.opc_connections(name);
CREATE INDEX        IF NOT EXISTS idx_opc_connections_enabled ON configuration.opc_connections(enabled);

-- --------------------------------------------------------
-- 7. alarms.alarm_state_transitions (migration 20260530160000_AddAlarmStateTransitions)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS alarms.alarm_state_transitions (
    id              BIGSERIAL,
    alarm_id        UUID         NOT NULL,
    server_id       UUID         NOT NULL,
    source_name     VARCHAR(1024) NOT NULL,
    from_state      alarms.alarm_state,
    to_state        alarms.alarm_state NOT NULL,
    transition_time TIMESTAMPTZ(3) NOT NULL,
    triggered_by    UUID,
    trigger_reason  VARCHAR(512),
    comment         TEXT,
    kafka_offset    BIGINT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, transition_time)
);

CREATE INDEX IF NOT EXISTS idx_transitions_alarm  ON alarms.alarm_state_transitions(alarm_id,  transition_time DESC);
CREATE INDEX IF NOT EXISTS idx_transitions_server ON alarms.alarm_state_transitions(server_id, transition_time DESC);

-- --------------------------------------------------------
-- 8. Mark all migrations as applied in EF history
--
-- DATA-02 note: pre-marking 20260528000000_AddTimescaleDbHypertables is
-- DELIBERATE and stays. The real hypertables + compression + retention are
-- created by 39_timescale_policies.sql (the authoritative implementation) —
-- letting the EF migration also run create_hypertable at API startup would
-- race the mounted SQL for the same conversion.
-- --------------------------------------------------------
INSERT INTO public."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES
    ('20260525080915_InitialCreate',               '8.0.0'),
    ('20260528000000_AddTimescaleDbHypertables',   '8.0.0'),
    ('20260530120000_AddOpcConnections',           '8.0.0'),
    ('20260530140000_AddOpcConnectionRuntimeFields','8.0.0'),
    ('20260530160000_AddAlarmStateTransitions',    '8.0.0')
ON CONFLICT ("MigrationId") DO NOTHING;
