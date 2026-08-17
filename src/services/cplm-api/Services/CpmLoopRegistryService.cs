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

/// <summary>
/// CPLM Phase 4 — loop identity: onboarding, signal-role tag mapping, and the
/// peer-link projection that makes G13 evaluable.
///
/// Identity model (decision S-A): this service owns what a LOOP is; Traverse's
/// asset-model owns where each SIGNAL lives. asset_id is a soft reference into
/// another database, so there is no FK — orphans are a reconcile problem, not a
/// constraint problem.
///
/// Four CPA defects are deliberately not reproduced here:
///   * their registry PUT rebuilt `monitoring` with Evidence=null, silently
///     resetting stepTestApproved/peerLinksConfigured and reverting G12/G13
///   * their activation never wrote tags.vp, so readiness reported NO_VP even
///     when a VP role was mapped
///   * two conflicting required-role contracts (pv/sp/op vs PV/SP/OP/MODE/QUALITY)
///   * self-healing DDL that omitted columns their own migration added, so the
///     detail query threw on a self-healed database
/// </summary>
public interface ICpmLoopRegistryService
{
    Task<IReadOnlyList<CpmLoopDto>> GetAllAsync(CancellationToken ct);
    Task<CpmLoopDto?> GetAsync(string loopId, CancellationToken ct);
    Task<CpmLoopDto> ActivateAsync(CpmLoopActivateRequest request, CancellationToken ct);
    Task<bool> DeleteAsync(string loopId, CancellationToken ct);
    /// <summary>Re-publishes loop evidence (peer links, step test) onto the CPLM broadcast topic.</summary>
    Task PublishEvidenceAsync(string loopId, CancellationToken ct);
    /// <summary>Upsert UNS assets (with transport overrides) for the loop's mapped
    /// signal roles, so loop PV/SP/OP/VP/MODE resolve — and trend — through the UNS.</summary>
    Task<int> ProjectSignalAssetsAsync(string loopId, CancellationToken ct);
    /// <summary>Projects asset-graph edges into loop-level links for a loop.</summary>
    Task<int> ProjectLinksAsync(string loopId, CancellationToken ct);
}

public sealed record CpmTagMapEntry(string SignalRole, string UnsPath, string? SourceSystem = null, string? SourceTag = null);

public sealed record CpmLoopActivateRequest(
    string LoopId,
    string DisplayName,
    string Site,
    string LoopType,
    string? Area = null,
    string? Unit = null,
    string? Criticality = null,
    Guid? AssetId = null,
    IReadOnlyList<CpmTagMapEntry>? Tags = null,
    string? ThresholdProfileId = null,
    bool EnableMonitoring = true,
    bool StepTestApproved = false,
    CpmEngineeringRange? Engineering = null);

/// <summary>
/// P3-8 - the engineering range of the OP signal. The engine assumed OP is
/// 0-100 %: a 0-1 valve fraction made G2r pass unconditionally and saturation
/// read 0 forever. Declared here at onboarding, broadcast to Flink as
/// cplm.loop.engineering, and used to normalize OP before gate evaluation.
/// </summary>
public sealed record CpmEngineeringRange(double? OpMin = null, double? OpMax = null);

public sealed record CpmLoopDto(
    string LoopId,
    Guid? AssetId,
    string DisplayName,
    string Site,
    string? Area,
    string? Unit,
    string LoopType,
    string Criticality,
    bool IsActive,
    bool MonitoringEnabled,
    IReadOnlyDictionary<string, string> Tags,
    IReadOnlyList<string> ObservabilityFlags,
    IReadOnlyList<CpmLoopLinkDto> Links,
    bool StepTestApproved,
    string? ThresholdProfileId);

public sealed record CpmLoopLinkDto(string ToLoopId, string RelType, string Origin);

