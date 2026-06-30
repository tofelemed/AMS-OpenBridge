-- ============================================================
-- Phase 0: traverse_templates database schema
-- Run against: traverse_templates database
-- ============================================================
-- Template service — Element templates, attribute templates
-- Ported from reference app Module 1
-- ============================================================

\connect traverse_templates;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- Element Templates (Placeholder for Phase 3)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE element_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    parent_template_id UUID REFERENCES element_templates(id),
    version INTEGER DEFAULT 1,
    is_abstract BOOLEAN DEFAULT FALSE,
    categories TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_element_templates_parent ON element_templates(parent_template_id);

-- ──────────────────────────────────────────────────────────────
-- Attribute Templates (Placeholder for Phase 3)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE attribute_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    element_template_id UUID REFERENCES element_templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50) NOT NULL,
    default_value TEXT,
    engineering_unit VARCHAR(32),
    data_ref_type VARCHAR(50) DEFAULT 'IoTDB',
    data_ref_config JSONB DEFAULT '{}',
    is_inherited BOOLEAN DEFAULT FALSE,
    inherited_from UUID REFERENCES attribute_templates(id),
    sort_order INTEGER DEFAULT 0,
    is_readonly BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(element_template_id, name)
);

CREATE INDEX idx_attribute_templates_element ON attribute_templates(element_template_id);

-- ──────────────────────────────────────────────────────────────
-- Template Versions (Placeholder for Phase 3)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES element_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    change_reason TEXT,
    changed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_id, version_number)
);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_templates_updated 
    BEFORE UPDATE ON element_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
