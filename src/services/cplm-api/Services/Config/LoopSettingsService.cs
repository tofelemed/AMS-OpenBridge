// CHG-108 (owner 22 Nov, "per-loop settings apart from the plant-wide ones"): exactly one bundle governs a loop (its LOOP
// bundle over its PROFILE over the SITE bundle; EffectiveBundleSelector), so a LOOP bundle carries a full copy of the
// plant-wide layers it was built on, and a later plant-wide change does not reach it. This finds the loops whose own bundle
// sits on another plant-wide base than the one they would run under without it (the active PROFILE, else SITE bundle, else the
// build's factory layers), and re-stacks them: a new LOOP draft = the current plant-wide layers + the loop's own LOOP layer,
// unchanged. The drafts form one batch (approve + deploy through ConfigBatchService), so plant-wide changes reach every loop,
// the loop's own settings are kept, and every result still names the one bundle it ran under.
using System.Text.Json;
using System.Text.Json.Nodes;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services;
using static Traverse.CplmApi.Services.Config.ConfigBatchService;

namespace Traverse.CplmApi.Services.Config;

public sealed partial class LoopSettingsService
{
    public const string BatchKind = "restack";

    public sealed record StaleLoop(string LoopId, string DisplayName, string LoopType, Guid BundleId, int Version, string Base,
        Guid? BaseBundleId, int? BaseVersion, IReadOnlyList<string> OwnProperties);

    private sealed record Plan(StaleLoop Stale, BundleView LoopBundle, string ProfileId, JsonElement NewLayers);

    private static readonly string[] OwnKinds = { "LOOP", "REGIME" };
    private readonly ConfigStore _store;
    private readonly ICpmLoopRegistryService _registry;
    private readonly ICplmAuditEmitter _audit;

    public LoopSettingsService(ConfigStore store, ICpmLoopRegistryService registry, ICplmAuditEmitter audit)
    {
        _store = store; _registry = registry; _audit = audit;
    }

    /// <summary>The loops whose own settings sit on an older (or other) plant-wide base than the one in force now.</summary>
    public async Task<IReadOnlyList<StaleLoop>> StaleAsync(string site, CancellationToken ct) =>
        (await PlanAsync(site, ct)).Select(p => p.Stale).ToList();

    /// <summary>One validated LOOP draft per stale loop (all, or the ones named): current plant-wide layers + its own layer.</summary>
    public async Task<(Guid BatchId, IReadOnlyList<RowResult> Rows)> RestackAsync(string site, IReadOnlyCollection<string>? loopIds, string? note, string actor, CancellationToken ct)
    {
        var batchId = Guid.NewGuid();
        var fullNote = Note(batchId, BatchKind, note);
        var plans = await PlanAsync(site, ct);
        if (loopIds is { Count: > 0 }) plans = plans.Where(p => loopIds.Contains(p.Stale.LoopId, StringComparer.OrdinalIgnoreCase)).ToList();
        var results = new List<RowResult>();
        foreach (var plan in plans)
        {
            var (prevMin, prevMax) = RegionOf(plan.LoopBundle.Resolved);
            try
            {
                var draft = await _store.CreateDraftAsync(site, "LOOP", plan.Stale.LoopId, plan.LoopBundle.BundleId, plan.ProfileId, actor, fullNote, ct, plan.NewLayers);
                draft = await _store.ValidateAsync(draft.BundleId, ct);
                var (min, max) = RegionOf(draft.Resolved);
                _audit.Emit("CONFIG_DRAFT_CREATED", actor, "gate_config_bundle", draft.BundleId.ToString(),
                    new { draft.Site, draft.ScopeKind, draft.ScopeRef, draft.Version, draft.ContentHash, batchId, restackedOn = plan.Stale.Base, plan.Stale.BaseBundleId });
                results.Add(new RowResult(plan.Stale.LoopId, site, draft.BundleId, draft.Version, draft.State, min, max, prevMin, prevMax, null, Problems(draft.Validation), CreatedBy: actor));
            }
            catch (Exception ex) when (ex is ArgumentException or ConfigStateException or KeyNotFoundException)
            {
                results.Add(new RowResult(plan.Stale.LoopId, site, null, null, null, prevMin, prevMax, prevMin, prevMax, ex.Message, Array.Empty<string>()));
            }
        }
        _audit.Emit("CONFIG_RESTACK_BATCH_CREATED", actor, "gate_config_batch", batchId.ToString(), new { site, drafts = results.Count(r => r.BundleId is not null), note });
        return (batchId, results);
    }

