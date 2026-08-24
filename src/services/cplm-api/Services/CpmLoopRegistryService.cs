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
    /// <summary>
    /// Onboards a whole batch in ONE round trip. Per-row outcomes are preserved
    /// (a bad row fails alone), but the collision lookups, the registry writes and
    /// the signal-asset projection are done set-at-a-time instead of per loop.
    /// </summary>
    Task<CpmBulkActivateResult> BulkActivateAsync(IReadOnlyList<CpmLoopActivateRequest> requests, CancellationToken ct);
    Task<bool> DeleteAsync(string loopId, CancellationToken ct);
    /// <summary>Retire a batch of loops, releasing their projected UNS assets.</summary>
    Task<CpmBulkDeleteResult> BulkDeleteAsync(IReadOnlyList<string> loopIds, CancellationToken ct);
    /// <summary>Re-publishes loop evidence (peer links, step test) onto the CPLM broadcast topic.</summary>
    Task PublishEvidenceAsync(string loopId, CancellationToken ct);
    /// <summary>Batch form of <see cref="PublishEvidenceAsync"/>.</summary>
    Task PublishEvidenceBatchAsync(IReadOnlyList<string> loopIds, CancellationToken ct);
    /// <summary>Upsert UNS assets (with transport overrides) for the loop's mapped
    /// signal roles, so loop PV/SP/OP/VP/MODE resolve — and trend — through the UNS.</summary>
    Task<int> ProjectSignalAssetsAsync(string loopId, CancellationToken ct);
    /// <summary>Batch form of <see cref="ProjectSignalAssetsAsync"/> — one path
    /// resolution and one asset write for the whole set.</summary>
    Task<int> ProjectSignalAssetsBatchAsync(IReadOnlyList<string> loopIds, CancellationToken ct);
    /// <summary>Projects asset-graph edges into loop-level links for a loop.</summary>
    Task<int> ProjectLinksAsync(string loopId, CancellationToken ct);
    /// <summary>How many registered loops still reference an asset-model node —
    /// asset-model's cross-database delete guard (G-02) asks this before letting
    /// a hierarchy node or tag be deleted.</summary>
    Task<int> CountReferencingLoopsAsync(string path, int assetType, CancellationToken ct);
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
    CpmEngineeringRange? Engineering = null,
    // G-07: site/area/unit are validated against the asset model on activation —
    // they become the loop's UNS signal paths, so a typo used to create phantom
    // assets that resolved to nothing (live proof: a loop registered under a
    // site that exists in no asset model). True = explicit operator opt-out:
    // onboard anyway, signals sit outside the plant tree until modelled.
    bool AllowUnmodelledLocation = false);

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

public sealed record CpmBulkActivateRequest(IReadOnlyList<CpmLoopActivateRequest> Loops);

public sealed record CpmBulkDeleteRequest(IReadOnlyList<string> LoopIds);

public sealed record CpmBulkDeleteResult(
    int Requested,
    int Deleted,
    /// <summary>Ids that were not in the registry — already retired, or a typo.</summary>
    IReadOnlyList<string> NotFound,
    /// <summary>Projected UNS assets deleted or released back to their own transport.</summary>
    int AssetsReleased,
    long ElapsedMs);

/// <summary>Outcome for one row; <c>Code</c> mirrors the single-activate error codes.</summary>
public sealed record CpmBulkActivateItem(string LoopId, bool Ok, string? Error = null, string? Code = null);

public sealed record CpmBulkActivateResult(
    int Requested,
    int Activated,
    int Failed,
    long ElapsedMs,
    IReadOnlyList<CpmBulkActivateItem> Results,
    /// <summary>
    /// Set when the rows committed but a post-commit step (signal-asset
    /// projection, evidence publish) did not. The loops ARE registered — saying
    /// nothing here, or failing the whole call, would both misreport that.
    /// Re-run the import or POST /loops/{id}/republish-evidence to finish.
    /// </summary>
    string? Warning = null);

/// <summary>
/// A loop id that cannot coexist with one already registered. Both reasons are
/// 409s, but they need different fixes, so the code distinguishes them:
/// LOOP_ID_CASE_COLLISION (same id, different casing) vs
/// LOOP_ID_HISTORIAN_COLLISION (different ids that sanitise to one IoTDB device).
/// </summary>
public sealed class LoopIdCollisionException : InvalidOperationException
{
    public string Code { get; }
    public LoopIdCollisionException(string code, string message) : base(message) => Code = code;
}

