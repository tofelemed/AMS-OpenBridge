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

/// <summary>Asset-model lookups behind the signal-asset projection: path resolution, location validation, bulk upsert, retirement of projected assets (split from CpmLoopRegistryService, v2.5 2G.1; no behaviour change).</summary>
public sealed partial class CpmLoopRegistryService
{
    /// <summary>
    /// asset-model bounds both bulk endpoints (2 000 paths / 5 000 assets), so a
    /// large batch is split here. Still a handful of requests for thousands of
    /// signals, versus two per signal before.
    /// </summary>
    private const int AssetLookupChunk = 1000;
    private const int AssetWriteChunk = 1000;

    /// <summary>Resolve many contextual paths to asset id+type, chunked.</summary>
    private async Task<Dictionary<string, AssetPathView>> ResolvePathsAsync(
        HttpClient http, string[] paths, CancellationToken ct)
    {
        var found = new Dictionary<string, AssetPathView>(StringComparer.Ordinal);
        foreach (var chunk in Chunk(paths, AssetLookupChunk))
        {
            var res = await http.PostAsJsonAsync("/assets/by-paths", new { paths = chunk }, ct);
            res.EnsureSuccessStatusCode();
            var hits = await res.Content.ReadFromJsonAsync<List<AssetPathView>>(cancellationToken: ct);
            foreach (var hit in hits ?? new List<AssetPathView>())
                found[hit.ContextualPath] = hit;
        }
        return found;
    }

    /// <summary>
    /// The device prefix of a signal path — the path with its '.role' suffix
    /// removed (LAST dot: loop tags may themselves contain dots, TIC.101).
    /// Null when the last segment carries no dot at all.
    /// </summary>
    private static string? DevicePathOf(string unsPath)
    {
        var lastSlash = unsPath.LastIndexOf('/');
        var lastDot = unsPath.LastIndexOf('.');
        return lastDot > lastSlash && lastDot > 0 ? unsPath[..lastDot] : null;
    }

    /// <summary>
    /// G-07 — verifies each request's site/area/unit chain exists in the asset
    /// model with the right node types (site→Site, area→Area, unit→Unit; the
    /// values are path SEGMENTS, e.g. 'hdpe', 'section_100'). Returns
    /// loopId → error message (null = location is modelled). When asset-model
    /// does not answer, every row gets a "could not verify" error —
    /// AllowUnmodelledLocation is the explicit override for both cases, so
    /// onboarding never hard-depends on asset-model being up.
    /// </summary>
    private async Task<Dictionary<string, string?>> ValidateLocationsAsync(
        IReadOnlyList<CpmLoopActivateRequest> requests, CancellationToken ct)
    {
        var result = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var r in requests) result[r.LoopId] = null;
        if (requests.Count == 0) return result;

