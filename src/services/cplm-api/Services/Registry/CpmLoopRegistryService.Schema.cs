// Extraction Phase 3 COPY of AMS.Api Services/CpmLoopRegistryService.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Text.Json;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

/// <summary>Self-healing DDL for the registry tables (split from CpmLoopRegistryService, v2.5 2G.1; no behaviour change).</summary>
public sealed partial class CpmLoopRegistryService
{
    // ── Schema ──────────────────────────────────────────────────────────────

    private async Task EnsureSchemaAsync(CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _schemaEnsured, 1, 0) != 0) return;
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            // Byte-for-byte the same objects as database/scripts/32_cpm_loop_registry.sql.
            // CPA's self-healing block omitted columns its own migration added, so a
            // self-healed database threw on the detail query.
            await conn.ExecuteAsync("""
                CREATE SCHEMA IF NOT EXISTS cpm;
                CREATE TABLE IF NOT EXISTS cpm.loop_registry (
                    loop_id VARCHAR(64) PRIMARY KEY,
                    asset_id UUID,
                    display_name VARCHAR(255) NOT NULL,
                    site VARCHAR(64) NOT NULL,
                    area VARCHAR(64),
                    unit VARCHAR(64),
                    loop_type VARCHAR(32) NOT NULL,
                    criticality VARCHAR(16) NOT NULL DEFAULT 'medium',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    monitoring JSONB NOT NULL DEFAULT '{"enabled": false}'::jsonb,
                    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
                    engineering JSONB NOT NULL DEFAULT '{}'::jsonb,
                    threshold_profile_id VARCHAR(64),
                    timezone VARCHAR(64) DEFAULT 'UTC',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
                -- v2.5 (2G.1): the loop model dimensions + acquisition contract (database/scripts/57); additive so an
                -- existing lab volume gains them too. CHECK lists live in the script; the insert path validates in C#.
                ALTER TABLE cpm.loop_registry
                    ADD COLUMN IF NOT EXISTS service_family VARCHAR(40),
                    ADD COLUMN IF NOT EXISTS dynamic_class VARCHAR(24),
                    ADD COLUMN IF NOT EXISTS objective_type VARCHAR(16) NOT NULL DEFAULT 'UNSET',
                    ADD COLUMN IF NOT EXISTS topology VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
                    ADD COLUMN IF NOT EXISTS command_path VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
                    ADD COLUMN IF NOT EXISTS acquisition JSONB NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS classification_source VARCHAR(24) NOT NULL DEFAULT 'PRESET_FROM_LOOP_TYPE';
                CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_asset ON cpm.loop_registry (asset_id);
                CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_site ON cpm.loop_registry (site);
                -- P3-9: analytics reads join on lower(loop_id); enforce one casing per loop.
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cpm_loop_registry_loop_ci ON cpm.loop_registry (lower(loop_id));
                CREATE TABLE IF NOT EXISTS cpm.loop_tag_map (
                    loop_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
                    signal_role VARCHAR(16) NOT NULL,
                    uns_path VARCHAR(512) NOT NULL,
                    source_system VARCHAR(32),
                    source_tag VARCHAR(128),
                    unit_conversion JSONB,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (loop_id, signal_role, uns_path));
                CREATE INDEX IF NOT EXISTS idx_cpm_loop_tag_map_loop ON cpm.loop_tag_map (loop_id);
                CREATE TABLE IF NOT EXISTS cpm.loop_link (
                    from_loop_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
                    to_loop_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
                    rel_type VARCHAR(24) NOT NULL,
                    origin VARCHAR(16) NOT NULL DEFAULT 'asset-graph',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (from_loop_id, to_loop_id, rel_type));
                CREATE INDEX IF NOT EXISTS idx_cpm_loop_link_from ON cpm.loop_link (from_loop_id);
                CREATE INDEX IF NOT EXISTS idx_cpm_loop_link_to ON cpm.loop_link (to_loop_id);
                CREATE TABLE IF NOT EXISTS cpm.loop_tag_catalog (
                    site VARCHAR(64) NOT NULL,
                    area VARCHAR(64) NOT NULL DEFAULT '',
                    unit VARCHAR(64) NOT NULL DEFAULT '',
                    source_system VARCHAR(32) NOT NULL DEFAULT 'uns',
                    raw_tag_name VARCHAR(256) NOT NULL,
                    uns_path VARCHAR(512),
                    data_type VARCHAR(16) DEFAULT 'float',
                    engineering_unit VARCHAR(32),
                    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (site, area, unit, source_system, raw_tag_name));
                -- Ledger of the UNS assets this service projected for loop signals
                -- (44_cpm_signal_asset_ledger.sql). Reconciliation needs to know
                -- exactly what WE touched: assets we created may be deleted when a
                -- role is unmapped; pre-existing assets we only overrode must have
                -- their overrides cleared, never be deleted.
                CREATE TABLE IF NOT EXISTS cpm.loop_signal_asset (
                    loop_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
                    signal_role VARCHAR(16) NOT NULL,
                    contextual_path VARCHAR(512) NOT NULL,
                    asset_id UUID NOT NULL,
                    created_by_projection BOOLEAN NOT NULL DEFAULT FALSE,
                    projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (loop_id, signal_role));
                """);
            _logger.LogInformation("CPM loop registry schema ensured");
        }
        catch
        {
            Interlocked.Exchange(ref _schemaEnsured, 0); // allow a retry on the next call
            throw;
        }
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }
}
