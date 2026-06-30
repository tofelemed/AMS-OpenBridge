-- ============================================================
-- Phase 0: traverse_displays database schema
-- Run against: traverse_displays database
-- ============================================================
-- Display service — Controlled displays + Operator personal views
-- ISA-101 two-tier model: engineer-owned vs operator-owned
-- ============================================================

\connect traverse_displays;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- CONTROLLED DISPLAYS (Engineer/Admin owned, versioned, MOC)
-- ──────────────────────────────────────────────────────────────

-- Display definitions (metadata, not content)
CREATE TABLE display_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Ownership and access
    owner_id UUID,                          -- Engineer who created it
    current_version_id UUID,                -- Points to active version
    is_deployed BOOLEAN DEFAULT FALSE,      -- MOC gate: deployed = in production
    
    -- Classification
    display_type VARCHAR(64) DEFAULT 'faceplate',  -- faceplate, overview, detail, trend
    isa101_level INTEGER DEFAULT 3,         -- 1=overview, 2=area, 3=unit, 4=detail
    tags TEXT[] DEFAULT '{}',
    
    -- Visibility
    is_public BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    deployed_at TIMESTAMPTZ,
    deployed_by UUID
);

CREATE INDEX idx_displays_owner ON display_definitions(owner_id);
CREATE INDEX idx_displays_type ON display_definitions(display_type);
CREATE INDEX idx_displays_deployed ON display_definitions(is_deployed);

-- Display versions (immutable snapshots)
CREATE TABLE display_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id UUID NOT NULL REFERENCES display_definitions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Content: CONFIGURATION ONLY (no process values!)
    -- Layout + symbols + bindings (path/role) — never current values
    snapshot JSONB NOT NULL,
    
    -- Thumbnail (client-side captured at save)
    thumbnail_data TEXT,                    -- Base64 PNG or data URL
    
    -- Integrity
    checksum VARCHAR(64),                   -- SHA-256 of snapshot
    
    -- Metadata
    author_id UUID,
    change_summary TEXT,
    is_major_version BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(display_id, version_number)
);

CREATE INDEX idx_versions_display ON display_versions(display_id, version_number DESC);

-- Display comments (for version review)
CREATE TABLE display_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id UUID NOT NULL REFERENCES display_definitions(id) ON DELETE CASCADE,
    version_id UUID REFERENCES display_versions(id),
    
    user_id UUID,
    comment TEXT NOT NULL,
    
    -- Optional: position annotation
    symbol_id VARCHAR(100),
    position_x DOUBLE PRECISION,
    position_y DOUBLE PRECISION,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_display ON display_comments(display_id);
CREATE INDEX idx_comments_version ON display_comments(version_id);

-- ──────────────────────────────────────────────────────────────
-- OPERATOR PERSONAL VIEWS (Operator owned, no MOC, no versioning)
-- ──────────────────────────────────────────────────────────────

-- Operator's personal trend groups, watchlists, favourites
CREATE TABLE operator_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership (operator-specific, not shared)
    operator_id UUID NOT NULL,
    
    -- View metadata
    name VARCHAR(255) NOT NULL,
    view_type VARCHAR(64) NOT NULL,         -- trend_group, watchlist, favourite, custom
    description TEXT,
    
    -- Content: CONFIGURATION ONLY (bindings, never values)
    config JSONB NOT NULL,
    
    -- Timestamps (no versioning, just last modified)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_operator_views_owner ON operator_views(operator_id);
CREATE INDEX idx_operator_views_type ON operator_views(view_type);
CREATE INDEX idx_operator_views_active ON operator_views(operator_id, is_deleted) WHERE NOT is_deleted;

-- ──────────────────────────────────────────────────────────────
-- VALIDATION: Enforce no process values in display snapshots
-- ──────────────────────────────────────────────────────────────

-- Trigger function to validate snapshot contains no values
CREATE OR REPLACE FUNCTION validate_display_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    has_values BOOLEAN;
BEGIN
    -- Check for forbidden fields that would indicate stored process values
    -- Bindings should have path+role, NOT value/quality/timestamp
    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            COALESCE(NEW.snapshot->'items', '[]'::jsonb)
        ) AS item
        WHERE item->'bindings' ? 'currentValue'
           OR item->'bindings' ? 'value'
           OR item->'bindings' ? 'processValue'
           OR item ? 'liveValue'
           OR item ? 'cachedValue'
    ) INTO has_values;
    
    IF has_values THEN
        RAISE EXCEPTION 'Display snapshot must not contain process values. Use path+role bindings only.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_display_snapshot
    BEFORE INSERT OR UPDATE ON display_versions
    FOR EACH ROW EXECUTE FUNCTION validate_display_snapshot();

-- Same validation for operator views
CREATE OR REPLACE FUNCTION validate_operator_view_config()
RETURNS TRIGGER AS $$
DECLARE
    has_values BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            COALESCE(NEW.config->'items', '[]'::jsonb)
        ) AS item
        WHERE item ? 'currentValue'
           OR item ? 'processValue'
           OR item ? 'liveValue'
    ) INTO has_values;
    
    IF has_values THEN
        RAISE EXCEPTION 'Operator view config must not contain process values.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_operator_view
    BEFORE INSERT OR UPDATE ON operator_views
    FOR EACH ROW EXECUTE FUNCTION validate_operator_view_config();

-- ──────────────────────────────────────────────────────────────
-- Helper Functions
-- ──────────────────────────────────────────────────────────────

-- Get latest version number for a display
CREATE OR REPLACE FUNCTION get_next_version_number(p_display_id UUID)
RETURNS INTEGER AS $$
DECLARE
    max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) INTO max_version
    FROM display_versions
    WHERE display_id = p_display_id;
    
    RETURN max_version + 1;
END;
$$ LANGUAGE plpgsql;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_displays_updated 
    BEFORE UPDATE ON display_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_operator_views_updated 
    BEFORE UPDATE ON operator_views
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
