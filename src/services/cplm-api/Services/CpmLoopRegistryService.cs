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

public sealed partial class CpmLoopRegistryService : ICpmLoopRegistryService
{
    /// <summary>
    /// Roles required to activate a loop. PV/SP/OP are the minimum the gate
    /// engine needs; MODE gates G1 (auto/manual), without which every window is
    /// EXCLUDED_MODE. VP stays optional — its absence caps confidence at 0.89
    /// (G14), which is a documented degradation, not a blocker.
    /// </summary>
    public static readonly string[] RequiredRoles = { "PV", "SP", "OP", "MODE" };
    public static readonly string[] OptionalRoles = { "VP", "STATUS", "QUALITY", "UPSTREAM", "UTILITY" };

    /// <summary>Lowercase to match the loop_registry CHECK constraint exactly.</summary>
    private static readonly string[] ValidCriticalities = { "low", "medium", "high", "critical" };

    private static readonly string[] ValidLoopTypes =
        { "FIC", "PIC", "PIC_GAS", "PIC_VAPOUR", "LIC", "TIC", "UNKNOWN" };

    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<CpmLoopRegistryService> _logger;
    private readonly CpmRegistryOptions _options;
    private readonly IHttpClientFactory _httpFactory;
    // Source of LoopRootPrefix + SafeNode — the historian device convention the
    // signal-asset projection must mirror exactly (P1-5).
    private readonly IotDbWriteClient _iotdb;
    private readonly IProducer<string, string> _producer;
    private static int _schemaEnsured;

