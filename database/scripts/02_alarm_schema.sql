-- ============================================================
-- AMS - Simplified Alarm Schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS configuration;
CREATE SCHEMA IF NOT EXISTS alarms;

-- --------------------------------------------------------
-- OPC Source Servers (Kept for API Compatibility)
-- --------------------------------------------------------
CREATE TABLE configuration.opc_servers (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    VARCHAR(255) NOT NULL UNIQUE,
    description             TEXT,
    source_type             VARCHAR(64) NOT NULL DEFAULT 'OPC_AE',
    host                    VARCHAR(255) NOT NULL,
    port                    INTEGER NOT NULL DEFAULT 4840,
    prog_id                 VARCHAR(512),
    endpoint_url            TEXT,
    username                VARCHAR(255),
    password_encrypted      BYTEA,
    subscription_string     TEXT,
    poll_interval_ms        INTEGER NOT NULL DEFAULT 1000,
    reconnect_interval_ms   INTEGER NOT NULL DEFAULT 5000,
    is_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    is_connected            BOOLEAN NOT NULL DEFAULT FALSE,
    last_connected_at       TIMESTAMPTZ,
    last_heartbeat_at       TIMESTAMPTZ,
    connection_error        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------
-- Current Alarms (Real-Time State)
-- --------------------------------------------------------
CREATE TABLE alarms.alarm_current (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alarm_id                VARCHAR(255) NOT NULL UNIQUE,   -- unique identifier from source
    source                  VARCHAR(1024) NOT NULL,
    severity                INTEGER NOT NULL,
    message                 TEXT,
    condition               VARCHAR(512),
    sub_condition           VARCHAR(512),
    event_time              TIMESTAMPTZ(3) NOT NULL,
    state                   VARCHAR(64) NOT NULL,           -- ACTIVE, ACKNOWLEDGED, CLEARED
    ack_status              BOOLEAN NOT NULL DEFAULT FALSE,
    opc_attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_updated            TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alarm_current_state ON alarms.alarm_current(state);

-- --------------------------------------------------------
-- Historical Alarms (Full Lifecycle)
-- --------------------------------------------------------
CREATE TABLE alarms.alarm_history (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alarm_id                VARCHAR(255) NOT NULL,
    source                  VARCHAR(1024) NOT NULL,
    severity                INTEGER NOT NULL,
    message                 TEXT,
    condition               VARCHAR(512),
    sub_condition           VARCHAR(512),
    event_time              TIMESTAMPTZ(3) NOT NULL,
    state                   VARCHAR(64) NOT NULL,
    ack_status              BOOLEAN NOT NULL DEFAULT FALSE,
    cleared_time            TIMESTAMPTZ(3),
    last_updated            TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alarm_history_alarm_id ON alarms.alarm_history(alarm_id);
CREATE INDEX idx_alarm_history_event_time ON alarms.alarm_history(event_time DESC);
