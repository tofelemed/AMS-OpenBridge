-- ═══════════════════════════════════════════════════════════════════════════
-- 44_cpm_signal_asset_ledger.sql — ledger of UNS assets projected for loop signals
--
-- Mirrors CpmLoopRegistryService.EnsureSchemaAsync (which self-heals this table);
-- kept here because database/scripts is the sole live schema path.
--
-- cplm-api projects one UNS asset per mapped loop-signal role, with transport
-- overrides pointing at the loop pipeline (43_traverse_assets_transport_overrides
-- in traverse_assets). Reconciliation must know exactly what the projection
-- touched: assets it CREATED may be deleted when a role is unmapped; assets that
-- pre-existed and were only overridden get their overrides cleared, never deleted.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_cplm

CREATE TABLE IF NOT EXISTS cpm.loop_signal_asset (
    loop_id               VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    signal_role           VARCHAR(16) NOT NULL,
    contextual_path       VARCHAR(512) NOT NULL,
    asset_id              UUID NOT NULL,
    created_by_projection BOOLEAN NOT NULL DEFAULT FALSE,
    projected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (loop_id, signal_role)
);

COMMENT ON TABLE cpm.loop_signal_asset IS
    'Which UNS asset each loop-signal role was projected onto, and whether the '
    'projection created it (deletable on unmap) or only overrode it (clear-only).';
