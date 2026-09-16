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

/// <summary>Signal-asset projection: every mapped role becomes a trendable UNS asset with the historian / Sparkplug transport overrides (split from CpmLoopRegistryService, v2.5 2G.1; no behaviour change).</summary>
public sealed partial class CpmLoopRegistryService
{
    // ── Signal-asset projection (loops trendable through the UNS) ───────────
    //
    // Registers/updates a UNS asset for each mapped signal role, with transport
    // OVERRIDES pointing at where the loop pipeline actually writes: history at
    // root.<site>.cpm.<loopId>.<role> (RawLoopIotDbConsumer) and live under the
    // ams edge with device = sanitized loopId (LoopLiveRbeJob → edge node).
    // Without this, a loop tag resolved through binding-resolver "successfully"
    // to path-derived transports nothing writes — which is why loop PV/SP/OP
    // could not be trended on the Trend page (P2-10).

    /// <summary>
    /// The five measurements RawLoopIotDbConsumer actually stores per loop.
    /// Roles outside this set (STATUS, QUALITY, UPSTREAM, UTILITY) are
    /// deliberately not projected: their data never lands at the loop historian
    /// device, and an override pointing there would recreate the exact
    /// resolved-but-empty binding this projection exists to eliminate.
    /// </summary>
    private static readonly string[] StoredSignalRoles = { "PV", "SP", "OP", "VP", "MODE" };

    /// <summary>
    /// Sparkplug device id for a loop — the edge node's sanitizer
    /// (AlarmMetricPublisher.processLoopMetricRecord): keeps [A-Za-z0-9_-], maps
    /// the rest to '_'. NOTE: this is NOT IotDbWriteClient.SafeNode (which also
    /// replaces '-' and prefixes a leading digit) — the two planes sanitize
    /// differently and each override must use its own plane's rule.
    /// </summary>
    private static string SparkplugDeviceOf(string loopId) =>
        System.Text.RegularExpressions.Regex.Replace(loopId, "[^a-zA-Z0-9_-]", "_");

    /// <summary>
    /// Projects the signal assets for a whole batch. The per-loop path costs up
    /// to ten asset-model round trips (a by-path GET plus a POST/PUT for each of
    /// PV/SP/OP/VP/MODE); this resolves every path in one call and writes every
    /// asset in one call, so a 200-loop import is a handful of requests instead
    /// of two thousand.
    /// </summary>
    public async Task<int> ProjectSignalAssetsBatchAsync(IReadOnlyList<string> loopIds, CancellationToken ct)
    {
        if (loopIds.Count == 0) return 0;
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var ids = loopIds.ToArray();

        // One query for every mapped role across the batch (was one per loop).
        // loop_tag_map's PK is (loop_id, signal_role, uns_path), so a role CAN
        // carry several paths — but the projection (and its ledger, keyed
        // (loop_id, signal_role)) is one asset per role. Take the first path per
        // role, like the old single-loop code did; without this, two rows for one
        // role make the multi-row ledger upsert hit the same key twice and
        // Postgres rejects the whole statement ("ON CONFLICT DO UPDATE command
        // cannot affect row a second time").
        var mapped = (await conn.QueryAsync<(string LoopId, string SignalRole, string UnsPath)>("""
                SELECT loop_id, signal_role, uns_path FROM cpm.loop_tag_map
                WHERE loop_id = ANY(@ids) AND is_active
                ORDER BY loop_id, signal_role, uns_path
                """, new { ids }))
            .Where(t => StoredSignalRoles.Contains(t.SignalRole.ToUpperInvariant()))
            .GroupBy(t => (t.LoopId, Role: t.SignalRole.ToUpperInvariant()))
            .Select(g => g.First())
            .ToList();

        var ledger = (await conn.QueryAsync<(string LoopId, string SignalRole, string ContextualPath, Guid AssetId, bool CreatedByProjection)>("""
                SELECT loop_id, signal_role, contextual_path, asset_id, created_by_projection
                FROM cpm.loop_signal_asset WHERE loop_id = ANY(@ids)
                """, new { ids }))
            .ToDictionary(r => (r.LoopId, r.SignalRole), r => r);
        if (mapped.Count == 0 && ledger.Count == 0) return 0;

        var http = _httpFactory.CreateClient("AssetModel");
        http.DefaultRequestHeaders.Remove("X-Service-Key");
        http.DefaultRequestHeaders.Add("X-Service-Key", _options.ServiceKey);

        // ── loop device candidates (P5.2 — ISA-88: a loop is a Control Module) ──
        // When a loop's mapped signal paths share one prefix (site/[area/]unit/
        // <looptag>), that prefix is the loop's Device node. Ensuring it exists —
        // and parenting the signal Measurements under it — is what makes loop
        // signals visible in the plant tree instead of parentless (G-12).
        var mappedByLoop = mapped
            .GroupBy(m => m.LoopId, StringComparer.Ordinal)
            .ToDictionary(g => g.Key,
                g => g.Select(x => (Role: x.SignalRole.ToUpperInvariant(), x.UnsPath)).ToList(),
                StringComparer.Ordinal);
        var devicePathByLoop = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (lid, list) in mappedByLoop)
        {
            var prefixes = list.Select(x => DevicePathOf(x.UnsPath)).Distinct(StringComparer.Ordinal).ToList();
            if (prefixes.Count == 1 && prefixes[0] is { } devicePath)
                devicePathByLoop[lid] = devicePath;
        }

