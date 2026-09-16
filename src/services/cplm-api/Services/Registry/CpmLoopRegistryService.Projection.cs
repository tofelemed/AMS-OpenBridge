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

/// <summary>Asset-graph projection (loop links from asset relationships) and the release of projected assets on delete (split from CpmLoopRegistryService, v2.5 2G.1; no behaviour change).</summary>
public sealed partial class CpmLoopRegistryService
{
    // ── Asset-graph projection ──────────────────────────────────────────────

    /// <summary>
    /// Pulls this loop's asset relationships from asset-model and materialises the
    /// loop-level equivalents in cpm.loop_link.
    ///
    /// A projection is needed because the asset graph lives in traverse_assets while
    /// the registry lives in ams — separate databases, so no join and no FK. The
    /// projection is refreshed on activation and on demand; it is not a cache with a
    /// TTL, because a stale peer link changes a diagnosis.
    /// </summary>
    public async Task<int> ProjectLinksAsync(string loopId, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var assetId = await conn.QueryFirstOrDefaultAsync<Guid?>(
            "SELECT asset_id FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId });
        if (assetId is null || assetId == Guid.Empty)
        {
            _logger.LogDebug("Loop {LoopId} has no asset_id; nothing to project", loopId);
            return 0;
        }

        List<AssetRelationshipView>? edges;
        try
        {
            var http = _httpFactory.CreateClient("AssetModel");
            http.DefaultRequestHeaders.Remove("X-Service-Key");
            http.DefaultRequestHeaders.Add("X-Service-Key", _options.ServiceKey);
            edges = await http.GetFromJsonAsync<List<AssetRelationshipView>>(
                $"/assets/{assetId}/relationships?direction=both", ct);
        }
        catch (Exception ex)
        {
            // Do not fabricate links on failure. A missing link degrades G13 to
            // NOT_EVALUATED, which is the correct conservative answer; an invented
            // one produces a confident wrong diagnosis.
            _logger.LogWarning(ex, "Could not read asset relationships for loop {LoopId}", loopId);
            return 0;
        }
        if (edges is null || edges.Count == 0)
        {
            await conn.ExecuteAsync(
                "DELETE FROM cpm.loop_link WHERE from_loop_id = @loopId AND origin = 'asset-graph'",
                new { loopId });
            return 0;
        }

        // Map the far-end asset ids back to registered loops; assets that are not
        // loops (pumps, tanks) simply do not project.
        var farAssetIds = edges.Select(e => e.AssetId).Distinct().ToArray();
        var loopByAsset = (await conn.QueryAsync<(Guid AssetId, string LoopId)>("""
            SELECT asset_id, loop_id FROM cpm.loop_registry
            WHERE asset_id = ANY(@assetIds)
            """, new { assetIds = farAssetIds }))
            .ToDictionary(r => r.AssetId, r => r.LoopId);

        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            await conn.ExecuteAsync(
                "DELETE FROM cpm.loop_link WHERE from_loop_id = @loopId AND origin = 'asset-graph'",
                new { loopId }, tx);

            var projected = 0;
            foreach (var edge in edges)
            {
                if (!loopByAsset.TryGetValue(edge.AssetId, out var toLoopId)) continue;
                if (string.Equals(toLoopId, loopId, StringComparison.OrdinalIgnoreCase)) continue;
                // effectiveRelType is the relation as seen from THIS asset, so an
                // inbound UPSTREAM_OF row is stored here as DOWNSTREAM_OF.
                var relType = (edge.EffectiveRelType ?? edge.RelType).ToUpperInvariant();
                await conn.ExecuteAsync("""
                    INSERT INTO cpm.loop_link (from_loop_id, to_loop_id, rel_type, origin)
                    VALUES (@from, @to, @relType, 'asset-graph')
                    ON CONFLICT (from_loop_id, to_loop_id, rel_type) DO NOTHING
                    """, new { from = loopId, to = toLoopId, relType }, tx);
                projected++;
            }
            await tx.CommitAsync(ct);
            _logger.LogInformation("Projected {Count} asset edge(s) into loop links for {LoopId}", projected, loopId);
            return projected;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private sealed record AssetRelationshipView(Guid AssetId, string RelType, string? EffectiveRelType);
}