    public CpmLoopRegistryService(
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource,
        IOptions<CpmRegistryOptions> options,
        IHttpClientFactory httpFactory,
        IotDbWriteClient iotdb,
        ILogger<CpmLoopRegistryService> logger)
    {
        _dataSource = dataSource;
        _options = options.Value;
        _httpFactory = httpFactory;
        _iotdb = iotdb;
        _logger = logger;
        _producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            Acks = Acks.All,
            EnableIdempotence = true
        }).Build();
    }

    // ── Read ────────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<CpmLoopDto>> GetAllAsync(CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        // CHG-023: three queries for the whole list instead of 1 + 2 per loop (CpmLoopRegistryReads).
        return await CpmLoopRegistryReads.LoadAllAsync(conn);
    }

    public async Task<CpmLoopDto?> GetAsync(string loopId, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        return await CpmLoopRegistryReads.LoadOneAsync(conn, loopId);
    }

    // ── Onboarding ──────────────────────────────────────────────────────────

    public async Task<CpmLoopDto> ActivateAsync(CpmLoopActivateRequest request, CancellationToken ct)
    {
        Validate(request);
        await EnsureSchemaAsync(ct);

        // G-07: the location becomes the loop's signal paths, so an unmodelled
        // site/area/unit is refused unless the caller explicitly opts out.
        var locationError = (await ValidateLocationsAsync(new[] { request }, ct))
            .GetValueOrDefault(request.LoopId);
        if (locationError is not null && !request.AllowUnmodelledLocation)
            throw new LoopLocationException(locationError +
                " Pass allowUnmodelledLocation=true to onboard anyway — the loop's signals will sit " +
                "outside the plant tree until the location is modelled in the asset model.");

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            // P3-9 - analytics reads are lower(loop_id) while storage keys are
            // case-sensitive: "fic-101" and "FIC-101" would be two registry rows
            // and two IoTDB devices silently merged into one analytics answer.
            // One canonical casing per loop; re-activating the existing casing
            // still upserts as before.
            var existingCasing = await conn.QueryFirstOrDefaultAsync<string>(
                "SELECT loop_id FROM cpm.loop_registry WHERE lower(loop_id) = lower(@loopId) AND loop_id <> @loopId",
                new { loopId = request.LoopId }, tx);
            if (existingCasing != null)
            {
                throw new LoopIdCollisionException("LOOP_ID_CASE_COLLISION",
                    $"Loop id '{request.LoopId}' collides with existing loop '{existingCasing}' " +
                    "(loop ids are case-insensitively unique; re-use the existing casing or retire it first)");
            }

            // P1-5: the historian device is prefix + SafeNode(loopId), which maps
            // every non-alphanumeric to '_'. Two loops whose ids differ only in
            // punctuation ("45FIC-109" vs "45FIC.109") would therefore write to the
            // SAME IoTDB device and merge their PV/SP/OP, last write wins. Dashes
            // and dots are legal in a tag, so the check is on the sanitised node
            // rather than on the character set.
            var historianNode = IotDbWriteClient.SafeNode(request.LoopId);
            var nodeClash = (await conn.QueryAsync<string>(
                    "SELECT loop_id FROM cpm.loop_registry WHERE loop_id <> @loopId",
                    new { loopId = request.LoopId }, tx))
                .FirstOrDefault(id => string.Equals(
                    IotDbWriteClient.SafeNode(id), historianNode, StringComparison.Ordinal));
            if (nodeClash != null)
            {
                throw new LoopIdCollisionException("LOOP_ID_HISTORIAN_COLLISION",
                    $"Loop id '{request.LoopId}' collides with existing loop '{nodeClash}' in the historian: " +
                    $"both sanitise to the device node '{historianNode}', so their PV/SP/OP would be written to " +
                    "one series and silently merged. Choose an id that differs by more than punctuation.");
            }

            var tags = request.Tags ?? Array.Empty<CpmTagMapEntry>();
            // tags JSONB mirrors every mapped role, VP included — CPA's version
            // hard-coded pv/sp/op/mode and silently dropped vp.
            var tagsJson = JsonSerializer.Serialize(
                tags.ToDictionary(t => t.SignalRole.ToLowerInvariant(), t => t.UnsPath));
            var monitoringJson = JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["enabled"] = request.EnableMonitoring,
                ["cplmPipeline"] = "cplm-three-stage-system",
                ["evidence"] = new Dictionary<string, object>
                {
                    ["stepTestApproved"] = request.StepTestApproved,
                    // Derived from real edges at publish time, never hand-set.
                    ["peerLinksConfigured"] = false
                }
            });

            // v2.5 (2G.1): the loop model dimensions - resolved in C# against the stored row so an
            // EXPLICIT declaration is never overwritten by a loop_type preset (the resolution rule
            // is LoopModelDimensions.Resolve; the SQL simply writes what it decided).
            var storedRow = await conn.QueryFirstOrDefaultAsync(
                "SELECT loop_id, service_family, dynamic_class, objective_type, topology, command_path, acquisition::text AS acquisition, classification_source FROM cpm.loop_registry WHERE loop_id = @loopId",
                new { loopId = request.LoopId }, tx);
            var model = Registry.LoopModelDimensions.Resolve(request.LoopType, request.Model, CpmLoopRegistryReads.StoredModel(storedRow));

            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry
                    (loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
                     is_active, monitoring, tags, engineering, threshold_profile_id, updated_at,
                     service_family, dynamic_class, objective_type, topology, command_path, acquisition, classification_source)
                VALUES
                    (@loopId, @assetId, @displayName, @site, @area, @unit, @loopType, @criticality,
                     TRUE, @monitoring::jsonb, @tags::jsonb, COALESCE(@engineering::jsonb, '{}'::jsonb),
                     @thresholdProfileId, NOW(),
                     @serviceFamily, @dynamicClass, @objectiveType, @topology, @commandPath, @acquisition::jsonb, @classificationSource)
                ON CONFLICT (loop_id) DO UPDATE SET
                    asset_id = EXCLUDED.asset_id, display_name = EXCLUDED.display_name,
                    site = EXCLUDED.site, area = EXCLUDED.area, unit = EXCLUDED.unit,
                    loop_type = EXCLUDED.loop_type, criticality = EXCLUDED.criticality,
                    is_active = TRUE, tags = EXCLUDED.tags,
                    threshold_profile_id = EXCLUDED.threshold_profile_id,
                    -- Merge, do not replace: a re-activation must not wipe evidence
                    -- accumulated since the first onboarding (the CPA bug).
                    monitoring = cpm.loop_registry.monitoring || EXCLUDED.monitoring,
                    -- P3-8: omitting engineering on re-activation keeps the stored range.
                    engineering = COALESCE(@engineering::jsonb, cpm.loop_registry.engineering),
                    service_family = EXCLUDED.service_family, dynamic_class = EXCLUDED.dynamic_class, objective_type = EXCLUDED.objective_type,
                    topology = EXCLUDED.topology, command_path = EXCLUDED.command_path, acquisition = EXCLUDED.acquisition,
                    classification_source = EXCLUDED.classification_source,
                    updated_at = NOW()
                """,
                new
                {
                    serviceFamily = model.ServiceFamily, dynamicClass = model.DynamicClass, objectiveType = model.ObjectiveType,
                    topology = model.Topology, commandPath = model.CommandPath, acquisition = Registry.LoopModelDimensions.AcquisitionJson(model.Acquisition),
                    classificationSource = model.ClassificationSource,
                    loopId = request.LoopId,
                    assetId = request.AssetId,
                    displayName = request.DisplayName,
                    site = request.Site,
                    area = request.Area,
                    unit = request.Unit,
                    loopType = request.LoopType.ToUpperInvariant(),
                    criticality = (request.Criticality ?? "medium").ToLowerInvariant(),
                    monitoring = monitoringJson,
                    tags = tagsJson,
                    engineering = HasRange(request.Engineering)
                        ? SerializeRange(request.Engineering!)
                        : null,
                    thresholdProfileId = request.ThresholdProfileId
                }, tx);

            // Replace the role mapping wholesale — partial updates would leave
            // stale roles pointing at signals the caller just remapped.
            await conn.ExecuteAsync("DELETE FROM cpm.loop_tag_map WHERE loop_id = @loopId",
                new { loopId = request.LoopId }, tx);
            foreach (var tag in tags)
            {
                await conn.ExecuteAsync("""
                    INSERT INTO cpm.loop_tag_map (loop_id, signal_role, uns_path, source_system, source_tag)
                    VALUES (@loopId, @role, @unsPath, @sourceSystem, @sourceTag)
                    ON CONFLICT (loop_id, signal_role, uns_path) DO NOTHING
                    """,
                    new
                    {
                        loopId = request.LoopId,
                        role = tag.SignalRole.ToUpperInvariant(),
                        unsPath = tag.UnsPath,
                        sourceSystem = tag.SourceSystem,
                        sourceTag = tag.SourceTag
                    }, tx);
            }

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        // Project asset edges first: PublishEvidenceAsync derives hasPeerLinks from
        // cpm.loop_link, so the projection must land before the broadcast is written.
        await ProjectLinksAsync(request.LoopId, ct);
        // Signal assets ride the same onboarding step so a freshly activated loop
        // is immediately trendable through the UNS (Trend page, displays).
        // Wrapped: the registry row is already COMMITTED, so a projection failure
        // (asset-model down) must degrade to a warning — failing the whole call
        // would misreport "nothing happened". The readiness check surfaces the
        // un-projected signals until a republish-evidence fixes them.
        try
        {
            await ProjectSignalAssetsAsync(request.LoopId, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Signal-asset projection failed for {LoopId} — the loop is registered; " +
                "republish-evidence will retry the projection", request.LoopId);
        }
        await PublishEvidenceAsync(request.LoopId, ct);
        var dto = await GetAsync(request.LoopId, ct);
        return dto!;
    }

    private static readonly char[] LoopIdForbidden =
        { '/', '\\', '?', '#', '%', '&', ';', '|', '$', '"', '\'', '<', '>', '`', '{', '}', '[', ']' };

    private static void Validate(CpmLoopActivateRequest request)
    {
        // v2.5 (2G.1): every dimension against the registry contract, one message per field
        var modelErrors = Registry.LoopModelDimensions.Validate(request.Model);
        if (modelErrors.Count > 0) throw new ArgumentException("model: " + string.Join("; ", modelErrors));
        if (string.IsNullOrWhiteSpace(request.LoopId))
            throw new ArgumentException("loopId is required");
        // P1-5 (relaxed 2026-08-24): plant tags routinely carry dashes and dots -
        // 45FIC-109, B2-027PIC - so an alphanumeric-only charset rejected the real
        // world. The hazard it guarded is narrower than the ban: the historian
        // device path is prefix + SafeNode(loopId), which maps every
        // non-alphanumeric to '_', so "FIC-101" and "FIC.101" would collapse onto
        // ONE device and silently merge two loops' trends. That is now caught
        // exactly, by comparing historian nodes against the registry in
        // ActivateAsync. Here we only reject what genuinely breaks something:
        // whitespace (the Flink --loop-id argument, CSV round-trips) and
        // characters that do not survive a URL path segment.
        var loopId = request.LoopId;
        if (loopId.Length > 64)
            throw new ArgumentException($"loopId '{loopId}' is longer than 64 characters");
        if (loopId.Any(char.IsWhiteSpace) || loopId.Any(char.IsControl))
            throw new ArgumentException($"loopId '{loopId}' must not contain spaces or control characters");
        if (loopId.IndexOfAny(LoopIdForbidden) >= 0)
            throw new ArgumentException(
                $"loopId '{loopId}' must not contain any of: {new string(LoopIdForbidden)} " +
                "(it is used as a URL path segment and a job argument)");
        // P2-9: criticality has a Postgres CHECK but was never validated here, so a
        // valid-looking "MEDIUM" became an unhandled 23514 and a bare HTTP 500.
        if (!string.IsNullOrWhiteSpace(request.Criticality)
            && !ValidCriticalities.Contains(request.Criticality.ToLowerInvariant()))
            throw new ArgumentException(
                $"criticality must be one of: {string.Join(", ", ValidCriticalities)} (lowercase)");
        if (string.IsNullOrWhiteSpace(request.Site))
            throw new ArgumentException("site is required (single-site today, but the discriminator is not retrofittable)");
        // loop_type is mandatory: Traverse tags are named pump101.discharge_press,
        // not FIC10409, so ISA first-letter inference fails and the loop silently
        // falls to the UNKNOWN profile where the geometry prior is 0.0 and
        // geometry-based diagnosis is disabled entirely.
        if (!ValidLoopTypes.Contains(request.LoopType?.ToUpperInvariant()))
            throw new ArgumentException($"loopType must be one of: {string.Join(", ", ValidLoopTypes)}");

        var roles = (request.Tags ?? Array.Empty<CpmTagMapEntry>())
            .Select(t => t.SignalRole.ToUpperInvariant()).ToHashSet();
        var missing = RequiredRoles.Where(r => !roles.Contains(r)).ToList();
        if (request.EnableMonitoring && missing.Count > 0)
            throw new ArgumentException($"Monitoring requires signal roles: {string.Join(", ", missing)}");

        var unknown = roles.Where(r => !RequiredRoles.Contains(r) && !OptionalRoles.Contains(r)).ToList();
        if (unknown.Count > 0)
            throw new ArgumentException($"Unknown signal role(s): {string.Join(", ", unknown)}");

        // CHG-047 security review: the unit is shown in every trend; only unit characters are accepted
        // (letters, digits, space, ° % / . - · ² ³ µ ( ) ^ *), never markup.
        var pvUnit = request.Engineering?.PvUnit;
        if (!string.IsNullOrWhiteSpace(pvUnit) && !PvUnitPattern.IsMatch(pvUnit.Trim()))
            throw new ArgumentException(
                $"engineering.pvUnit '{pvUnit.Trim()}' is not a unit: use letters, digits, spaces and ° % / . - · ² ³ µ ( ) ^ *, at most {MaxPvUnitLength} characters");

        // CHG-059: optional-input applicability is one of three words, never free text
        foreach (var (name, value) in new[] { ("vpApplicability", request.Engineering?.VpApplicability), ("peerApplicability", request.Engineering?.PeerApplicability) })
            if (!string.IsNullOrWhiteSpace(value) && !Registry.OptionalInputs.IsApplicability(value))
                throw new ArgumentException($"engineering.{name} '{value.Trim()}' must be one of {string.Join(", ", Registry.OptionalInputs.ApplicabilityValues)}");
    }

    internal static readonly System.Text.RegularExpressions.Regex PvUnitPattern =
        new(@"^[\p{L}\p{N} °%/.\-·²³µ()^*]{1," + MaxPvUnitLength + "}$", System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    public async Task<bool> DeleteAsync(string loopId, CancellationToken ct)
    {
        var result = await BulkDeleteAsync(new[] { loopId }, ct);
        return result.Deleted > 0;
    }

    /// <summary>
    /// Retires a batch of loops in one round trip: their projected signal assets
    /// are released set-at-a-time, the registry rows go in one DELETE, and the
    /// tombstones are pipelined behind a single flush.
    /// </summary>
    public async Task<CpmBulkDeleteResult> BulkDeleteAsync(IReadOnlyList<string> loopIds, CancellationToken ct)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var ids = loopIds.Distinct(StringComparer.Ordinal).ToArray();

        // Which of these actually exist — so the caller learns that an id was
        // already gone instead of it being reported as retired.
        var present = (await conn.QueryAsync<string>(
                "SELECT loop_id FROM cpm.loop_registry WHERE loop_id = ANY(@ids)", new { ids }))
            .ToHashSet(StringComparer.Ordinal);
        var missing = ids.Where(id => !present.Contains(id)).ToArray();
        if (present.Count == 0)
        {
            sw.Stop();
            return new CpmBulkDeleteResult(ids.Length, 0, missing, 0, sw.ElapsedMilliseconds);
        }
        var target = present.ToArray();

        // The ledger MUST be read before the registry rows go: loop_signal_asset
        // cascades with them, and without it the projected assets would be
        // orphaned in the UNS (they were — a retired loop used to leave its
        // CpmLoopSignal measurements behind forever, cluttering the tag picker).
        var releasedAssets = await ReleaseProjectedAssetsAsync(conn, target, ct);

        // loop_tag_map, loop_link and loop_signal_asset cascade. Analytics rows are
        // deliberately kept: gate results are evidence, and retiring a loop must
        // not erase the history of what it did.
        var affected = await conn.ExecuteAsync(
            "DELETE FROM cpm.loop_registry WHERE loop_id = ANY(@ids)", new { ids = target });

        foreach (var loopId in target)
        {
            try
            {
                // Same envelope the single-delete path published — the broadcast
                // consumer reads __tombstone, not a null value.
                _producer.Produce(_options.MetadataTopic,
                    new Message<string, string> { Key = loopId, Value = TombstoneEnvelope(loopId) },
                    report =>
                    {
                        if (report.Error.IsError)
                            _logger.LogWarning("Tombstone failed for {LoopId}: {Reason}", loopId, report.Error.Reason);
                    });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not queue tombstone for {LoopId}", loopId);
            }
        }
        try { _producer.Flush(TimeSpan.FromSeconds(30)); }
        catch (Exception ex) { _logger.LogWarning(ex, "Tombstone flush did not complete"); }

        sw.Stop();
        _logger.LogInformation(
            "Bulk retire: {Deleted} loop(s), {Assets} projected asset(s) released, {Missing} not found, {Ms} ms",
            affected, releasedAssets, missing.Length, sw.ElapsedMilliseconds);
        return new CpmBulkDeleteResult(ids.Length, affected, missing, releasedAssets, sw.ElapsedMilliseconds);
    }

    /// <summary>
    /// Releases the UNS assets a batch of loops projected: ones this service
    /// created are deleted, ones that pre-existed keep their identity and only
    /// lose the transport overrides we set. Both happen in bulk.
    /// </summary>
    private async Task<int> ReleaseProjectedAssetsAsync(
        NpgsqlConnection conn, string[] loopIds, CancellationToken ct)
    {
        var ledger = (await conn.QueryAsync<(Guid AssetId, bool CreatedByProjection)>("""
            SELECT asset_id, created_by_projection
            FROM cpm.loop_signal_asset WHERE loop_id = ANY(@ids)
            """, new { ids = loopIds })).ToList();
        if (ledger.Count == 0) return 0;

        var http = _httpFactory.CreateClient("AssetModel");
        http.DefaultRequestHeaders.Remove("X-Service-Key");
        http.DefaultRequestHeaders.Add("X-Service-Key", _options.ServiceKey);

        var deletes = ledger.Where(l => l.CreatedByProjection).Select(l => l.AssetId).Distinct().ToList();
        // "" clears an override back to the path-derived value (NormalizeOverride).
        var clears = ledger.Where(l => !l.CreatedByProjection).Select(l => (object)new
        {
            id = l.AssetId,
            ioTDbPathOverride = "",
            sparkplugGroupOverride = "",
            sparkplugEdgeNodeOverride = "",
            sparkplugDeviceOverride = "",
            sparkplugMetricOverride = "",
        }).ToList();

        try
        {
            foreach (var chunk in Chunk(deletes, AssetWriteChunk))
            {
                var res = await http.PostAsJsonAsync("/assets/bulk", new { deletes = chunk }, ct);
                res.EnsureSuccessStatusCode();
            }
            foreach (var chunk in Chunk(clears, AssetWriteChunk))
            {
                var res = await http.PostAsJsonAsync("/assets/bulk", new { updates = chunk }, ct);
                res.EnsureSuccessStatusCode();
            }
        }
        catch (Exception ex)
        {
            // Retirement of the loop itself must not be blocked by the asset
            // model being unavailable; the leftovers are reported, not hidden.
            _logger.LogWarning(ex,
                "Could not release {Count} projected asset(s) - the loops are still retired", ledger.Count);
            return 0;
        }
        return ledger.Count;
    }
}

/// <summary>CPM registry configuration ("Cpm" section).</summary>
public sealed class CpmRegistryOptions
{
    public const string SectionName = "Cpm";
    public string BootstrapServers { get; set; } = "kafka:9092";
    /// <summary>Compacted topic every CPLM Flink job consumes unconditionally.</summary>
    public string MetadataTopic { get; set; } = "traverse.cpa.ams.metadata.updates";
    /// <summary>asset-model base URL — the source of the asset graph projected into loop links.</summary>
    public string AssetModelUrl { get; set; } = "http://asset-model:5000";
    /// <summary>Service-to-service key for asset-model calls that carry no user token.</summary>
    public string ServiceKey { get; set; } = "traverse-internal-dev-key";
    /// <summary>
    /// Sparkplug group/edge the loop live plane publishes under. Must match the
    /// sparkplug-edge-node's SPARKPLUG_GROUP/SPARKPLUG_EDGE — these values go into
    /// the projected assets' live-transport overrides, and a mismatch means the
    /// Trend page subscribes to a topic nothing publishes.
    /// </summary>
    public string SparkplugGroup { get; set; } = "ams_site1";
    public string SparkplugEdge { get; set; } = "ams_edge1";
}
