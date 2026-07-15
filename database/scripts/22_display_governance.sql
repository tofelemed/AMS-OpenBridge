-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 (V2): Display management & governance
-- Adds folders, per-display/per-folder ACLs, tags, recent-access tracking and
-- version comments to traverse_displays. Personal views + favorites already
-- exist (13_personal_views_schema.sql) and get their first API in this phase.
--
-- Idempotent: every object uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so an
-- already-initialised database can be upgraded in place. The display-service
-- ALSO self-heals these at startup, so a running stack does not require a manual
-- re-seed; a fresh install picks them up here.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_displays

-- ───────────────────────────────────────────────────────────────────────────
-- Folders — a real tree, replacing the free-text hierarchy_path string-split.
-- hierarchy_path stays for backward compatibility; folder_id is the governed path.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES displays.folders(id) ON DELETE CASCADE,
    owner_id    TEXT NOT NULL DEFAULT 'system',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON displays.folders(parent_id);

DROP TRIGGER IF EXISTS trg_folders_updated_at ON displays.folders;
CREATE TRIGGER trg_folders_updated_at
    BEFORE UPDATE ON displays.folders
    FOR EACH ROW EXECUTE FUNCTION displays.update_timestamp();

-- Displays gain a folder pointer and keyword tags.
ALTER TABLE displays.display_definitions
    ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES displays.folders(id) ON DELETE SET NULL;
ALTER TABLE displays.display_definitions
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_displays_folder ON displays.display_definitions(folder_id);
CREATE INDEX IF NOT EXISTS idx_displays_tags ON displays.display_definitions USING GIN(tags);

-- ───────────────────────────────────────────────────────────────────────────
-- Access control — grant read/edit on a display OR a folder to a user or a role.
-- Enforcement lives in display-service (server-side); ownership + Admin bypass.
-- Exactly one of display_id / folder_id is set per row.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.display_acl (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id     UUID REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
    folder_id      UUID REFERENCES displays.folders(id) ON DELETE CASCADE,
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'role')),
    principal      TEXT NOT NULL,
    access         TEXT NOT NULL CHECK (access IN ('read', 'edit')),
    created_by     TEXT NOT NULL DEFAULT 'system',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_acl_target CHECK (
        (display_id IS NOT NULL AND folder_id IS NULL) OR
        (display_id IS NULL AND folder_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_acl_display ON displays.display_acl(display_id);
CREATE INDEX IF NOT EXISTS idx_acl_folder  ON displays.display_acl(folder_id);
CREATE INDEX IF NOT EXISTS idx_acl_principal ON displays.display_acl(principal_type, principal);

-- ───────────────────────────────────────────────────────────────────────────
-- Recently-opened — server-side "Recent" list (was localStorage, per-browser).
-- Upserted when a runtime viewer loads a display's published content.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.recent_displays (
    user_id     TEXT NOT NULL,
    display_id  UUID NOT NULL REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, display_id)
);
CREATE INDEX IF NOT EXISTS idx_recent_user ON displays.recent_displays(user_id, accessed_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- Version comments — review notes attached to a display (optionally a version).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS displays.display_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id  UUID NOT NULL REFERENCES displays.display_definitions(id) ON DELETE CASCADE,
    version     INTEGER,
    author      TEXT NOT NULL DEFAULT 'system',
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_display ON displays.display_comments(display_id, created_at DESC);

-- Grants
GRANT ALL ON ALL TABLES IN SCHEMA displays TO ams_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA displays TO ams_user;

DO $$ BEGIN RAISE NOTICE 'Display governance schema (folders, ACL, tags, recent, comments) created'; END $$;
