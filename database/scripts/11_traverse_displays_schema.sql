-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2: Traverse Displays Database Schema
-- Creates the traverse_displays database for the Display Service.
-- This script runs on PostgreSQL init (docker-entrypoint-initdb.d).
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the database (only if it doesn't exist)
SELECT 'CREATE DATABASE traverse_displays OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_displays')\gexec

-- Connect to traverse_displays database
\c traverse_displays

-- Create schema
CREATE SCHEMA IF NOT EXISTS displays;

-- ───────────────────────────────────────────────────────────────────────────
-- Display Definitions Table
-- Metadata for HMI displays (controlled artifacts).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.display_definitions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'overview',
    description       TEXT,
    hierarchy_path    TEXT,
    width             INTEGER NOT NULL DEFAULT 1920,
    height            INTEGER NOT NULL DEFAULT 1080,
    background_color  TEXT NOT NULL DEFAULT '#1e1e1e',
    published_version INTEGER,
    draft_version     INTEGER NOT NULL DEFAULT 1,
    owner_id          TEXT NOT NULL,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE displays.display_definitions IS 'HMI display definitions (controlled artifacts)';
COMMENT ON COLUMN displays.display_definitions.category IS 'overview, detail, faceplate, trend, alarm';
COMMENT ON COLUMN displays.display_definitions.hierarchy_path IS 'ISA-101 navigation path (e.g., Site1/Unit2/Area3)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_displays_name ON displays.display_definitions(name);
CREATE INDEX IF NOT EXISTS idx_displays_category ON displays.display_definitions(category);
CREATE INDEX IF NOT EXISTS idx_displays_hierarchy ON displays.display_definitions(hierarchy_path);
CREATE INDEX IF NOT EXISTS idx_displays_owner ON displays.display_definitions(owner_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Display Versions Table
-- Versioned snapshots of display content.
-- CRITICAL: Snapshots must NOT contain process values (CQRS enforcement).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.display_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id      UUID NOT NULL REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    snapshot        JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    change_note     TEXT,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(display_id, version)
);

COMMENT ON TABLE displays.display_versions IS 'Versioned display snapshots (items, bindings, layout)';
COMMENT ON COLUMN displays.display_versions.status IS 'draft, published, archived';
COMMENT ON COLUMN displays.display_versions.snapshot IS 'JSON: { items: [], metadata: {} } - NO process values allowed';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_versions_display ON displays.display_versions(display_id);
CREATE INDEX IF NOT EXISTS idx_versions_status ON displays.display_versions(status);

-- ───────────────────────────────────────────────────────────────────────────
-- CQRS Enforcement Trigger
-- Prevents process values from being stored in display snapshots.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION displays.validate_no_process_values()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.snapshot::text ~ '"(currentValue|processValue|liveValue|realTimeValue)"' THEN
        RAISE EXCEPTION 'CQRS VIOLATION: Display snapshots must not contain process values. Bindings should reference UNS paths only.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_snapshot ON displays.display_versions;
CREATE TRIGGER trg_validate_snapshot
    BEFORE INSERT OR UPDATE ON displays.display_versions
    FOR EACH ROW
    EXECUTE FUNCTION displays.validate_no_process_values();

-- ───────────────────────────────────────────────────────────────────────────
-- Auto-update timestamp trigger
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION displays.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_displays_updated_at ON displays.display_definitions;
CREATE TRIGGER trg_displays_updated_at
    BEFORE UPDATE ON displays.display_definitions
    FOR EACH ROW
    EXECUTE FUNCTION displays.update_timestamp();

-- ───────────────────────────────────────────────────────────────────────────
-- Seed Data: Sample Display
-- Creates a sample overview display for testing.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO displays.display_definitions (name, category, description, hierarchy_path, owner_id)
VALUES ('Houston Overview', 'overview', 'Main overview display for Houston site', 'Houston', 'system')
ON CONFLICT DO NOTHING;

-- Insert initial version for the sample display
INSERT INTO displays.display_versions (display_id, version, snapshot, status, change_note, created_by)
SELECT id, 1, 
    '{"items": [
        {
            "id": "sample-label-1",
            "type": "label",
            "position": {"x": 50, "y": 30},
            "size": {"width": 300, "height": 40},
            "label": "Houston Refinery Overview"
        },
        {
            "id": "sample-numeric-1",
            "type": "ind.numeric",
            "position": {"x": 50, "y": 100},
            "size": {"width": 120, "height": 60},
            "label": "Pump 101 Pressure",
            "bindings": {"value": "houston/crude1/pump101.discharge_press"},
            "formatting": {"decimals": 1, "unit": "PSI"}
        }
    ], "metadata": {"createdAt": "2026-06-30T12:00:00Z"}}'::jsonb,
    'draft', 'Initial sample display', 'system'
FROM displays.display_definitions
WHERE name = 'Houston Overview'
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL ON SCHEMA displays TO ams_user;
GRANT ALL ON ALL TABLES IN SCHEMA displays TO ams_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA displays TO ams_user;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'traverse_displays schema created successfully with seed data';
END $$;
