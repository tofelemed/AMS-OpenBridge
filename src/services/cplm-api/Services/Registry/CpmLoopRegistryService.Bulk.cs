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

/// <summary>Bulk onboarding: chunked registry inserts, tag-map replacement, the engineering-range broadcast parameter (split from CpmLoopRegistryService, v2.5 2G.1; no behaviour change).</summary>
public sealed partial class CpmLoopRegistryService
{
    // ── Bulk onboarding ─────────────────────────────────────────────────────
    //
    // ActivateAsync is correct but N+1 by construction: per loop it opens a
    // transaction, runs two collision SELECTs (one of which reads the whole
    // registry), inserts row-by-row, then re-reads the loop to build a DTO. A
    // 200-row import was therefore 200 gateway mutations - past the gateway's
    // 120/minute window - plus ~400 collision queries.
    //
    // The batch path keeps every rule and every per-row outcome, but does the
    // lookups once, the writes set-at-a-time, and the whole import in ONE
    // request (so one mutation, and no rate-limit ceiling on batch size).

    /// <summary>Rows per multi-row INSERT. 12 bind params per registry row keeps
    /// 500 rows at 6 000 parameters, well under PostgreSQL's 65 535 limit.</summary>
    private const int InsertChunkSize = 500;

    public async Task<CpmBulkActivateResult> BulkActivateAsync(
        IReadOnlyList<CpmLoopActivateRequest> requests, CancellationToken ct)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        await EnsureSchemaAsync(ct);

        var outcomes = new Dictionary<string, CpmBulkActivateItem>(StringComparer.Ordinal);
        var accepted = new List<CpmLoopActivateRequest>(requests.Count);

        void Reject(string loopId, string code, string message) =>
            outcomes[loopId] = new CpmBulkActivateItem(loopId, false, message, code);

        // ── 1. Validate every row in memory (no DB, no network) ─────────────
        foreach (var request in requests)
        {
            var id = request.LoopId ?? "";
            if (outcomes.ContainsKey(id)) continue;
            try
            {
                Validate(request);
                accepted.Add(request);
            }
            catch (ArgumentException ex)
            {
                Reject(id, "REGISTRY_VALIDATION", ex.Message);
            }
        }

