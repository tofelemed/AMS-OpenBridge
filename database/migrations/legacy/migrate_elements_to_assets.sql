-- ═══════════════════════════════════════════════════════════════════════════
-- Legacy Migration: Elements to Assets
-- Migrates element hierarchy from reference app to traverse_assets.
-- Run AFTER traverse_assets schema is created.
-- ═══════════════════════════════════════════════════════════════════════════

-- This script assumes the legacy industrial_vis database exists and is accessible.
-- Adjust connection/schema names as needed for your environment.

\c traverse_assets

-- ───────────────────────────────────────────────────────────────────────────
-- Step 1: Create staging table for legacy data
-- ───────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE legacy_elements (
    legacy_id       TEXT,
    legacy_path     TEXT,
    name            TEXT,
    element_type    TEXT,
    parent_path     TEXT,
    template_name   TEXT,
    description     TEXT
);

-- ───────────────────────────────────────────────────────────────────────────
-- Step 2: Insert sample legacy data (replace with actual migration query)
-- In production, this would be:
-- INSERT INTO legacy_elements SELECT ... FROM industrial_vis.elements;
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO legacy_elements (legacy_id, legacy_path, name, element_type, parent_path, description)
VALUES
    ('site-1', 'Houston', 'Houston Refinery', 'Site', NULL, 'Main Houston site'),
    ('area-1', 'Houston/Refinery', 'Refinery', 'Area', 'Houston', 'Refinery area'),
    ('unit-1', 'Houston/Refinery/Crude1', 'Crude Unit 1', 'Unit', 'Houston/Refinery', 'CDU-1'),
    ('dev-1', 'Houston/Refinery/Crude1/Pump101', 'Pump 101', 'Device', 'Houston/Refinery/Crude1', 'Crude feed pump'),
    ('meas-1', 'Houston/Refinery/Crude1/Pump101.DischargePress', 'Discharge Pressure', 'Measurement', 'Houston/Refinery/Crude1/Pump101', 'PSI');

-- ───────────────────────────────────────────────────────────────────────────
-- Step 3: Transform and insert into assets table
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO assets.assets (contextual_path, name, asset_type, description)
SELECT
    -- Transform path: Houston/Refinery/Crude1 → houston/refinery/crude1
    LOWER(REPLACE(legacy_path, ' ', '_')) AS contextual_path,
    name,
    CASE element_type
        WHEN 'Site' THEN 1
        WHEN 'Area' THEN 2
        WHEN 'Unit' THEN 3
        WHEN 'Device' THEN 4
        WHEN 'Measurement' THEN 5
        ELSE 4
    END AS asset_type,
    description
FROM legacy_elements
WHERE NOT EXISTS (
    SELECT 1 FROM assets.assets a 
    WHERE a.contextual_path = LOWER(REPLACE(legacy_path, ' ', '_'))
);

-- ───────────────────────────────────────────────────────────────────────────
-- Step 4: Update parent_id references
-- ───────────────────────────────────────────────────────────────────────────
UPDATE assets.assets child
SET parent_id = parent.id
FROM legacy_elements le
JOIN assets.assets parent ON parent.contextual_path = LOWER(REPLACE(le.parent_path, ' ', '_'))
WHERE child.contextual_path = LOWER(REPLACE(le.legacy_path, ' ', '_'))
  AND le.parent_path IS NOT NULL
  AND child.parent_id IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Step 5: Create alias mappings for legacy path resolution
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO assets.alias_mapping (legacy_path, canonical_path, source_system)
SELECT
    legacy_path,
    LOWER(REPLACE(legacy_path, ' ', '_')),
    'reference-app'
FROM legacy_elements
WHERE NOT EXISTS (
    SELECT 1 FROM assets.alias_mapping am 
    WHERE am.legacy_path = legacy_elements.legacy_path
      AND am.source_system = 'reference-app'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Step 6: Verify migration
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    asset_count INTEGER;
    alias_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO asset_count FROM assets.assets;
    SELECT COUNT(*) INTO alias_count FROM assets.alias_mapping;
    RAISE NOTICE 'Migration complete: % assets, % alias mappings', asset_count, alias_count;
END $$;

-- Clean up
DROP TABLE IF EXISTS legacy_elements;
