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
    /// <summary>CHG-024: republish (links, signal assets, evidence) for a whole set in one
    /// request — per-loop link projection, then the batch forms; per-item outcomes.</summary>
    Task<CpmBulkRepublishResult> BulkRepublishEvidenceAsync(IReadOnlyList<string> loopIds, CancellationToken ct);
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
    // v2.5 (2G.1): the loop model dimensions + acquisition contract. Omitted = keep a stored
    // EXPLICIT model, else the loop_type preset (stamped PRESET_FROM_LOOP_TYPE).
    CpmLoopModel? Model = null,
    // G-07: site/area/unit are validated against the asset model on activation —
    // they become the loop's UNS signal paths, so a typo used to create phantom
    // assets that resolved to nothing (live proof: a loop registered under a
    // site that exists in no asset model). True = explicit operator opt-out:
    // onboard anyway, signals sit outside the plant tree until modelled.
    bool AllowUnmodelledLocation = false);

/// <summary>
/// P3-8 - the engineering ranges of the OP and PV signals. The engine assumed OP is
/// 0-100 %: a 0-1 valve fraction made G2r pass unconditionally and saturation
/// read 0 forever. Declared here at onboarding, broadcast to Flink as
/// cplm.loop.engineering, and used to normalize OP before gate evaluation.
/// </summary>
public sealed record CpmEngineeringRange(
    double? OpMin = null, double? OpMax = null,
    // The PV range serves the same purpose for the error band that the OP range
    // serves for saturation: goodErrorPct measured |SP-PV| against a hardcoded
    // 0.5 EU, which is 0.5 % of span on a 0-100 loop but 0.05 % on a 0-1000 t/h
    // flow — so G3 could never pass there. Declared here, broadcast as
    // cplm.loop.engineering, and turned into a fraction-of-span band by the engine.
    double? PvMin = null, double? PvMax = null,
    // CHG-047 (SME #10): the PV engineering unit ("kg/h", "°C", "barg"); SP shares it, OP is %.
    // Display only — every trend axis and tooltip names it; the engine never reads it.
    string? PvUnit = null,
    // CHG-059 (SME #23): whether VP / peer links are expected on this loop at all — EXPECTED | NOT_INSTALLED |
    // NOT_APPLICABLE; absent = derived (VP from the command path, peers expected). Display / readiness only.
    string? VpApplicability = null, string? PeerApplicability = null);

/// <summary>
/// v2.5 (2G.1, spec v6 §6.1-6.3): what the loop IS, declared as five separate dimensions. Any field
/// may be omitted (the loop_type preset fills it); a request with any field set is EXPLICIT.
/// </summary>
public sealed record CpmLoopModel(
    string? ServiceFamily, string? DynamicClass, string? ObjectiveType, string? Topology, string? CommandPath,
    CpmAcquisition? Acquisition)
{
    public bool IsEmpty => string.IsNullOrWhiteSpace(ServiceFamily) && string.IsNullOrWhiteSpace(DynamicClass) && string.IsNullOrWhiteSpace(ObjectiveType)
        && string.IsNullOrWhiteSpace(Topology) && string.IsNullOrWhiteSpace(CommandPath) && Acquisition is null;
}

/// <summary>v2.5 (2G.1): the acquisition contract - how the source delivers samples (NR-016 bandwidth eligibility, NR-019 RBE holds).</summary>
public sealed record CpmAcquisition(string Mode, int? GridSeconds, double? SourceFilterS, int? TimestampQuantizationMs, double? DeclaredScanS)
{
    public static readonly CpmAcquisition Default = new("PERIODIC", null, null, null, null);
}

/// <summary>v2.5 (2G.1): the effective loop model as stored, with its classification source.</summary>
public sealed record CpmLoopModelDto(
    string? ServiceFamily, string? DynamicClass, string ObjectiveType, string Topology, string CommandPath, CpmAcquisition Acquisition, string ClassificationSource);

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
    string? ThresholdProfileId,
    /// <summary>Declared OP/PV engineering ranges, or null when the loop declares none.
    /// Returned so an edit round-trip cannot silently drop what onboarding stored.</summary>
    CpmEngineeringRange? Engineering = null,
    /// <summary>v2.5 (2E.2): the site zone every time on the loop's evidence is shown in (registry column; 'UTC' when undeclared).</summary>
    string? Timezone = null,
    /// <summary>v2.5 (2G.1): the loop model dimensions + acquisition contract and where they came from.</summary>
    CpmLoopModelDto? Model = null);

public sealed record CpmLoopLinkDto(string ToLoopId, string RelType, string Origin);

public sealed record CpmBulkActivateRequest(IReadOnlyList<CpmLoopActivateRequest> Loops);

public sealed record CpmBulkDeleteRequest(IReadOnlyList<string> LoopIds);
public sealed record CpmBulkRepublishRequest(IReadOnlyList<string> LoopIds);

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