        // ── retire moved/stale projections BEFORE writing the new state ─────
        // A role that moved to a different path, or is no longer mapped, must not
        // linger pointing at the loop pipeline. (DEVICE rows are ledger-only
        // bookkeeping for the node above; they are released at loop retirement.)
        foreach (var entry in ledger.Values.ToList())
        {
            if (string.Equals(entry.SignalRole, "DEVICE", StringComparison.OrdinalIgnoreCase)) continue;
            var current = mappedByLoop.TryGetValue(entry.LoopId, out var list)
                ? list.FirstOrDefault(x => x.Role == entry.SignalRole.ToUpperInvariant())
                : default;
            if (current.Role is not null && string.Equals(current.UnsPath, entry.ContextualPath, StringComparison.Ordinal))
                continue;
            try
            {
                await RetireProjectionAsync(http, conn, entry.LoopId,
                    new LedgerRow(entry.SignalRole, entry.ContextualPath, entry.AssetId, entry.CreatedByProjection), ct);
                ledger.Remove((entry.LoopId, entry.SignalRole));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Could not retire stale signal-asset projection for loop {LoopId} role {Role}",
                    entry.LoopId, entry.SignalRole);
            }
        }
        if (mapped.Count == 0) return 0;

        // ── resolve every path in ONE call (signals + device prefixes + units) ──
        var devicePaths = devicePathByLoop.Values.Distinct(StringComparer.Ordinal).ToArray();
        var unitPaths = devicePaths
            .Where(p => p.Contains('/'))
            .Select(p => p[..p.LastIndexOf('/')])
            .Distinct(StringComparer.Ordinal);
        var paths = mapped.Select(m => m.UnsPath)
            .Concat(devicePaths).Concat(unitPaths)
            .Distinct(StringComparer.Ordinal).ToArray();
        var existingByPath = await ResolvePathsAsync(http, paths, ct);

        // ── classify into creates and override-updates ──────────────────────
        var creates = new List<object>();
        var ledgerRows = new List<(string LoopId, string Role, string Path, Guid AssetId, bool Created)>();
        var pendingCreates = new List<(string LoopId, string Role, string Path)>();
        var updateSpecs = new List<(Guid AssetId, string LoopId, string Role, string UnsPath, bool WasOurs)>();

        foreach (var (loopId, roleRaw, unsPath) in mapped)
        {
            var role = roleRaw.ToUpperInvariant();
            var measurement = role.ToLowerInvariant();
            var device = SparkplugDeviceOf(loopId);
            var iotdbDevice = $"{_iotdb.LoopRootPrefix}.{IotDbWriteClient.SafeNode(loopId)}";

            if (existingByPath.TryGetValue(unsPath, out var hit))
            {
                // Pre-existing asset: only the transport overrides (and, when we
                // created it in an earlier projection, its parent) are ours.
                var wasOurs = ledger.TryGetValue((loopId, role), out var l)
                              && l.AssetId == hit.Id && l.CreatedByProjection;
                updateSpecs.Add((hit.Id, loopId, role, unsPath, wasOurs));
                ledgerRows.Add((loopId, role, unsPath, hit.Id, wasOurs));
            }
            else
            {
                creates.Add(new
                {
                    contextualPath = unsPath,
                    name = $"{loopId} {role}",
                    type = 5, // Measurement
                    description = $"CPLM loop-signal projection for {loopId} ({role}). " +
                                  "Managed by cplm-api; transport overrides point at the loop pipeline.",
                    template = "CpmLoopSignal",
                    // asset-model derives the parent from the path prefix — the
                    // loop Device created in this same batch, when there is one.
                    parentId = (Guid?)null,
                    ioTDbPathOverride = $"{iotdbDevice}.{measurement}",
                    sparkplugGroupOverride = _options.SparkplugGroup,
                    sparkplugEdgeNodeOverride = _options.SparkplugEdge,
                    sparkplugDeviceOverride = device,
                    sparkplugMetricOverride = measurement,
                });
                pendingCreates.Add((loopId, role, unsPath));
            }
        }

        // ── ensure the loop Device node (P5.2) ──────────────────────────────
        var deviceIdByLoop = new Dictionary<string, Guid>(StringComparer.Ordinal);
        var pendingDeviceCreates = new List<(string LoopId, string Path)>();
        foreach (var (lid, devicePath) in devicePathByLoop)
        {
            if (existingByPath.TryGetValue(devicePath, out var dev))
            {
                // Exists already (Route A: the tag was modelled first). Use it as
                // the parent, never rewrite it — it belongs to whoever made it.
                if (dev.Type < 5) deviceIdByLoop[lid] = dev.Id;
                continue;
            }
            // asset-model's grammar for a Device: 3–5 slash segments, dot-free
            // last segment. Dotted loop tags (TIC.101) and 2-segment prefixes
            // cannot be device nodes — those signals stay parentless, as before.
            var segs = devicePath.Split('/');
            if (segs.Length is < 3 or > 5 || segs[^1].Contains('.')) continue;
            var unitPath = devicePath[..devicePath.LastIndexOf('/')];
            if (!existingByPath.TryGetValue(unitPath, out var unitNode) || unitNode.Type >= 4) continue;

            creates.Add(new
            {
                contextualPath = devicePath,
                name = lid,
                type = 4, // Device — the loop itself (ISA-88 control module)
                description = $"Control loop {lid} (CPLM projection). Parents the loop's PV/SP/OP/VP/MODE signal assets.",
                template = "CpmLoop",
                parentId = (Guid?)null, // derived from the path prefix (the unit)
            });
            pendingDeviceCreates.Add((lid, devicePath));
        }

        // ── write: creates first, then updates (which may re-parent onto a
        //    device created just above, so they need its id) ─────────────────
        var createdIds = await BulkUpsertAssetsAsync(http, creates, Array.Empty<object>(), ct);
        foreach (var (loopId, role, path) in pendingCreates)
        {
            if (createdIds.TryGetValue(path, out var newId))
                ledgerRows.Add((loopId, role, path, newId, true));
        }
        foreach (var (lid, devicePath) in pendingDeviceCreates)
        {
            if (createdIds.TryGetValue(devicePath, out var newId))
            {
                deviceIdByLoop[lid] = newId;
                ledgerRows.Add((lid, "DEVICE", devicePath, newId, true));
            }
        }

        var updates = new List<object>();
        foreach (var (assetId, loopId, role, unsPath, wasOurs) in updateSpecs)
        {
            var measurement = role.ToLowerInvariant();
            var iotdbDevice = $"{_iotdb.LoopRootPrefix}.{IotDbWriteClient.SafeNode(loopId)}";
            // Re-parent only assets THIS projection created (orphans from before
            // the device node existed); a user's own asset keeps its parent.
            Guid? parent = wasOurs
                           && deviceIdByLoop.TryGetValue(loopId, out var did)
                           && devicePathByLoop.TryGetValue(loopId, out var dpath)
                           && string.Equals(DevicePathOf(unsPath), dpath, StringComparison.Ordinal)
                ? did : null;
            updates.Add(new
            {
                id = assetId,
                ioTDbPathOverride = $"{iotdbDevice}.{measurement}",
                sparkplugGroupOverride = _options.SparkplugGroup,
                sparkplugEdgeNodeOverride = _options.SparkplugEdge,
                sparkplugDeviceOverride = SparkplugDeviceOf(loopId),
                sparkplugMetricOverride = measurement,
                parentId = parent,
            });
        }
        await BulkUpsertAssetsAsync(http, Array.Empty<object>(), updates, ct);

        // ── one multi-row upsert of the projection ledger ───────────────────
        if (ledgerRows.Count > 0)
        {
            foreach (var chunk in Chunk(ledgerRows, InsertChunkSize))
            {
                var values = new List<string>(chunk.Count);
                var p = new DynamicParameters();
                for (var i = 0; i < chunk.Count; i++)
                {
                    p.Add($"sl{i}", chunk[i].LoopId);
                    p.Add($"sr{i}", chunk[i].Role);
                    p.Add($"sp{i}", chunk[i].Path);
                    p.Add($"sa{i}", chunk[i].AssetId);
                    p.Add($"sc{i}", chunk[i].Created);
                    values.Add($"(@sl{i}, @sr{i}, @sp{i}, @sa{i}, @sc{i}, NOW())");
                }
                await conn.ExecuteAsync(new CommandDefinition($"""
                    INSERT INTO cpm.loop_signal_asset
                        (loop_id, signal_role, contextual_path, asset_id, created_by_projection, projected_at)
                    VALUES {string.Join(", ", values)}
                    ON CONFLICT (loop_id, signal_role) DO UPDATE SET
                        contextual_path = EXCLUDED.contextual_path,
                        asset_id = EXCLUDED.asset_id,
                        created_by_projection = EXCLUDED.created_by_projection,
                        projected_at = NOW()
                    """, p, cancellationToken: ct));
            }
        }

        _logger.LogInformation(
            "Batch signal projection: {Loops} loop(s), {Signals} signal(s), {Created} created, {Updated} updated",
            loopIds.Count, mapped.Count, pendingCreates.Count, updates.Count);
        return ledgerRows.Count;
    }
}
