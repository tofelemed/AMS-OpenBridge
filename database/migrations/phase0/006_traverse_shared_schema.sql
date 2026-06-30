-- ============================================================
-- Phase 0: traverse_shared database schema
-- Run against: traverse_shared database
-- ============================================================
-- Shared reference data — UOM, categories, user preferences
-- ============================================================

\connect traverse_shared;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- UOM ENGINE (Ported from reference app Module 6)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uom_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uom_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES uom_classes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    is_base_unit BOOLEAN DEFAULT FALSE,
    conversion_factor DOUBLE PRECISION DEFAULT 1.0,
    conversion_offset DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, name)
);

-- Seed UOM data
INSERT INTO uom_classes (name, description) VALUES
    ('Temperature', 'Thermal measurement'),
    ('Pressure', 'Force per unit area'),
    ('Flow', 'Volume flow rate'),
    ('Power', 'Rate of energy transfer'),
    ('Speed', 'Rotational speed'),
    ('Mass', 'Weight measurement'),
    ('Length', 'Linear distance'),
    ('Percentage', 'Dimensionless ratio'),
    ('Current', 'Electrical current'),
    ('Voltage', 'Electrical potential')
ON CONFLICT (name) DO NOTHING;

-- Temperature units
WITH tc AS (SELECT id FROM uom_classes WHERE name='Temperature')
INSERT INTO uom_units (class_id, name, symbol, is_base_unit, conversion_factor, conversion_offset)
SELECT tc.id, u.name, u.symbol, u.is_base, u.factor, u.conv_offset FROM tc,
(VALUES
  ('Celsius', '°C', true, 1.0, 0.0),
  ('Fahrenheit', '°F', false, 0.5556, -17.7778),
  ('Kelvin', 'K', false, 1.0, -273.15)
) AS u(name, symbol, is_base, factor, conv_offset)
ON CONFLICT (class_id, name) DO NOTHING;

-- Pressure units
WITH tc AS (SELECT id FROM uom_classes WHERE name='Pressure')
INSERT INTO uom_units (class_id, name, symbol, is_base_unit, conversion_factor, conversion_offset)
SELECT tc.id, u.name, u.symbol, u.is_base, u.factor, u.conv_offset FROM tc,
(VALUES
  ('bar', 'bar', true, 1.0, 0.0),
  ('PSI', 'psi', false, 0.0689476, 0.0),
  ('kilopascal', 'kPa', false, 0.01, 0.0),
  ('megapascal', 'MPa', false, 10.0, 0.0)
) AS u(name, symbol, is_base, factor, conv_offset)
ON CONFLICT (class_id, name) DO NOTHING;

-- Current units
WITH tc AS (SELECT id FROM uom_classes WHERE name='Current')
INSERT INTO uom_units (class_id, name, symbol, is_base_unit, conversion_factor, conversion_offset)
SELECT tc.id, u.name, u.symbol, u.is_base, u.factor, u.conv_offset FROM tc,
(VALUES
  ('Ampere', 'A', true, 1.0, 0.0),
  ('Milliampere', 'mA', false, 0.001, 0.0)
) AS u(name, symbol, is_base, factor, conv_offset)
ON CONFLICT (class_id, name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- CATEGORY SYSTEM (Ported from reference app Module 7)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id),
    color VARCHAR(7) DEFAULT '#64748b',
    icon VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_tags (
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    PRIMARY KEY (category_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_category_tags_entity ON category_tags(entity_type, entity_id);

-- Seed categories
INSERT INTO categories (name, description, color) VALUES
    ('Equipment', 'Physical equipment assets', '#3b82f6'),
    ('Rotating', 'Rotating machinery', '#8b5cf6'),
    ('Static', 'Static equipment', '#64748b'),
    ('Electrical', 'Electrical systems', '#ef4444'),
    ('Measurement', 'Sensors and instruments', '#06b6d4'),
    ('Control', 'Control loops and valves', '#22c55e'),
    ('Safety', 'Safety systems', '#f59e0b')
ON CONFLICT (name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- USER PREFERENCES (Traverse-specific, extends AMS users)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY,               -- References AMS users.id
    theme VARCHAR(32) DEFAULT 'day',        -- bright, day, dusk, night
    default_site VARCHAR(64),
    default_unit VARCHAR(64),
    dashboard_layout JSONB DEFAULT '{}',
    notification_settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- RESOURCE PERMISSIONS (Fine-grained access control)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,                  -- References AMS users.id
    resource_type VARCHAR(64) NOT NULL,     -- display, asset, template, analysis
    resource_id UUID NOT NULL,
    permission VARCHAR(32) NOT NULL,        -- read, write, delete, deploy
    granted_by UUID,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(user_id, resource_type, resource_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_resource_perms_user ON resource_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_perms_resource ON resource_permissions(resource_type, resource_id);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prefs_updated ON user_preferences;
CREATE TRIGGER trg_prefs_updated 
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
