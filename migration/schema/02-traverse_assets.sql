-- target: traverse_assets
-- DDL only. HDPE site/areas/units: migration/sql/03-hdpe-hierarchy.sql (Phase 4).
-- Source: 10_ + 31_ + 43_ (override columns folded into CREATE). Houston seed omitted.
-- Applied with: psql -d traverse_assets -v ON_ERROR_STOP=1 -f this file

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS assets;

-- asset_type: 1=Site, 2=Area, 3=Unit, 4=Device, 5=Measurement
CREATE TABLE IF NOT EXISTS assets.assets (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contextual_path            TEXT NOT NULL,
    name                       TEXT NOT NULL,
    asset_type                 INTEGER NOT NULL CHECK (asset_type BETWEEN 1 AND 5),
    description                TEXT,
    engineering_unit           TEXT,
    lo_eng_limit               DOUBLE PRECISION,
    hi_eng_limit               DOUBLE PRECISION,
    parent_id                  UUID REFERENCES assets.assets(id),
    is_deleted                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    iotdb_path_override        TEXT NULL,
    sparkplug_group_override   TEXT NULL,
    sparkplug_edge_override    TEXT NULL,
    sparkplug_device_override  TEXT NULL,
    sparkplug_metric_override  TEXT NULL
);

COMMENT ON COLUMN assets.assets.asset_type IS '1=Site, 2=Area, 3=Unit, 4=Device, 5=Measurement';
COMMENT ON COLUMN assets.assets.iotdb_path_override IS
    'Historian series override (full IoTDB path incl. measurement). NULL = derive root.<contextual_path>.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_contextual_path_unique
    ON assets.assets(contextual_path) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_assets_parent_id   ON assets.assets(parent_id);
CREATE INDEX IF NOT EXISTS idx_assets_type        ON assets.assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_created_at  ON assets.assets(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_search
    ON assets.assets USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

CREATE TABLE IF NOT EXISTS assets.alias_mapping (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_path     TEXT NOT NULL,
    canonical_path  TEXT NOT NULL,
    source_system   TEXT NOT NULL DEFAULT 'unknown',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_legacy_source
    ON assets.alias_mapping(legacy_path, source_system);
CREATE INDEX IF NOT EXISTS idx_alias_canonical ON assets.alias_mapping(canonical_path);

CREATE TABLE IF NOT EXISTS assets.asset_relationships (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_asset_id  UUID NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
    to_asset_id    UUID NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
    rel_type       TEXT NOT NULL CHECK (rel_type IN
                       ('PEER', 'UPSTREAM_OF', 'DOWNSTREAM_OF',
                        'CASCADE_PRIMARY', 'CASCADE_SECONDARY')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT,
    CONSTRAINT chk_asset_rel_not_self CHECK (from_asset_id <> to_asset_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_relationships_edge
    ON assets.asset_relationships (from_asset_id, to_asset_id, rel_type);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_from
    ON assets.asset_relationships (from_asset_id, rel_type);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_to
    ON assets.asset_relationships (to_asset_id, rel_type);

CREATE OR REPLACE FUNCTION assets.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets.assets;
CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON assets.assets
    FOR EACH ROW
    EXECUTE FUNCTION assets.update_timestamp();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON SCHEMA assets TO ams_user;
        GRANT ALL ON ALL TABLES IN SCHEMA assets TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA assets TO ams_user;
    END IF;
END $$;
