-- Phase 3 — media asset store for image/SVG symbols (and the future custom graphics library).
-- Referenced by display snapshots via id only (config-only invariant: never inline the bytes).
-- display-service also creates this table at startup (CREATE TABLE IF NOT EXISTS) so an already
-- initialised database self-heals; this script covers a fresh install.


-- DATA-11: this script has no \c and therefore ran against the default POSTGRES_DB
-- ('ams'), where these objects do not exist. Under the postgres entrypoint's
-- ON_ERROR_STOP that aborted the whole fresh-volume init at this file, so every
-- later script silently never ran. Connect to the owning database first.
\c traverse_displays

CREATE SCHEMA IF NOT EXISTS displays;

CREATE TABLE IF NOT EXISTS displays.media_assets (
    id           UUID PRIMARY KEY,
    content_type TEXT NOT NULL,
    data         BYTEA NOT NULL,
    byte_size    INTEGER NOT NULL,
    file_name    TEXT,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