/// <summary>
/// The loop's site/area/unit chain does not exist in the asset model (or could
/// not be verified) and the caller did not pass allowUnmodelledLocation. Maps to
/// HTTP 422 with code LOCATION_NOT_IN_UNS.
/// </summary>
public sealed class LoopLocationException : InvalidOperationException
{
    public LoopLocationException(string message) : base(message) { }
}

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
            p.Add($"e{i}", r.Engineering is { OpMin: not null } or { OpMax: not null }
                ? JsonSerializer.Serialize(new { opMin = r.Engineering.OpMin, opMax = r.Engineering.OpMax })
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
    /// Characters that break a URL path segment (the loop id is one) or a shell
    /// argument. Everything else - dashes, dots, colons, parentheses - is a
    /// legitimate part of a plant tag and is allowed.
    /// </summary>
    private static readonly char[] LoopIdForbidden =
        { '/', '\\', '?', '#', '%', '&', ';', '|', '$', '"', '\'', '<', '>', '`', '{', '}', '[', ']' };

    private static void Validate(CpmLoopActivateRequest request)
    {
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
    }

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

    // ── Evidence publishing (the G13 path) ──────────────────────────────────

    /// <summary>
    /// Batch form of <see cref="PublishEvidenceAsync"/>. The per-loop version
    /// costs a connection, three round trips and an awaited Kafka delivery each;
    /// this reads the whole set in two queries, mirrors peer status in two
    /// UPDATEs, and pipelines the produces behind a single flush.
    /// </summary>
    public async Task PublishEvidenceBatchAsync(IReadOnlyList<string> loopIds, CancellationToken ct)
    {
        if (loopIds.Count == 0) return;
        var ids = loopIds.ToArray();
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var peers = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var (loop, peer) in await conn.QueryAsync<(string Loop, string Peer)>("""
            SELECT from_loop_id, to_loop_id FROM cpm.loop_link WHERE from_loop_id = ANY(@ids)
            UNION
            SELECT to_loop_id, from_loop_id FROM cpm.loop_link WHERE to_loop_id = ANY(@ids) AND rel_type = 'PEER'
            """, new { ids }))
        {
            if (!peers.TryGetValue(loop, out var list)) peers[loop] = list = new List<string>();
            list.Add(peer);
        }

        var rows = (await conn.QueryAsync<(string LoopId, string? Monitoring, string? Engineering)>("""
            SELECT loop_id, monitoring::text, engineering::text
            FROM cpm.loop_registry WHERE loop_id = ANY(@ids)
            """, new { ids })).ToList();

        // Keep the registry's own mirror of peer status truthful for readiness
        // reads — two set-based UPDATEs instead of one per loop.
        var withPeers = rows.Where(r => peers.ContainsKey(r.LoopId)).Select(r => r.LoopId).ToArray();
        var withoutPeers = rows.Where(r => !peers.ContainsKey(r.LoopId)).Select(r => r.LoopId).ToArray();
        const string mirrorSql = """
            UPDATE cpm.loop_registry
            SET monitoring = jsonb_set(monitoring, '{evidence,peerLinksConfigured}', @configured::jsonb, true),
                updated_at = NOW()
            WHERE loop_id = ANY(@ids)
            """;
        if (withPeers.Length > 0)
            await conn.ExecuteAsync(mirrorSql, new { ids = withPeers, configured = "true" });
        if (withoutPeers.Length > 0)
            await conn.ExecuteAsync(mirrorSql, new { ids = withoutPeers, configured = "false" });

        var published = 0;
        foreach (var (loopId, monitoringJson, engineeringJson) in rows)
        {
            var links = peers.TryGetValue(loopId, out var l) ? l : new List<string>();
            var monitoring = ParseJson(monitoringJson);
            var stepTest = monitoring.TryGetProperty("evidence", out var ev)
                && ev.TryGetProperty("stepTestApproved", out var st) && st.ValueKind == JsonValueKind.True;

            var parameters = new List<Dictionary<string, string>>
            {
                new()
                {
                    ["name"] = "cplm.loop.evidence",
                    ["value"] = JsonSerializer.Serialize(new Dictionary<string, object>
                    {
                        ["hasPeerLinks"] = links.Count > 0,
                        ["hasStepTest"] = stepTest,
                        ["peers"] = links
                    })
                }
            };

            var engineering = ParseJson(engineeringJson);
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
                // Produce (not ProduceAsync): queue every message, then wait once
                // at the flush below instead of a round trip per loop.
                _producer.Produce(_options.MetadataTopic,
                    new Message<string, string> { Key = loopId, Value = envelope },
                    report =>
                    {
                        if (report.Error.IsError)
                            _logger.LogWarning("Loop evidence publish failed for {LoopId}: {Reason}",
                                loopId, report.Error.Reason);
                    });
                published++;
            }
            catch (Exception ex)
            {
                // Never fail onboarding on a broadcast hiccup: the topic is
                // compacted and a later publish recovers.
                _logger.LogWarning(ex, "Could not queue loop evidence for {LoopId}", loopId);
            }
        }

        try { _producer.Flush(TimeSpan.FromSeconds(30)); }
        catch (Exception ex) { _logger.LogWarning(ex, "Evidence flush did not complete"); }
        _logger.LogInformation("Published loop evidence for {Count} loop(s)", published);
    }

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

    /// <summary>Retirement broadcast for one loop. Retained verbatim from the
    /// single-delete path so the broadcast consumer's contract does not move.</summary>
    private static string TombstoneEnvelope(string loopId) =>
        JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["__tombstone"] = true,
            ["key"] = loopId
        });

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
