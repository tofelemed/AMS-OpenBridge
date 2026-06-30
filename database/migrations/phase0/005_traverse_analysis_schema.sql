-- ============================================================
-- Phase 0: traverse_analysis database schema
-- Run against: traverse_analysis database
-- ============================================================
-- Analysis definition service — CRUD only (execution in Flink)
-- Ported from reference app Module 5
-- ============================================================

\connect traverse_analysis;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- Analysis Definitions (Placeholder for Phase 4)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE analysis_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL,                 -- References traverse_assets.assets
    template_analysis_id UUID,              -- Source template analysis
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Expression (Flink SQL or CEP pattern)
    expression TEXT NOT NULL,
    expression_type VARCHAR(50) DEFAULT 'sql',  -- sql, cep, formula
    
    -- Trigger configuration
    trigger_type VARCHAR(50) NOT NULL,      -- OnChange, Periodic, OnEvent, OnDemand
    trigger_interval_ms INTEGER,
    trigger_attribute_ids UUID[],
    
    -- Output configuration
    output_asset_id UUID,
    output_measurement VARCHAR(255),
    
    -- Flink job reference (when deployed)
    flink_job_id VARCHAR(255),
    flink_job_status VARCHAR(50) DEFAULT 'PENDING',
    
    -- Status
    is_enabled BOOLEAN DEFAULT FALSE,
    last_executed TIMESTAMPTZ,
    last_error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

CREATE INDEX idx_analysis_asset ON analysis_definitions(asset_id);
CREATE INDEX idx_analysis_enabled ON analysis_definitions(is_enabled);

-- ──────────────────────────────────────────────────────────────
-- Analysis Executions (Audit log)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE analysis_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES analysis_definitions(id) ON DELETE CASCADE,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    trigger_source VARCHAR(100),
    input_values JSONB,
    output_value TEXT,
    duration_ms INTEGER,
    status VARCHAR(50),
    error_message TEXT
);

CREATE INDEX idx_executions_analysis ON analysis_executions(analysis_id, executed_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_analysis_updated 
    BEFORE UPDATE ON analysis_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
