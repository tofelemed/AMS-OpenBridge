-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3: Traverse Templates Database Schema
-- Creates the traverse_templates database for the Template Service.
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the database
SELECT 'CREATE DATABASE traverse_templates OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_templates')\gexec

\c traverse_templates

CREATE SCHEMA IF NOT EXISTS templates;

-- ───────────────────────────────────────────────────────────────────────────
-- Element Templates Table
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates.element_templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'General',
    description       TEXT,
    icon              TEXT,
    published_version INTEGER,
    draft_version     INTEGER NOT NULL DEFAULT 1,
    owner_id          TEXT NOT NULL,
    is_system         BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_name ON templates.element_templates(name);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates.element_templates(category);

-- ───────────────────────────────────────────────────────────────────────────
-- Template Versions Table
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates.template_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES templates.element_templates(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    definition      JSONB NOT NULL,
    default_width   INTEGER NOT NULL DEFAULT 200,
    default_height  INTEGER NOT NULL DEFAULT 200,
    status          TEXT NOT NULL DEFAULT 'draft',
    change_note     TEXT,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_tversions_template ON templates.template_versions(template_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Template Parameters Table
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates.template_parameters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES templates.element_templates(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'path',
    default_value   TEXT,
    required        BOOLEAN NOT NULL DEFAULT TRUE,
    description     TEXT,
    
    UNIQUE(template_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tparams_template ON templates.template_parameters(template_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Auto-update timestamp trigger
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION templates.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_templates_updated_at ON templates.element_templates;
CREATE TRIGGER trg_templates_updated_at
    BEFORE UPDATE ON templates.element_templates
    FOR EACH ROW
    EXECUTE FUNCTION templates.update_timestamp();

-- ───────────────────────────────────────────────────────────────────────────
-- Seed Data: System Templates
-- ───────────────────────────────────────────────────────────────────────────

-- Centrifugal Pump Template
INSERT INTO templates.element_templates (id, name, category, description, owner_id, is_system, published_version, draft_version)
VALUES (
    'a0000001-0000-0000-0000-000000000001',
    'Centrifugal Pump',
    'Rotating Equipment',
    'Standard centrifugal pump with discharge pressure, motor status, and temperature',
    'system',
    TRUE,
    1,
    1
) ON CONFLICT DO NOTHING;

INSERT INTO templates.template_parameters (template_id, name, label, type, required, description)
VALUES 
    ('a0000001-0000-0000-0000-000000000001', 'basePath', 'Base Path', 'path', TRUE, 'UNS path prefix (e.g., houston/crude1/pump101)'),
    ('a0000001-0000-0000-0000-000000000001', 'pumpName', 'Pump Name', 'string', FALSE, 'Display name override')
ON CONFLICT DO NOTHING;

INSERT INTO templates.template_versions (template_id, version, definition, default_width, default_height, status, change_note, created_by)
VALUES (
    'a0000001-0000-0000-0000-000000000001',
    1,
    '{
        "items": [
            {
                "id": "pump-symbol",
                "type": "equip.pump",
                "position": {"x": 10, "y": 10},
                "size": {"width": 80, "height": 80},
                "bindings": {"status": "{{basePath}}.running"},
                "label": "{{pumpName}}"
            },
            {
                "id": "discharge-press",
                "type": "ind.numeric",
                "position": {"x": 100, "y": 10},
                "size": {"width": 100, "height": 50},
                "bindings": {"value": "{{basePath}}.discharge_press"},
                "label": "Discharge",
                "formatting": {"decimals": 1, "unit": "PSI"}
            },
            {
                "id": "motor-temp",
                "type": "ind.numeric",
                "position": {"x": 100, "y": 70},
                "size": {"width": 100, "height": 50},
                "bindings": {"value": "{{basePath}}.motor_temp"},
                "label": "Motor Temp",
                "formatting": {"decimals": 0, "unit": "°C"}
            }
        ]
    }'::jsonb,
    210,
    130,
    'published',
    'Initial system template',
    'system'
) ON CONFLICT DO NOTHING;

-- Control Valve Template
INSERT INTO templates.element_templates (id, name, category, description, owner_id, is_system, published_version, draft_version)
VALUES (
    'a0000002-0000-0000-0000-000000000002',
    'Control Valve',
    'Valves',
    'Control valve with position feedback and setpoint',
    'system',
    TRUE,
    1,
    1
) ON CONFLICT DO NOTHING;

INSERT INTO templates.template_parameters (template_id, name, label, type, required)
VALUES 
    ('a0000002-0000-0000-0000-000000000002', 'basePath', 'Base Path', 'path', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO templates.template_versions (template_id, version, definition, default_width, default_height, status, change_note, created_by)
VALUES (
    'a0000002-0000-0000-0000-000000000002',
    1,
    '{
        "items": [
            {
                "id": "valve-symbol",
                "type": "equip.valve",
                "position": {"x": 10, "y": 10},
                "size": {"width": 60, "height": 60},
                "bindings": {"status": "{{basePath}}.position"}
            },
            {
                "id": "position",
                "type": "ind.numeric",
                "position": {"x": 80, "y": 10},
                "size": {"width": 80, "height": 40},
                "bindings": {"value": "{{basePath}}.position"},
                "label": "Position",
                "formatting": {"decimals": 1, "unit": "%"}
            },
            {
                "id": "setpoint",
                "type": "ind.numeric",
                "position": {"x": 80, "y": 55},
                "size": {"width": 80, "height": 40},
                "bindings": {"value": "{{basePath}}.setpoint"},
                "label": "Setpoint",
                "formatting": {"decimals": 1, "unit": "%"}
            }
        ]
    }'::jsonb,
    170,
    100,
    'published',
    'Initial system template',
    'system'
) ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL ON SCHEMA templates TO ams_user;
GRANT ALL ON ALL TABLES IN SCHEMA templates TO ams_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA templates TO ams_user;

DO $$ BEGIN RAISE NOTICE 'traverse_templates schema created with system templates'; END $$;
