-- ============================================================
-- Phase 0: traverse_assets database schema
-- Run against: traverse_assets database
-- ============================================================
-- Asset Model service — UNS source of truth
-- Generates IoTDB path, Sparkplug topic, alarm source from one identity
-- ============================================================

\connect traverse_assets;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ──────────────────────────────────────────────────────────────
-- Core Asset Table (UNS Source of Truth)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Contextual identity (user-facing, human-readable)
    contextual_path TEXT NOT NULL UNIQUE,
    
    -- ISA-95 hierarchy levels
    site VARCHAR(64) NOT NULL,
    area VARCHAR(64),                      -- Optional (insert only where needed)
    unit VARCHAR(64) NOT NULL,
    device VARCHAR(64) NOT NULL,
    measurement VARCHAR(64),               -- NULL for device-level assets
    
    -- Asset metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    asset_type VARCHAR(64) NOT NULL DEFAULT 'measurement',
    data_type VARCHAR(32) DEFAULT 'Double',
    engineering_unit VARCHAR(32),
    
    -- Template reference (for Phase 3)
    template_id UUID,
    template_name VARCHAR(255),
    
    -- State machine (for digital twin support)
    current_state VARCHAR(64),
    state_machine_id UUID,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- Generated columns for derived representations
ALTER TABLE assets ADD COLUMN iotdb_path TEXT GENERATED ALWAYS AS (
    'root.' || site || 
    COALESCE('.' || area, '') || 
    '.' || unit || '.' || device || 
    COALESCE('.' || measurement, '')
) STORED;

ALTER TABLE assets ADD COLUMN sparkplug_group VARCHAR(128) GENERATED ALWAYS AS (
    site || '_' || unit
) STORED;

ALTER TABLE assets ADD COLUMN sparkplug_device VARCHAR(64) GENERATED ALWAYS AS (
    device
) STORED;

ALTER TABLE assets ADD COLUMN sparkplug_metric VARCHAR(128) GENERATED ALWAYS AS (
    device || '/' || COALESCE(measurement, 'state')
) STORED;

ALTER TABLE assets ADD COLUMN alarm_source TEXT GENERATED ALWAYS AS (
    site || '/' || COALESCE(area || '/', '') || unit || '/' || device
) STORED;

-- Indexes
CREATE INDEX idx_assets_site ON assets(site);
CREATE INDEX idx_assets_unit ON assets(site, unit);
CREATE INDEX idx_assets_device ON assets(site, unit, device);
CREATE INDEX idx_assets_iotdb_path ON assets(iotdb_path);
CREATE INDEX idx_assets_sparkplug ON assets(sparkplug_group, sparkplug_device);
CREATE INDEX idx_assets_template ON assets(template_id);
CREATE INDEX idx_assets_name_trgm ON assets USING gin(name gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────
-- Alias Mapping (Legacy Path Migration)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE alias_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_path TEXT NOT NULL UNIQUE,
    contextual_path TEXT NOT NULL REFERENCES assets(contextual_path) ON DELETE CASCADE,
    migration_status VARCHAR(32) DEFAULT 'active',   -- active, deprecated, migrated
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ
);

CREATE INDEX idx_alias_legacy ON alias_mapping(legacy_path);
CREATE INDEX idx_alias_contextual ON alias_mapping(contextual_path);

-- ──────────────────────────────────────────────────────────────
-- Attribute Instances (per-asset attribute values/bindings)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE attribute_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    attribute_template_id UUID,             -- Reference to template (Phase 3)
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50) NOT NULL,
    
    -- Data reference configuration
    data_ref_type VARCHAR(50) NOT NULL DEFAULT 'IoTDB',
    data_ref_config JSONB DEFAULT '{}',     -- {tagPath, kafkaTopic, expression, etc.}
    
    -- Unit of measure
    engineering_unit VARCHAR(32),
    uom_class VARCHAR(64),
    
    -- Metadata
    is_readonly BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(asset_id, name)
);

CREATE INDEX idx_attr_instances_asset ON attribute_instances(asset_id);
CREATE INDEX idx_attr_instances_ref_type ON attribute_instances(data_ref_type);

-- ──────────────────────────────────────────────────────────────
-- State Machine Definitions (for digital twin state)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE state_machine_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    states JSONB NOT NULL,          -- [{"name": "RUNNING", "color": "#22c55e"}, ...]
    transitions JSONB NOT NULL,     -- [{"from": "IDLE", "to": "RUNNING", "trigger": "rpm > 100"}, ...]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- Hierarchy Helper Functions
-- ──────────────────────────────────────────────────────────────

-- Get all assets under a site/unit
CREATE OR REPLACE FUNCTION get_assets_by_path(path_prefix TEXT)
RETURNS TABLE (
    id UUID,
    contextual_path TEXT,
    name VARCHAR,
    iotdb_path TEXT,
    sparkplug_group VARCHAR,
    sparkplug_device VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.id, a.contextual_path, a.name, a.iotdb_path, a.sparkplug_group, a.sparkplug_device
    FROM assets a
    WHERE a.contextual_path LIKE path_prefix || '%'
    ORDER BY a.contextual_path;
END;
$$ LANGUAGE plpgsql;

-- Resolve legacy path to contextual path
CREATE OR REPLACE FUNCTION resolve_legacy_path(legacy TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    SELECT contextual_path INTO result
    FROM alias_mapping
    WHERE legacy_path = legacy AND migration_status = 'active';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────
-- Auto-update trigger
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assets_updated 
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_attr_instances_updated 
    BEFORE UPDATE ON attribute_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────────
-- Seed Data: Demo Assets
-- ──────────────────────────────────────────────────────────────
INSERT INTO assets (contextual_path, site, unit, device, measurement, name, asset_type, data_type, engineering_unit) VALUES
    ('houston/crude1/pump101.discharge_press', 'houston', 'crude1', 'pump101', 'discharge_press', 'P-101 Discharge Pressure', 'measurement', 'Double', 'bar'),
    ('houston/crude1/pump101.suction_press', 'houston', 'crude1', 'pump101', 'suction_press', 'P-101 Suction Pressure', 'measurement', 'Double', 'bar'),
    ('houston/crude1/pump101.motor_current', 'houston', 'crude1', 'pump101', 'motor_current', 'P-101 Motor Current', 'measurement', 'Double', 'A'),
    ('houston/crude1/pump101.running', 'houston', 'crude1', 'pump101', 'running', 'P-101 Running Status', 'measurement', 'Boolean', NULL),
    ('houston/crude1/fic1002.pv', 'houston', 'crude1', 'fic1002', 'pv', 'FIC-1002 Process Value', 'measurement', 'Double', 'm³/h'),
    ('houston/crude1/fic1002.sp', 'houston', 'crude1', 'fic1002', 'sp', 'FIC-1002 Setpoint', 'measurement', 'Double', 'm³/h'),
    ('houston/crude1/fic1002.op', 'houston', 'crude1', 'fic1002', 'op', 'FIC-1002 Output', 'measurement', 'Double', '%')
ON CONFLICT (contextual_path) DO NOTHING;

-- Seed: Legacy alias mappings for existing AMS alarms
INSERT INTO alias_mapping (legacy_path, contextual_path) VALUES
    ('root.ams.site1.alarms.FIC1002', 'houston/crude1/fic1002.pv')
ON CONFLICT (legacy_path) DO NOTHING;