        var wanted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var r in requests)
        {
            var site = r.Site?.Trim();
            if (string.IsNullOrEmpty(site)) continue;
            var area = r.Area?.Trim();
            var unit = r.Unit?.Trim();
            wanted.Add(site);
            if (!string.IsNullOrEmpty(area)) wanted.Add($"{site}/{area}");
            if (!string.IsNullOrEmpty(unit))
                wanted.Add(string.IsNullOrEmpty(area) ? $"{site}/{unit}" : $"{site}/{area}/{unit}");
        }
        if (wanted.Count == 0) return result;

        Dictionary<string, AssetPathView> found;
        try
        {
            var http = _httpFactory.CreateClient("AssetModel");
            http.DefaultRequestHeaders.Remove("X-Service-Key");
            http.DefaultRequestHeaders.Add("X-Service-Key", _options.ServiceKey);
            found = await ResolvePathsAsync(http, wanted.ToArray(), ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not verify loop locations against asset-model");
            foreach (var r in requests)
                result[r.LoopId] = "The location could not be verified against the asset model (asset-model did not answer).";
            return result;
        }

        foreach (var r in requests)
        {
            var site = r.Site?.Trim();
            if (string.IsNullOrEmpty(site)) continue;
            var area = r.Area?.Trim();
            var unit = r.Unit?.Trim();

            string? err = null;
            if (!found.TryGetValue(site, out var siteNode))
                err = $"Site '{site}' is not in the asset model.";
            else if (siteNode.Type != 1)
                err = $"'{site}' exists in the asset model but is not a Site.";
            else if (!string.IsNullOrEmpty(area))
            {
                if (!found.TryGetValue($"{site}/{area}", out var areaNode))
                    err = $"Area '{area}' is not in the asset model under site '{site}'.";
                else if (areaNode.Type != 2)
                    err = $"'{site}/{area}' exists in the asset model but is not an Area.";
            }
            if (err is null && !string.IsNullOrEmpty(unit))
            {
                var unitPath = string.IsNullOrEmpty(area) ? $"{site}/{unit}" : $"{site}/{area}/{unit}";
                if (!found.TryGetValue(unitPath, out var unitNode))
                    err = $"Unit '{unit}' is not in the asset model at '{unitPath}'.";
                else if (unitNode.Type != 3)
                    err = $"'{unitPath}' exists in the asset model but is not a Unit.";
            }
            result[r.LoopId] = err;
        }
        return result;
    }

    /// <summary>
    /// Cross-database delete guard for asset-model (G-02): how many registered
    /// loops still reference the asset at <paramref name="path"/>. Hierarchy
    /// nodes match the registry's denormalised site/area/unit segments; every
    /// node also matches loops whose mapped tag paths sit at or under it.
    /// </summary>
    public async Task<int> CountReferencingLoopsAsync(string path, int assetType, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var segments = path.Split('/');

        var registryPredicate = (assetType, segments.Length) switch
        {
            (1, 1) => "r.site = @s1",
            (2, 2) => "r.site = @s1 AND r.area = @s2",
            (3, 2) => "r.site = @s1 AND COALESCE(r.area, '') = '' AND r.unit = @s2",
            (3, 3) => "r.site = @s1 AND r.area = @s2 AND r.unit = @s3",
            _ => "FALSE"
        };

        return await conn.ExecuteScalarAsync<int>($"""
            SELECT COUNT(DISTINCT r.loop_id)
            FROM cpm.loop_registry r
            LEFT JOIN cpm.loop_tag_map t ON t.loop_id = r.loop_id AND t.is_active
            WHERE ({registryPredicate})
               OR t.uns_path = @p OR t.uns_path LIKE @slash OR t.uns_path LIKE @dot
            """,
            new
            {
                s1 = segments.Length > 0 ? segments[0] : "",
                s2 = segments.Length > 1 ? segments[1] : "",
                s3 = segments.Length > 2 ? segments[2] : "",
                p = path,
                slash = path + "/%",
                dot = path + ".%"
            });
    }

    /// <summary>Create/patch many assets, chunked; returns created path → id.</summary>
    private async Task<Dictionary<string, Guid>> BulkUpsertAssetsAsync(
        HttpClient http, IReadOnlyList<object> creates, IReadOnlyList<object> updates, CancellationToken ct)
    {
        var created = new Dictionary<string, Guid>(StringComparer.Ordinal);

        async Task SendAsync(IReadOnlyList<object> c, IReadOnlyList<object> u)
        {
            if (c.Count == 0 && u.Count == 0) return;
            var res = await http.PostAsJsonAsync("/assets/bulk", new { creates = c, updates = u }, ct);
            res.EnsureSuccessStatusCode();
            var body = await res.Content.ReadFromJsonAsync<BulkAssetResponse>(cancellationToken: ct);
            foreach (var hit in body?.Created ?? new List<AssetPathView>())
                created[hit.ContextualPath] = hit.Id;
        }

        foreach (var chunk in Chunk(creates, AssetWriteChunk)) await SendAsync(chunk, Array.Empty<object>());
        foreach (var chunk in Chunk(updates, AssetWriteChunk)) await SendAsync(Array.Empty<object>(), chunk);
        return created;
    }

    private sealed record AssetPathView(Guid Id, string ContextualPath, int Type);
    private sealed record BulkAssetResponse(List<AssetPathView> Created, int Updated);

    /// <summary>Single-loop projection — the batch path with one id, so device
    /// creation, re-parenting and stale-role retirement behave identically on
    /// activate, republish-evidence and bulk import.</summary>
    public Task<int> ProjectSignalAssetsAsync(string loopId, CancellationToken ct)
        => ProjectSignalAssetsBatchAsync(new[] { loopId }, ct);

    /// <summary>
    /// Undo one projection. Assets WE created are soft-deleted; assets that
    /// pre-existed only get their overrides cleared ("" = clear) — deleting a
    /// user's asset because a loop stopped referencing it would be destruction
    /// of someone else's configuration.
    /// </summary>
    private async Task RetireProjectionAsync(
        HttpClient http, NpgsqlConnection conn, string loopId, LedgerRow row, CancellationToken ct)
    {
        if (row.CreatedByProjection)
        {
            var del = await http.DeleteAsync($"/assets/{row.AssetId}", ct);
            if (!del.IsSuccessStatusCode && del.StatusCode != System.Net.HttpStatusCode.NotFound)
                del.EnsureSuccessStatusCode();
        }
        else
        {
            var put = await http.PutAsJsonAsync($"/assets/{row.AssetId}", new
            {
                ioTDbPathOverride = "",
                sparkplugGroupOverride = "",
                sparkplugEdgeNodeOverride = "",
                sparkplugDeviceOverride = "",
                sparkplugMetricOverride = ""
            }, ct);
            if (put.StatusCode != System.Net.HttpStatusCode.NotFound)
                put.EnsureSuccessStatusCode();
        }
        await conn.ExecuteAsync(
            "DELETE FROM cpm.loop_signal_asset WHERE loop_id = @loopId AND signal_role = @role",
            new { loopId, role = row.SignalRole });
    }

    private sealed record LedgerRow(string SignalRole, string ContextualPath, Guid AssetId, bool CreatedByProjection);
}