public sealed class CpmLoopRegistryService : ICpmLoopRegistryService
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
        var rows = await conn.QueryAsync("""
            SELECT loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
                   is_active, monitoring::text AS monitoring, tags::text AS tags, threshold_profile_id
            FROM cpm.loop_registry ORDER BY loop_id
            """);
        var result = new List<CpmLoopDto>();
        foreach (var row in rows)
            result.Add(await HydrateAsync(conn, row, ct));
        return result;
    }

    public async Task<CpmLoopDto?> GetAsync(string loopId, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync("""
            SELECT loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
                   is_active, monitoring::text AS monitoring, tags::text AS tags, threshold_profile_id
            FROM cpm.loop_registry WHERE loop_id = @loopId
            """, new { loopId });
        return row is null ? null : await HydrateAsync(conn, row, ct);
    }

    private async Task<CpmLoopDto> HydrateAsync(NpgsqlConnection conn, dynamic row, CancellationToken ct)
    {
        string loopId = row.loop_id;
        var tagMap = (await conn.QueryAsync<(string SignalRole, string UnsPath)>("""
            SELECT signal_role, uns_path FROM cpm.loop_tag_map
            WHERE loop_id = @loopId AND is_active = TRUE
            """, new { loopId })).ToList();

        var links = (await conn.QueryAsync<CpmLoopLinkDto>("""
            SELECT to_loop_id AS ToLoopId, rel_type AS RelType, origin AS Origin
            FROM cpm.loop_link WHERE from_loop_id = @loopId
            UNION
            SELECT from_loop_id, rel_type, origin
            FROM cpm.loop_link WHERE to_loop_id = @loopId AND rel_type = 'PEER'
            """, new { loopId })).ToList();

        var tags = tagMap.ToDictionary(t => t.SignalRole.ToUpperInvariant(), t => t.UnsPath);
        var monitoring = ParseJson((string?)row.monitoring);
        var enabled = monitoring.TryGetProperty("enabled", out var en) && en.ValueKind == JsonValueKind.True;
        var stepTest = monitoring.TryGetProperty("evidence", out var ev)
            && ev.TryGetProperty("stepTestApproved", out var st) && st.ValueKind == JsonValueKind.True;

        return new CpmLoopDto(
            loopId, (Guid?)row.asset_id, row.display_name, row.site, row.area, row.unit,
            row.loop_type, row.criticality, row.is_active, enabled, tags,
            BuildObservabilityFlags(tags.Keys, links), links, stepTest, row.threshold_profile_id);
    }

    /// <summary>
    /// Negative flags only — the engine treats a missing positive as absent.
    /// HAS_PEER_LINKS is not stamped here: it is published to the Flink broadcast
    /// (see <see cref="PublishEvidenceAsync"/>), which is what the gate reads.
    /// </summary>
    private static List<string> BuildObservabilityFlags(IEnumerable<string> roles, IReadOnlyList<CpmLoopLinkDto> links)
    {
        var set = new HashSet<string>(roles, StringComparer.OrdinalIgnoreCase);
        var flags = new List<string>();
        if (!set.Contains("VP")) flags.Add("NO_VP");
        if (links.Count == 0) flags.Add("NO_UPSTREAM_LINKS");
        return flags;
    }

    // ── Onboarding ──────────────────────────────────────────────────────────

    public async Task<CpmLoopDto> ActivateAsync(CpmLoopActivateRequest request, CancellationToken ct)
    {
        Validate(request);
        await EnsureSchemaAsync(ct);

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
                throw new InvalidOperationException(
                    $"Loop id '{request.LoopId}' collides with existing loop '{existingCasing}' " +
                    "(loop ids are case-insensitively unique; re-use the existing casing or retire it first)");
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

            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry
                    (loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
                     is_active, monitoring, tags, engineering, threshold_profile_id, updated_at)
                VALUES
                    (@loopId, @assetId, @displayName, @site, @area, @unit, @loopType, @criticality,
                     TRUE, @monitoring::jsonb, @tags::jsonb, COALESCE(@engineering::jsonb, '{}'::jsonb),
                     @thresholdProfileId, NOW())
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
                    updated_at = NOW()
                """,
                new
                {
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
                    engineering = request.Engineering is { OpMin: not null } or { OpMax: not null }
                        ? JsonSerializer.Serialize(new { opMin = request.Engineering.OpMin, opMax = request.Engineering.OpMax })
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
        await ProjectSignalAssetsAsync(request.LoopId, ct);
        await PublishEvidenceAsync(request.LoopId, ct);
        var dto = await GetAsync(request.LoopId, ct);
        return dto!;
    }

    private static void Validate(CpmLoopActivateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.LoopId))
            throw new ArgumentException("loopId is required");
        // P1-5: the historian device path is prefix + SafeNode(loopId), which maps
        // every non-alphanumeric to '_'. So "FIC-101", "FIC.101", "FIC 101" and
        // "FIC_101" all collapse onto ONE device while the registry keeps them as
        // four distinct loops - their PV/SP/OP would merge, last write wins. Reject
        // the ambiguity at onboarding rather than discovering it as merged trends.
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.LoopId, "^[A-Za-z][A-Za-z0-9_]*$"))
            throw new ArgumentException(
                $"loopId '{request.LoopId}' must start with a letter and contain only letters, " +
                "digits and underscore. Characters like '-', '.' or ' ' are collapsed to '_' in the " +
                "historian path, which would silently merge two loops onto one series.");
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
    }

    public async Task<bool> DeleteAsync(string loopId, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        // loop_tag_map and loop_link cascade. Analytics rows are deliberately kept:
        // gate results are evidence, and deleting a registry row must not erase the
        // history of what the loop did.
        var affected = await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId });
        if (affected > 0) await PublishTombstoneAsync(loopId, ct);
        return affected > 0;
    }

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

    public async Task<int> ProjectSignalAssetsAsync(string loopId, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var mapped = (await conn.QueryAsync<(string SignalRole, string UnsPath)>("""
                SELECT signal_role, uns_path FROM cpm.loop_tag_map
                WHERE loop_id = @loopId AND is_active
                """, new { loopId }))
            .Where(t => StoredSignalRoles.Contains(t.SignalRole.ToUpperInvariant()))
            .GroupBy(t => t.SignalRole.ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.First().UnsPath);

        var ledger = (await conn.QueryAsync<LedgerRow>("""
                SELECT signal_role AS SignalRole, contextual_path AS ContextualPath,
                       asset_id AS AssetId, created_by_projection AS CreatedByProjection
                FROM cpm.loop_signal_asset WHERE loop_id = @loopId
                """, new { loopId }))
            .ToDictionary(r => r.SignalRole, r => r);

        var http = _httpFactory.CreateClient("AssetModel");
        http.DefaultRequestHeaders.Remove("X-Service-Key");
        http.DefaultRequestHeaders.Add("X-Service-Key", _options.ServiceKey);

        var device = SparkplugDeviceOf(loopId);
        var iotdbDevice = $"{_iotdb.LoopRootPrefix}.{IotDbWriteClient.SafeNode(loopId)}";
        var projected = 0;

        foreach (var (role, unsPath) in mapped)
        {
            var measurement = role.ToLowerInvariant();
            try
            {
                // The role moved to a different tag path: retire the old
                // projection first so it does not linger pointing at this loop.
                if (ledger.TryGetValue(role, out var prev) && prev.ContextualPath != unsPath)
                    await RetireProjectionAsync(http, conn, loopId, prev, ct);

                var encoded = string.Join('/', unsPath.Split('/').Select(Uri.EscapeDataString));
                var existing = await http.GetAsync($"/assets/by-path/{encoded}", ct);

                // by-path answers 200 with an EMPTY body for a missing asset
                // (Results.Ok(null)), not 404 — read the raw body and treat
                // empty/"null" as not-found.
                AssetView? view = null;
                if (existing.IsSuccessStatusCode)
                {
                    var body = await existing.Content.ReadAsStringAsync(ct);
                    if (!string.IsNullOrWhiteSpace(body) && body.Trim() != "null")
                        view = System.Text.Json.JsonSerializer.Deserialize<AssetView>(
                            body, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }
                else if (existing.StatusCode != System.Net.HttpStatusCode.NotFound)
                {
                    existing.EnsureSuccessStatusCode();
                }

                Guid assetId;
                bool createdByUs;
                if (view is not null)
                {
                    // Pre-existing asset: set ONLY the transport overrides. Its
                    // name/template/description belong to whoever created it.
                    var put = await http.PutAsJsonAsync($"/assets/{view.Id}", new
                    {
                        ioTDbPathOverride = $"{iotdbDevice}.{measurement}",
                        sparkplugGroupOverride = _options.SparkplugGroup,
                        sparkplugEdgeNodeOverride = _options.SparkplugEdge,
                        sparkplugDeviceOverride = device,
                        sparkplugMetricOverride = measurement
                    }, ct);
                    put.EnsureSuccessStatusCode();
                    assetId = view.Id;
                    createdByUs = ledger.TryGetValue(role, out var l) && l.AssetId == view.Id && l.CreatedByProjection;
                }
                else
                {
                    var post = await http.PostAsJsonAsync("/assets", new
                    {
                        contextualPath = unsPath,
                        name = $"{loopId} {role}",
                        type = 5, // Measurement
                        description = $"CPLM loop-signal projection for {loopId} ({role}). " +
                                      "Managed by cplm-api; transport overrides point at the loop pipeline.",
                        template = "CpmLoopSignal",
                        parentId = (Guid?)null,
                        ioTDbPathOverride = $"{iotdbDevice}.{measurement}",
                        sparkplugGroupOverride = _options.SparkplugGroup,
                        sparkplugEdgeNodeOverride = _options.SparkplugEdge,
                        sparkplugDeviceOverride = device,
                        sparkplugMetricOverride = measurement
                    }, ct);
                    post.EnsureSuccessStatusCode();
                    var createdAsset = await post.Content.ReadFromJsonAsync<AssetView>(cancellationToken: ct);
                    if (createdAsset is null) continue;
                    assetId = createdAsset.Id;
                    createdByUs = true;
                }

                await conn.ExecuteAsync("""
                    INSERT INTO cpm.loop_signal_asset
                        (loop_id, signal_role, contextual_path, asset_id, created_by_projection, projected_at)
                    VALUES (@loopId, @role, @path, @assetId, @created, NOW())
                    ON CONFLICT (loop_id, signal_role) DO UPDATE SET
                        contextual_path = EXCLUDED.contextual_path,
                        asset_id = EXCLUDED.asset_id,
                        created_by_projection = EXCLUDED.created_by_projection,
                        projected_at = NOW()
                    """, new { loopId, role, path = unsPath, assetId, created = createdByUs });
                projected++;
            }
            catch (Exception ex)
            {
                // Same philosophy as ProjectLinksAsync: onboarding must not fail
                // because asset-model is down. The binding_provenance readiness
                // check surfaces the un-projected signal until a republish fixes it.
                _logger.LogWarning(ex,
                    "Could not project signal asset for loop {LoopId} role {Role} at {Path}",
                    loopId, role, unsPath);
            }
        }

        // Roles that used to be projected but are no longer mapped.
        foreach (var (role, row) in ledger)
        {
            if (mapped.ContainsKey(role)) continue;
            try
            {
                await RetireProjectionAsync(http, conn, loopId, row, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Could not retire stale signal-asset projection for loop {LoopId} role {Role}",
                    loopId, role);
            }
        }

        _logger.LogInformation("Projected {Count} signal asset(s) for loop {LoopId}", projected, loopId);
        return projected;
    }

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

    private sealed record AssetView(Guid Id);
    private sealed record LedgerRow(string SignalRole, string ContextualPath, Guid AssetId, bool CreatedByProjection);

    // ── Evidence publishing (the G13 path) ──────────────────────────────────

    public async Task PublishEvidenceAsync(string loopId, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var links = (await conn.QueryAsync<string>("""
            SELECT to_loop_id FROM cpm.loop_link WHERE from_loop_id = @loopId
            UNION
            SELECT from_loop_id FROM cpm.loop_link WHERE to_loop_id = @loopId AND rel_type = 'PEER'
            """, new { loopId })).ToList();

        var row = await conn.QueryFirstOrDefaultAsync<(string? Monitoring, string? Engineering)>(
            "SELECT monitoring::text, engineering::text FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId });
        var monitoringJson = row.Monitoring;
        var monitoring = ParseJson(monitoringJson);
        var stepTest = monitoring.TryGetProperty("evidence", out var ev)
            && ev.TryGetProperty("stepTestApproved", out var st) && st.ValueKind == JsonValueKind.True;

        // Keep the registry's own mirror of peer status truthful for readiness reads.
        await conn.ExecuteAsync("""
            UPDATE cpm.loop_registry
            SET monitoring = jsonb_set(monitoring, '{evidence,peerLinksConfigured}', @configured::jsonb, true),
                updated_at = NOW()
            WHERE loop_id = @loopId
            """, new { loopId, configured = links.Count > 0 ? "true" : "false" });

        var evidence = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["hasPeerLinks"] = links.Count > 0,
            ["hasStepTest"] = stepTest,
            ["peers"] = links
        });

        // Envelope shape consumed by CplmParameterSetBroadcastSupport.applyUpdateToState:
        // parameters[].name lands in broadcast state under "<calcInstanceId>:<name>",
        // which is exactly the key applyLoopEvidence reads.
        var parameters = new List<Dictionary<string, string>>
        {
            new() { ["name"] = "cplm.loop.evidence", ["value"] = evidence }
        };

        // P3-8 - broadcast the OP engineering range so the engine can normalize a
        // non-0-100 OP (e.g. a 0-1 valve fraction) before gate evaluation. Merge-only
        // key applied AFTER profile resolution; it can never clobber the class pack.
        var engineering = ParseJson(row.Engineering);
        var hasEng = engineering.ValueKind == JsonValueKind.Object;
        double? opMin = hasEng && engineering.TryGetProperty("opMin", out var mn) && mn.ValueKind == JsonValueKind.Number ? mn.GetDouble() : null;
        double? opMax = hasEng && engineering.TryGetProperty("opMax", out var mx) && mx.ValueKind == JsonValueKind.Number ? mx.GetDouble() : null;
        if (opMin != null || opMax != null)
        {
            parameters.Add(new Dictionary<string, string>
            {
                ["name"] = "cplm.loop.engineering",
                ["value"] = JsonSerializer.Serialize(new { opEngMin = opMin ?? 0.0, opEngMax = opMax ?? 100.0 })
            });
        }

        var envelope = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["calcInstanceId"] = loopId,
            ["parameters"] = parameters
        });

        try
        {
            await _producer.ProduceAsync(_options.MetadataTopic,
                new Message<string, string> { Key = loopId, Value = envelope }, ct);
            _logger.LogInformation(
                "Published loop evidence for {LoopId}: peers={PeerCount} stepTest={StepTest}",
                loopId, links.Count, stepTest);
        }
        catch (Exception ex)
        {
            // Never fail onboarding on a broadcast hiccup: the topic is compacted
            // and a later publish (or PublishAllEvidenceAsync at startup) recovers.
            _logger.LogWarning(ex, "Could not publish loop evidence for {LoopId}", loopId);
        }
    }

    private async Task PublishTombstoneAsync(string loopId, CancellationToken ct)
    {
        var envelope = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["__tombstone"] = true,
            ["key"] = loopId
        });
        try
        {
            await _producer.ProduceAsync(_options.MetadataTopic,
                new Message<string, string> { Key = loopId, Value = envelope }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not publish tombstone for {LoopId}", loopId);
        }
    }

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

/// <summary>CPM registry configuration ("Cpm" section).</summary>
public sealed class CpmRegistryOptions
{
    public const string SectionName = "Cpm";
    public string BootstrapServers { get; set; } = "kafka:9092";
    /// <summary>Compacted topic every CPLM Flink job consumes unconditionally.</summary>
    public string MetadataTopic { get; set; } = "ams.metadata.updates";
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
