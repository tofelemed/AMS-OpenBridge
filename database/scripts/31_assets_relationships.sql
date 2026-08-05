-- ═══════════════════════════════════════════════════════════════════════════
-- 31_assets_relationships.sql — asset graph edges (CPLM Phase 4.1)
--
-- Traverse's asset model has exactly one edge type today: a nullable parent_id
-- on assets.assets. There are no navigation collections and no relate endpoint.
-- CPLM's G13 (disturbance context) needs PEER / UPSTREAM_OF links, and without
-- them the disturbance soft-block never fires — an oscillating loop that is
-- actually being disturbed from upstream gets diagnosed as stiction. That is a
-- false-positive generator, so this table is a correctness dependency, not
-- polish.
--
-- It lives in traverse_assets (not the cpm schema) because it is a general
-- Traverse capability: displays and alarm correlation want the same edges.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_assets

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

-- One edge of a given type per ordered pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_relationships_edge
    ON assets.asset_relationships (from_asset_id, to_asset_id, rel_type);

-- Both directions are queried: "who are my peers" (from) and "who points at me"
-- (to, for UPSTREAM_OF traversal without materialising the inverse edge).
CREATE INDEX IF NOT EXISTS idx_asset_relationships_from
    ON assets.asset_relationships (from_asset_id, rel_type);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_to
    ON assets.asset_relationships (to_asset_id, rel_type);

COMMENT ON TABLE assets.asset_relationships IS
    'Non-hierarchical asset edges. PEER is symmetric in meaning but stored as a '
    'single directed row; readers must check both directions (see the from/to '
    'indexes). UPSTREAM_OF/DOWNSTREAM_OF are inverses — store one, infer the other.';
