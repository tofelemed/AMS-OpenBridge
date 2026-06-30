-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1: Traverse Assets Database Schema
-- Creates the traverse_assets database for the Asset Model service.
-- This script runs on PostgreSQL init (docker-entrypoint-initdb.d).
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the database (only if it doesn't exist)
SELECT 'CREATE DATABASE traverse_assets OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_assets')\gexec

-- Connect to traverse_assets database
\c traverse_assets

-- Create schema
CREATE SCHEMA IF NOT EXISTS assets;

-- ───────────────────────────────────────────────────────────────────────────
-- Assets Table
-- Stores all assets in the Unified Namespace hierarchy.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets.assets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contextual_path   TEXT NOT NULL,
    name              TEXT NOT NULL,
    asset_type        INTEGER NOT NULL CHECK (asset_type BETWEEN 1 AND 5),
    description       TEXT,
    engineering_unit  TEXT,
    lo_eng_limit      DOUBLE PRECISION,
    hi_eng_limit      DOUBLE PRECISION,
    parent_id         UUID REFERENCES assets.assets(id),
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asset type enum reference:
-- 1 = Site, 2 = Area, 3 = Unit, 4 = Device, 5 = Measurement
COMMENT ON COLUMN assets.assets.asset_type IS '1=Site, 2=Area, 3=Unit, 4=Device, 5=Measurement';

-- Unique constraint on active contextual paths
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_contextual_path_unique 
ON assets.assets(contextual_path) 
WHERE NOT is_deleted;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_assets_parent_id ON assets.assets(parent_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets.assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets.assets(created_at);

-- Full-text search index on name and description
CREATE INDEX IF NOT EXISTS idx_assets_search 
ON assets.assets USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

-- ───────────────────────────────────────────────────────────────────────────
-- Alias Mapping Table
-- Maps legacy paths to canonical UNS paths for backward compatibility.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets.alias_mapping (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_path     TEXT NOT NULL,
    canonical_path  TEXT NOT NULL,
    source_system   TEXT NOT NULL DEFAULT 'unknown',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on legacy path + source system
CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_legacy_source 
ON assets.alias_mapping(legacy_path, source_system);

-- Index for canonical path lookups
CREATE INDEX IF NOT EXISTS idx_alias_canonical ON assets.alias_mapping(canonical_path);

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger: Auto-update updated_at timestamp
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assets.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets.assets;
CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON assets.assets
    FOR EACH ROW
    EXECUTE FUNCTION assets.update_timestamp();

-- ───────────────────────────────────────────────────────────────────────────
-- Seed Data: Sample Assets for Testing
-- Creates a sample hierarchy: houston site > crude1 unit > pump101 device
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO assets.assets (contextual_path, name, asset_type, description)
VALUES 
    ('houston', 'Houston Refinery', 1, 'Houston refinery site')
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT 'houston/crude1', 'Crude Unit 1', 3, 'Crude distillation unit 1', id
FROM assets.assets WHERE contextual_path = 'houston'
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT 'houston/crude1/pump101', 'Pump 101', 4, 'Crude feed pump', id
FROM assets.assets WHERE contextual_path = 'houston/crude1'
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, engineering_unit, lo_eng_limit, hi_eng_limit, parent_id)
SELECT 'houston/crude1/pump101.discharge_press', 'Discharge Pressure', 5, 'Pump discharge pressure', 'PSI', 0, 500, id
FROM assets.assets WHERE contextual_path = 'houston/crude1/pump101'
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, engineering_unit, lo_eng_limit, hi_eng_limit, parent_id)
SELECT 'houston/crude1/pump101.motor_temp', 'Motor Temperature', 5, 'Motor winding temperature', 'degC', 0, 150, id
FROM assets.assets WHERE contextual_path = 'houston/crude1/pump101'
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL ON SCHEMA assets TO ams_user;
GRANT ALL ON ALL TABLES IN SCHEMA assets TO ams_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA assets TO ams_user;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'traverse_assets schema created successfully with seed data';
END $$;
