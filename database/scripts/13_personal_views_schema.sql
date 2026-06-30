-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3: Personal Views Schema (extension to traverse_displays)
-- Operator-customizable, non-controlled displays stored per-user.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_displays

-- ───────────────────────────────────────────────────────────────────────────
-- Personal Views Table
-- Non-versioned, non-controlled displays for individual operators.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.personal_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    
    -- Display configuration
    width           INTEGER NOT NULL DEFAULT 1920,
    height          INTEGER NOT NULL DEFAULT 1080,
    background_color TEXT NOT NULL DEFAULT '#1e1e1e',
    
    -- View content (same schema as display snapshots, but non-versioned)
    config          JSONB NOT NULL DEFAULT '{"items": []}'::jsonb,
    
    -- Based on a controlled display? (for "save as personal view" feature)
    source_display_id UUID REFERENCES displays.display_definitions(id),
    
    -- Sharing
    is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
    shared_with     TEXT[] DEFAULT '{}',
    
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE displays.personal_views IS 'Operator-customizable views (non-controlled, not versioned)';
COMMENT ON COLUMN displays.personal_views.config IS 'Same schema as display snapshots - items with bindings';
COMMENT ON COLUMN displays.personal_views.source_display_id IS 'Source controlled display if created via "Save as Personal View"';

CREATE INDEX IF NOT EXISTS idx_pv_user ON displays.personal_views(user_id);
CREATE INDEX IF NOT EXISTS idx_pv_shared ON displays.personal_views(is_shared) WHERE is_shared = TRUE;

-- ───────────────────────────────────────────────────────────────────────────
-- Personal View Favorites
-- Quick-access list for frequently used views.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.view_favorites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    
    -- Can favorite either controlled displays or personal views
    display_id      UUID REFERENCES displays.display_definitions(id),
    personal_view_id UUID REFERENCES displays.personal_views(id),
    
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure only one of display_id or personal_view_id is set
    CONSTRAINT chk_favorite_target CHECK (
        (display_id IS NOT NULL AND personal_view_id IS NULL) OR
        (display_id IS NULL AND personal_view_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_fav_user ON displays.view_favorites(user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- CQRS Enforcement for Personal Views
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION displays.validate_pv_no_process_values()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.config::text ~ '"(currentValue|processValue|liveValue)"' THEN
        RAISE EXCEPTION 'Personal views must not store process values';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pv_validate ON displays.personal_views;
CREATE TRIGGER trg_pv_validate
    BEFORE INSERT OR UPDATE ON displays.personal_views
    FOR EACH ROW
    EXECUTE FUNCTION displays.validate_pv_no_process_values();

-- ───────────────────────────────────────────────────────────────────────────
-- Auto-update timestamp
-- ───────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pv_updated_at ON displays.personal_views;
CREATE TRIGGER trg_pv_updated_at
    BEFORE UPDATE ON displays.personal_views
    FOR EACH ROW
    EXECUTE FUNCTION displays.update_timestamp();

-- Grant permissions
GRANT ALL ON displays.personal_views TO ams_user;
GRANT ALL ON displays.view_favorites TO ams_user;

DO $$ BEGIN RAISE NOTICE 'Personal views schema created'; END $$;
