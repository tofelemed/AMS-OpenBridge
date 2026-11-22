// CHG-108: a batch = LOOP-scope drafts created together (operating regions for many loops, or loops re-stacked on a new
// plant-wide bundle), marked "[batch <id> <kind>]" at the start of each draft's note. The batch is approved and deployed in one
// call, but every draft keeps the governed lifecycle of one bundle: an independent approver (self-approval refused per draft),
// one deployment per bundle, active only when the workers acknowledge it.
using System.Text.Json;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Services.Config;

public sealed class ConfigBatchService
{
    public const string MinProperty = "G2r.pv_region_min";
    public const string MaxProperty = "G2r.pv_region_max";

    public sealed record RowResult(string LoopId, string? Site, Guid? BundleId, int? Version, string? State, double? PvMin, double? PvMax,
        double? PreviousMin, double? PreviousMax, string? Error, IReadOnlyList<string> Problems, Guid? DeploymentId = null, string? DeploymentState = null);

    private readonly ConfigStore _store;
    private readonly ConfigDeploymentService _deployments;
    private readonly ICplmAuditEmitter _audit;

    public ConfigBatchService(ConfigStore store, ConfigDeploymentService deployments, ICplmAuditEmitter audit)
    {
        _store = store; _deployments = deployments; _audit = audit;
    }

    public static string Marker(Guid batchId, string kind) => $"[batch {batchId} {kind}]";

    public static string Note(Guid batchId, string kind, string? note) =>
        string.IsNullOrWhiteSpace(note) ? Marker(batchId, kind) : Marker(batchId, kind) + " " + note.Trim();

    /// <summary>The batch's drafts with their state, region and newest deployment.</summary>
    public async Task<IReadOnlyList<RowResult>> GetAsync(string site, Guid batchId, CancellationToken ct)
    {
        var results = new List<RowResult>();
        foreach (var b in await BundlesAsync(site, batchId, ct))
        {
            var (min, max) = RegionOf(b.Resolved);
            var dep = (await _deployments.ListAsync(b.BundleId, null, 1, ct)).FirstOrDefault();
            results.Add(new RowResult(b.ScopeRef ?? "", b.Site, b.BundleId, b.Version, b.State, min, max, null, null, null, Problems(b.Validation), dep?.DeploymentId, dep?.State));
        }
        return results;
    }

    /// <summary>Roles that may approve their own per-loop settings batch (owner, 22 Nov); everyone else needs a second person.</summary>
    public static readonly IReadOnlyList<string> SelfApprovingRoles = new[] { "SuperAdmin", "Admin" };

    /// <summary>
    /// A second person approves every VALIDATED draft of the batch. An Admin or SuperAdmin may approve their own drafts; that
    /// approval is recorded as a self-approval (approval note and audit), so the audit trail shows who decided alone.
    /// </summary>
    public async Task<IReadOnlyList<RowResult>> ApproveAsync(string site, Guid batchId, string actor, IReadOnlyList<string> roles, string? note, TimeSpan validity, CancellationToken ct)
    {
        var elevated = SelfApprovingRoles.FirstOrDefault(r => roles.Contains(r, StringComparer.OrdinalIgnoreCase));
        var results = new List<RowResult>();
        foreach (var b in await BundlesAsync(site, batchId, ct))
        {
            var (min, max) = RegionOf(b.Resolved);
            RowResult Row(string state, string? error) => new(b.ScopeRef ?? "", b.Site, b.BundleId, b.Version, state, min, max, null, null, error, Array.Empty<string>());
            if (b.State is not ("VALIDATED" or "SHADOW_EVALUATED"))
            {
                results.Add(Row(b.State, b.State == "APPROVED" ? null : $"not approvable in state {b.State}"));
                continue;
            }
            try
            {
                var self = string.Equals(b.CreatedBy, actor, StringComparison.OrdinalIgnoreCase);
                var selfApproved = self && elevated is not null;
                var role = selfApproved ? elevated! : roles.FirstOrDefault() ?? "unknown";
                var recorded = selfApproved ? $"[self-approved as {elevated}]" + (string.IsNullOrWhiteSpace(note) ? "" : " " + note.Trim()) : note;
                var approved = await _store.ApproveAsync(b.BundleId, actor, role, recorded, validity, false, roles, ct, allowSelfApproval: elevated is not null);
                _audit.Emit("CONFIG_DRAFT_APPROVED", actor, "gate_config_bundle", b.BundleId.ToString(),
                    new { approved.ContentHash, approved.ChangeClass, sensitive = false, batchId, selfApproved, role });
                results.Add(Row(approved.State, null));
            }
            catch (Exception ex) when (ex is ConfigForbiddenException or ConfigStateException)
            {
                results.Add(Row(b.State, ex.Message));
            }
        }
        return results;
    }

    /// <summary>One ACTIVATE deployment per APPROVED draft of the batch.</summary>
    public async Task<IReadOnlyList<RowResult>> DeployAsync(string site, Guid batchId, string actor, CancellationToken ct)
    {
        var results = new List<RowResult>();
        foreach (var b in await BundlesAsync(site, batchId, ct))
        {
            var (min, max) = RegionOf(b.Resolved);
            if (b.State is not ("APPROVED" or "PARTIALLY_ACKNOWLEDGED" or "ACTIVATION_FAILED"))
            {
                results.Add(new RowResult(b.ScopeRef ?? "", b.Site, b.BundleId, b.Version, b.State, min, max, null, null, $"not deployable in state {b.State}", Array.Empty<string>()));
                continue;
            }
            try
            {
                var d = await _deployments.CreateAsync(b.BundleId, "ACTIVATE", null, null, actor, ct);
                results.Add(new RowResult(b.ScopeRef ?? "", b.Site, b.BundleId, b.Version, "SCHEDULED", min, max, null, null, null, Array.Empty<string>(), d.DeploymentId, d.State));
            }
            catch (Exception ex) when (ex is ConfigStateException or ConfigConflictException or KeyNotFoundException)
            {
                results.Add(new RowResult(b.ScopeRef ?? "", b.Site, b.BundleId, b.Version, b.State, min, max, null, null, ex.Message, Array.Empty<string>()));
            }
        }
        return results;
    }

    private async Task<IReadOnlyList<BundleView>> BundlesAsync(string site, Guid batchId, CancellationToken ct)
    {
        var prefix = $"[batch {batchId} ";
        return (await _store.ListAsync(site, "LOOP", null, null, ct))
            .Where(b => b.Note is not null && b.Note.StartsWith(prefix, StringComparison.Ordinal))
            .OrderBy(b => b.ScopeRef, StringComparer.Ordinal).ToList();
    }

    internal static (double? Min, double? Max) RegionOf(JsonElement resolved)
    {
        if (resolved.ValueKind != JsonValueKind.Object || !resolved.TryGetProperty("properties", out var p) || p.ValueKind != JsonValueKind.Object) return (null, null);
        double? Read(string n) => p.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
        return (Read(MinProperty), Read(MaxProperty));
    }

    internal static List<string> Problems(JsonElement? validation)
    {
        var list = new List<string>();
        if (validation is not { ValueKind: JsonValueKind.Object } v) return list;
        foreach (var key in new[] { "errors", "warnings" })
            if (v.TryGetProperty(key, out var arr) && arr.ValueKind == JsonValueKind.Array)
                foreach (var e in arr.EnumerateArray())
                    list.Add(e.ValueKind == JsonValueKind.String ? e.GetString()! : e.GetRawText());
        return list;
    }
}