        // ── 1b. Location check (G-07): ONE asset-model round trip for the batch ──
        if (accepted.Count > 0)
        {
            var locationErrors = await ValidateLocationsAsync(accepted, ct);
            var locationChecked = new List<CpmLoopActivateRequest>(accepted.Count);
            foreach (var request in accepted)
            {
                var err = locationErrors.GetValueOrDefault(request.LoopId);
                if (err is not null && !request.AllowUnmodelledLocation)
                    Reject(request.LoopId, "LOCATION_NOT_IN_UNS", err +
                        " Set allowUnmodelledLocation (or tick the import override) to onboard anyway.");
                else
                    locationChecked.Add(request);
            }
            accepted = locationChecked;
        }

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // ── 2. ONE lookup of the existing registry, then collide in memory ──
        // (was two SELECTs per row, the second reading every loop id.)
        var existingIds = (await conn.QueryAsync<string>(
            "SELECT loop_id FROM cpm.loop_registry")).ToList();
        var byLowerId = new Dictionary<string, string>(StringComparer.Ordinal);
        var byHistorianNode = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var id in existingIds)
        {
            byLowerId[id.ToLowerInvariant()] = id;
            byHistorianNode.TryAdd(IotDbWriteClient.SafeNode(id), id);
        }

        var batch = new List<CpmLoopActivateRequest>(accepted.Count);
        foreach (var request in accepted)
        {
            var id = request.LoopId;
            // Same id in a different casing - reject exactly as the single path does.
            if (byLowerId.TryGetValue(id.ToLowerInvariant(), out var casing)
                && !string.Equals(casing, id, StringComparison.Ordinal))
            {
                Reject(id, "LOOP_ID_CASE_COLLISION",
                    $"Loop id '{id}' collides with existing loop '{casing}' " +
                    "(loop ids are case-insensitively unique; re-use the existing casing or retire it first)");
                continue;
            }
            // Punctuation-only twin - one historian device, merged trends. The map
            // also carries ids added earlier in THIS batch, so a file that
            // contains both twins fails the second one rather than both.
            var node = IotDbWriteClient.SafeNode(id);
            if (byHistorianNode.TryGetValue(node, out var clash)
                && !string.Equals(clash, id, StringComparison.Ordinal))
            {
                Reject(id, "LOOP_ID_HISTORIAN_COLLISION",
                    $"Loop id '{id}' collides with existing loop '{clash}' in the historian: " +
                    $"both sanitise to the device node '{node}', so their PV/SP/OP would be written to " +
                    "one series and silently merged. Choose an id that differs by more than punctuation.");
                continue;
            }
            byLowerId[id.ToLowerInvariant()] = id;
            byHistorianNode.TryAdd(node, id);
            batch.Add(request);
        }

        // ── 3. One transaction, chunked multi-row writes ────────────────────
        if (batch.Count > 0)
        {
            await using var tx = await conn.BeginTransactionAsync(ct);
            try
            {
                var written = new List<CpmLoopActivateRequest>(batch.Count);
                foreach (var chunk in Chunk(batch, InsertChunkSize))
                {
                    // SAVEPOINT so one bad chunk cannot lose the whole import:
                    // it falls back to row-by-row and only the offending rows fail.
                    await conn.ExecuteAsync("SAVEPOINT bulk_chunk", transaction: tx);
                    try
                    {
                        await InsertRegistryChunkAsync(conn, tx, chunk, ct);
                        await ReplaceTagMapChunkAsync(conn, tx, chunk, ct);
                        await conn.ExecuteAsync("RELEASE SAVEPOINT bulk_chunk", transaction: tx);
                        written.AddRange(chunk);
                    }
                    catch (Exception chunkEx)
                    {
                        _logger.LogWarning(chunkEx,
                            "Bulk chunk of {Count} loop(s) failed - retrying row by row", chunk.Count);
                        await conn.ExecuteAsync("ROLLBACK TO SAVEPOINT bulk_chunk", transaction: tx);
                        foreach (var one in chunk)
                        {
                            await conn.ExecuteAsync("SAVEPOINT bulk_row", transaction: tx);
                            try
                            {
                                await InsertRegistryChunkAsync(conn, tx, new[] { one }, ct);
                                await ReplaceTagMapChunkAsync(conn, tx, new[] { one }, ct);
                                await conn.ExecuteAsync("RELEASE SAVEPOINT bulk_row", transaction: tx);
                                written.Add(one);
                            }
                            catch (Exception rowEx)
                            {
                                await conn.ExecuteAsync("ROLLBACK TO SAVEPOINT bulk_row", transaction: tx);
                                Reject(one.LoopId, "REGISTRY_WRITE_FAILED", rowEx.Message);
                            }
                        }
                    }
                }
                await tx.CommitAsync(ct);
                batch = written;
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        }

        // ── 4. Post-commit projections (outside the write transaction) ──────
        // These run AFTER the commit, so a failure here must not be reported as
        // "nothing happened" — the loops are registered either way.
        string? warning = null;
        var loopIds = batch.Select(b => b.LoopId).ToList();
        if (loopIds.Count > 0)
        {
            // Edges first: evidence derives hasPeerLinks from cpm.loop_link.
            // Only loops that actually carry an asset can have edges, and the
            // request already says so — checking here avoids a connection and a
            // query per loop for the overwhelmingly common no-asset case.
            foreach (var request in batch.Where(r => r.AssetId is not null && r.AssetId != Guid.Empty))
            {
                try { await ProjectLinksAsync(request.LoopId, ct); }
                catch (Exception ex) { _logger.LogWarning(ex, "Link projection failed for {LoopId}", request.LoopId); }
            }
            try
            {
                await ProjectSignalAssetsBatchAsync(loopIds, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Batch signal projection failed for {Count} loop(s)", loopIds.Count);
                warning = "Loops were registered, but the signal-asset projection failed: " +
                          $"{ex.Message}. Their signals will not resolve through the UNS until the " +
                          "import is re-run.";
            }
            try { await PublishEvidenceBatchAsync(loopIds, ct); }
            catch (Exception ex) { _logger.LogWarning(ex, "Batch evidence publish failed"); }
        }

        foreach (var request in batch)
            outcomes[request.LoopId] = new CpmBulkActivateItem(request.LoopId, true);

        sw.Stop();
        // Preserve the caller's row order.
        var ordered = requests
            .Select(r => outcomes.TryGetValue(r.LoopId ?? "", out var o)
                ? o
                : new CpmBulkActivateItem(r.LoopId ?? "", false, "Not processed", "UNKNOWN"))
            .ToList();
        var activated = ordered.Count(o => o.Ok);
        _logger.LogInformation("Bulk activate: {Activated}/{Requested} in {Ms} ms",
            activated, requests.Count, sw.ElapsedMilliseconds);
        return new CpmBulkActivateResult(
            requests.Count, activated, ordered.Count - activated, sw.ElapsedMilliseconds, ordered, warning);
    }

    private static IEnumerable<IReadOnlyList<T>> Chunk<T>(IReadOnlyList<T> source, int size)
    {
        for (var i = 0; i < source.Count; i += size)
            yield return source.Skip(i).Take(size).ToList();
    }

    /// <summary>
    /// One INSERT … VALUES (…),(…),… for the whole chunk. Semantics match the
    /// single-row upsert, including the two merge rules: monitoring is merged so
    /// a re-activation cannot wipe accumulated evidence, and an omitted
    /// engineering range keeps the stored one (an omitted range arrives as '{}',
    /// which is why the DO UPDATE tests for it rather than using EXCLUDED).
    /// </summary>
    private static async Task InsertRegistryChunkAsync(
        NpgsqlConnection conn, NpgsqlTransaction tx, IReadOnlyList<CpmLoopActivateRequest> chunk, CancellationToken ct)
    {
        var values = new List<string>(chunk.Count);
        var p = new DynamicParameters();
        for (var i = 0; i < chunk.Count; i++)
        {
            var r = chunk[i];
            var tags = r.Tags ?? Array.Empty<CpmTagMapEntry>();
            p.Add($"l{i}", r.LoopId);
            p.Add($"a{i}", r.AssetId);
            p.Add($"d{i}", r.DisplayName);
            p.Add($"s{i}", r.Site);
            p.Add($"ar{i}", r.Area);
            p.Add($"u{i}", r.Unit);
            p.Add($"lt{i}", r.LoopType.ToUpperInvariant());
            p.Add($"c{i}", (r.Criticality ?? "medium").ToLowerInvariant());
            p.Add($"m{i}", JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["enabled"] = r.EnableMonitoring,
                ["cplmPipeline"] = "cplm-three-stage-system",
                ["evidence"] = new Dictionary<string, object>
                {
                    ["stepTestApproved"] = r.StepTestApproved,
                    ["peerLinksConfigured"] = false
                }
            }));
            p.Add($"t{i}", JsonSerializer.Serialize(
                tags.ToDictionary(t => t.SignalRole.ToLowerInvariant(), t => t.UnsPath)));
            p.Add($"e{i}", HasRange(r.Engineering)
                ? SerializeRange(r.Engineering!)
                : null);
            p.Add($"tp{i}", r.ThresholdProfileId);
            values.Add($"(@l{i}, @a{i}, @d{i}, @s{i}, @ar{i}, @u{i}, @lt{i}, @c{i}, TRUE, " +
                       $"@m{i}::jsonb, @t{i}::jsonb, COALESCE(@e{i}::jsonb, @emptyJson::jsonb), @tp{i}, NOW())");
        }
        // Bound rather than inlined: '{}' inside an interpolated raw string would
        // be read as an interpolation hole.
        p.Add("emptyJson", "{}");

        await conn.ExecuteAsync(new CommandDefinition($"""
            INSERT INTO cpm.loop_registry
                (loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
                 is_active, monitoring, tags, engineering, threshold_profile_id, updated_at)
            VALUES {string.Join(", ", values)}
            ON CONFLICT (loop_id) DO UPDATE SET
                asset_id = EXCLUDED.asset_id, display_name = EXCLUDED.display_name,
                site = EXCLUDED.site, area = EXCLUDED.area, unit = EXCLUDED.unit,
                loop_type = EXCLUDED.loop_type, criticality = EXCLUDED.criticality,
                is_active = TRUE, tags = EXCLUDED.tags,
                threshold_profile_id = EXCLUDED.threshold_profile_id,
                monitoring = cpm.loop_registry.monitoring || EXCLUDED.monitoring,
                engineering = CASE WHEN EXCLUDED.engineering = @emptyJson::jsonb
                                   THEN cpm.loop_registry.engineering ELSE EXCLUDED.engineering END,
                updated_at = NOW()
            """, p, tx, cancellationToken: ct));
    }

    /// <summary>Wholesale replace of the chunk's role mappings: one DELETE, one INSERT.</summary>
    private static async Task ReplaceTagMapChunkAsync(
        NpgsqlConnection conn, NpgsqlTransaction tx, IReadOnlyList<CpmLoopActivateRequest> chunk, CancellationToken ct)
    {
        var ids = chunk.Select(c => c.LoopId).ToArray();
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM cpm.loop_tag_map WHERE loop_id = ANY(@ids)", new { ids }, tx, cancellationToken: ct));

        var values = new List<string>();
        var p = new DynamicParameters();
        var n = 0;
        foreach (var r in chunk)
        {
            foreach (var tag in r.Tags ?? Array.Empty<CpmTagMapEntry>())
            {
                p.Add($"tl{n}", r.LoopId);
                p.Add($"tr{n}", tag.SignalRole.ToUpperInvariant());
                p.Add($"tp{n}", tag.UnsPath);
                p.Add($"ts{n}", tag.SourceSystem);
                p.Add($"tt{n}", tag.SourceTag);
                values.Add($"(@tl{n}, @tr{n}, @tp{n}, @ts{n}, @tt{n})");
                n++;
            }
        }
        if (values.Count == 0) return;

        await conn.ExecuteAsync(new CommandDefinition($"""
            INSERT INTO cpm.loop_tag_map (loop_id, signal_role, uns_path, source_system, source_tag)
            VALUES {string.Join(", ", values)}
            ON CONFLICT (loop_id, signal_role, uns_path) DO NOTHING
            """, p, tx, cancellationToken: ct));
    }

    /// <summary>
    /// The cplm.loop.engineering broadcast parameter, or null when the loop declares
    /// no range. Shared by the single- and batch-publish paths: they were two copies
    /// of the same literal, which is how one of them would have missed the PV range.
    ///
    /// The engine defaults are opEng 0-100 and pvEng 0-100, and it merges only the
    /// keys present — so a loop that declares an OP range but no PV range keeps the
    /// default PV band (0.5 EU), exactly as before.
    /// </summary>
    private static Dictionary<string, string>? EngineeringParameter(string? engineeringJson)
    {
        var engineering = ParseJson(engineeringJson);
        if (engineering.ValueKind != JsonValueKind.Object) return null;

        static double? Num(JsonElement root, string name) =>
            root.TryGetProperty(name, out var e) && e.ValueKind == JsonValueKind.Number
                ? e.GetDouble() : null;

        var opMin = Num(engineering, "opMin");
        var opMax = Num(engineering, "opMax");
        var pvMin = Num(engineering, "pvMin");
        var pvMax = Num(engineering, "pvMax");
        if (opMin is null && opMax is null && pvMin is null && pvMax is null) return null;

        var value = new Dictionary<string, double>();
        if (opMin is not null || opMax is not null)
        {
            value["opEngMin"] = opMin ?? 0.0;
            value["opEngMax"] = opMax ?? 100.0;
        }
        if (pvMin is not null || pvMax is not null)
        {
            value["pvEngMin"] = pvMin ?? 0.0;
            value["pvEngMax"] = pvMax ?? 100.0;
        }
        return new Dictionary<string, string>
        {
            ["name"] = "cplm.loop.engineering",
            ["value"] = JsonSerializer.Serialize(value),
        };
    }

    /// <summary>Reads the stored engineering JSON back into the request-shaped record.
    /// Null when nothing is declared, so "absent" survives the round trip as absent
    /// rather than becoming a zero the engine would treat as a real bound.</summary>
    /// <summary>Any declared bound makes the range worth storing.</summary>
    private static bool HasRange(CpmEngineeringRange? r) =>
        r is { OpMin: not null } or { OpMax: not null } or { PvMin: not null } or { PvMax: not null };

    /// <summary>Only the declared bounds are written, so an omitted one stays absent
    /// rather than being persisted as a zero the engine would treat as a real bound.</summary>
    private static string SerializeRange(CpmEngineeringRange r)
    {
        var range = new Dictionary<string, double>();
        if (r.OpMin is { } opMin) range["opMin"] = opMin;
        if (r.OpMax is { } opMax) range["opMax"] = opMax;
        if (r.PvMin is { } pvMin) range["pvMin"] = pvMin;
        if (r.PvMax is { } pvMax) range["pvMax"] = pvMax;
        return JsonSerializer.Serialize(range);
    }

    /// <summary>
    /// Characters that break a URL path segment (the loop id is one) or a shell
    /// argument. Everything else - dashes, dots, colons, parentheses - is a
    /// legitimate part of a plant tag and is allowed.
    /// </summary>
}
