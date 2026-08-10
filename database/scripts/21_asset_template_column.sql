\c traverse_assets
-- DATA-11: previously ran against ams (no \c) and errored; explicit targeting now.
-- Phase 4 — asset type/template name for "assets of the same type" queries (collections, dynamic
-- search criteria, asset context switching). asset-model also adds this at startup (ADD COLUMN IF
-- NOT EXISTS) so an already-initialised database self-heals; this covers a fresh install.


-- DATA-11: this script has no \c and therefore ran against the default POSTGRES_DB
-- ('ams'), where these objects do not exist. Under the postgres entrypoint's
-- ON_ERROR_STOP that aborted the whole fresh-volume init at this file, so every
-- later script silently never ran. Connect to the owning database first.
\c traverse_assets

ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS template TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_template ON assets.assets (template) WHERE NOT is_deleted;