    private async Task<List<Plan>> PlanAsync(string site, CancellationToken ct)
    {
        var active = await _store.ActiveAsync(site, ct);
        var map = ActiveMap(active);
        var get = Cached(ct);
        var plans = new List<Plan>();
        foreach (var row in active.Where(a => a.ScopeKind == "LOOP").OrderBy(a => a.ScopeRef, StringComparer.Ordinal))
        {
            var loop = await _registry.GetAsync(row.ScopeRef, ct);
            if (loop is null || !loop.IsActive || await get(row.BundleId) is not { } loopBundle) continue;
            var profileId = ConfigStore.ProfileIdFor(loop.LoopType);
            var plant = await PlantWideAsync(site, loop.LoopId, profileId, map, get);
            if (Signature(Without(loopBundle.Layers, OwnKinds)) == Signature(plant.Layers)) continue;
            var own = loopBundle.Layers.EnumerateArray().FirstOrDefault(l => l.GetProperty("kind").GetString() == "LOOP");
            if (own.ValueKind != JsonValueKind.Object) continue;
            var ownProps = own.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.Object ? c.EnumerateObject().Select(p => p.Name).ToList() : new List<string>();
            plans.Add(new Plan(new StaleLoop(loop.LoopId, loop.DisplayName, loop.LoopType, loopBundle.BundleId, loopBundle.Version, plant.Name,
                plant.Bundle?.BundleId, plant.Bundle?.Version, ownProps), loopBundle, profileId, Append(plant.Layers, own)));
        }
        return plans;
    }

    /// <summary>The plant-wide base a loop runs under without its own bundle: the layers (LOOP / REGIME removed) of the active PROFILE bundle, else SITE bundle, else the build's factory layers.</summary>
    private sealed record PlantWide(string Name, BundleView? Bundle, JsonElement Layers);

    private static async Task<PlantWide> PlantWideAsync(string site, string loopId, string profileId, IReadOnlyDictionary<(string Kind, string Ref), Guid> active,
        Func<Guid, Task<BundleView?>> get)
    {
        BundleView? bundle = null;
        var name = "FACTORY";
        if (active.TryGetValue(("PROFILE", profileId), out var pid) && await get(pid) is { } pb) { bundle = pb; name = "PROFILE"; }
        else if (active.TryGetValue(("SITE", ""), out var sid) && await get(sid) is { } sb) { bundle = sb; name = "SITE"; }
        return new PlantWide(name, bundle, Without(bundle?.Layers ?? FactoryLayers.InitialLayers(site, "LOOP", loopId, profileId), OwnKinds));
    }

    private static IReadOnlyDictionary<(string Kind, string Ref), Guid> ActiveMap(IEnumerable<ConfigStore.ActiveRow> active) =>
        active.ToDictionary(a => (a.ScopeKind, a.ScopeRef), a => a.BundleId);

    /// <summary>A bundle reader that reads each bundle once per call.</summary>
    private Func<Guid, Task<BundleView?>> Cached(CancellationToken ct)
    {
        var cache = new Dictionary<Guid, BundleView?>();
        return async id =>
        {
            if (!cache.TryGetValue(id, out var b)) cache[id] = b = await _store.GetAsync(id, ct);
            return b;
        };
    }

    private static JsonElement Without(JsonElement layers, string[] kinds)
    {
        var kept = layers.EnumerateArray().Where(l => !kinds.Contains(l.GetProperty("kind").GetString())).Select(l => l.GetRawText());
        return JsonDocument.Parse("[" + string.Join(",", kept) + "]").RootElement.Clone();
    }

    /// <summary>What the layers hold, kind by kind (ordinal order): two stacks with the same contents have the same signature.</summary>
    private static string Signature(JsonElement layers) => string.Join("|", layers.EnumerateArray()
        .OrderBy(l => l.TryGetProperty("ordinal", out var o) ? o.GetInt32() : 0)
        .Select(l => l.GetProperty("kind").GetString() + ":" + (l.TryGetProperty("content", out var c) ? CanonicalJson.Sha256(c) : "")));

    private static JsonElement Append(JsonElement baseLayers, JsonElement own)
    {
        var list = JsonNode.Parse(baseLayers.GetRawText())!.AsArray();
        var ordinal = list.Select(l => l?["ordinal"]?.GetValue<int>() ?? 0).DefaultIfEmpty(0).Max() + 1;
        var copy = JsonNode.Parse(own.GetRawText())!.AsObject();
        copy["ordinal"] = ordinal;
        list.Add(copy);
        return JsonDocument.Parse(list.ToJsonString()).RootElement.Clone();
    }
}
