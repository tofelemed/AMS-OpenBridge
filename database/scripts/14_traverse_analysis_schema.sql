-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 4: Traverse Analysis Database Schema
-- Creates the traverse_analysis database for the Analysis Service.
-- Analysis execution is delegated to Flink; this stores definitions only.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'CREATE DATABASE traverse_analysis OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_analysis')\gexec

\c traverse_analysis

CREATE SCHEMA IF NOT EXISTS analysis;

-- ───────────────────────────────────────────────────────────────────────────
-- Analysis Definitions Table
-- Design-time definitions; execution delegated to Flink.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis.analysis_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    type            INTEGER NOT NULL CHECK (type BETWEEN 1 AND 4),
    description     TEXT,
    target_path     TEXT NOT NULL,
    configuration   JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_path     TEXT NOT NULL,
    schedule        TEXT NOT NULL DEFAULT 'continuous',
    is_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id        TEXT NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE analysis.analysis_definitions IS 'Analysis definitions (design-time)';
COMMENT ON COLUMN analysis.analysis_definitions.type IS '1=Rollup, 2=Threshold, 3=RateOfChange, 4=Expression';
COMMENT ON COLUMN analysis.analysis_definitions.target_path IS 'UNS contextual path for input data';
COMMENT ON COLUMN analysis.analysis_definitions.output_path IS 'IoTDB path for results';
COMMENT ON COLUMN analysis.analysis_definitions.schedule IS 'continuous, hourly, daily, or cron expression';

CREATE INDEX IF NOT EXISTS idx_analysis_name ON analysis.analysis_definitions(name);
CREATE INDEX IF NOT EXISTS idx_analysis_type ON analysis.analysis_definitions(type);
CREATE INDEX IF NOT EXISTS idx_analysis_target ON analysis.analysis_definitions(target_path);
CREATE INDEX IF NOT EXISTS idx_analysis_enabled ON analysis.analysis_definitions(is_enabled) WHERE is_enabled = TRUE;

-- ───────────────────────────────────────────────────────────────────────────
-- Analysis Executions Table
-- Records execution history and status.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis.analysis_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id     UUID NOT NULL REFERENCES analysis.analysis_definitions(id) ON DELETE CASCADE,
    flink_job_id    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    input_records   BIGINT,
    output_records  BIGINT,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

COMMENT ON TABLE analysis.analysis_executions IS 'Analysis execution history';
COMMENT ON COLUMN analysis.analysis_executions.status IS 'pending, running, completed, failed';

CREATE INDEX IF NOT EXISTS idx_exec_analysis ON analysis.analysis_executions(analysis_id);
CREATE INDEX IF NOT EXISTS idx_exec_status ON analysis.analysis_executions(status);
CREATE INDEX IF NOT EXISTS idx_exec_started ON analysis.analysis_executions(started_at);

-- ───────────────────────────────────────────────────────────────────────────
-- Auto-update timestamp trigger
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analysis.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_analysis_updated_at ON analysis.analysis_definitions;
CREATE TRIGGER trg_analysis_updated_at
    BEFORE UPDATE ON analysis.analysis_definitions
    FOR EACH ROW
    EXECUTE FUNCTION analysis.update_timestamp();

-- ───────────────────────────────────────────────────────────────────────────
-- Seed Data: Sample Analysis Definitions
-- ───────────────────────────────────────────────────────────────────────────

-- Hourly rollup for pump metrics
INSERT INTO analysis.analysis_definitions (
    name, type, description, target_path, configuration, output_path, schedule, is_enabled, owner_id
) VALUES (
    'Pump 101 Hourly Rollup',
    1, -- Rollup
    'Hourly min/max/avg aggregation for pump 101 metrics',
    'houston/crude1/pump101',
    '{
        "sourceMeasurements": ["discharge_press", "motor_temp", "flow_rate"],
        "aggregations": ["min", "max", "avg"],
        "windowSize": "1h"
    }'::jsonb,
    'root.analysis.houston.crude1.pump101.hourly',
    'hourly',
    FALSE,
    'system'
) ON CONFLICT DO NOTHING;

-- Threshold monitor for high pressure
INSERT INTO analysis.analysis_definitions (
    name, type, description, target_path, configuration, output_path, schedule, is_enabled, owner_id
) VALUES (
    'Pump 101 High Pressure Alert',
    2, -- Threshold
    'Monitor discharge pressure for high-high condition',
    'houston/crude1/pump101',
    '{
        "sourceMeasurement": "discharge_press",
        "hiHiLimit": 450,
        "hiLimit": 400,
        "deadband": 5,
        "minDuration": "30s"
    }'::jsonb,
    'root.analysis.houston.crude1.pump101.pressure_alert',
    'continuous',
    FALSE,
    'system'
) ON CONFLICT DO NOTHING;

-- Rate of change for flow
INSERT INTO analysis.analysis_definitions (
    name, type, description, target_path, configuration, output_path, schedule, is_enabled, owner_id
) VALUES (
    'Pump 101 Flow Rate Change',
    3, -- RateOfChange
    'Calculate flow rate change per hour',
    'houston/crude1/pump101',
    '{
        "sourceMeasurement": "flow_rate",
        "interval": "1h",
        "outputUnit": "/hr",
        "maxRate": 50
    }'::jsonb,
    'root.analysis.houston.crude1.pump101.flow_roc',
    'continuous',
    FALSE,
    'system'
) ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL ON SCHEMA analysis TO ams_user;
GRANT ALL ON ALL TABLES IN SCHEMA analysis TO ams_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analysis TO ams_user;

DO $$ BEGIN RAISE NOTICE 'traverse_analysis schema created with sample definitions'; END $$;
