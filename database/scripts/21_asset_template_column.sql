-- Phase 4 — asset type/template name for "assets of the same type" queries (collections, dynamic
-- search criteria, asset context switching). asset-model also adds this at startup (ADD COLUMN IF
-- NOT EXISTS) so an already-initialised database self-heals; this covers a fresh install.

ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS template TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_template ON assets.assets (template) WHERE NOT is_deleted;
