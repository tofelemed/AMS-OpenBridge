// CHG-223 (owner, "Use plant-wide settings"): drop a loop's own gate-configuration settings. Clearing a loop's region leaves it
// with its own LOOP bundle that only restates the plant-wide values, and such a loop no longer follows later PROFILE / SITE
// changes. This makes, per loop, a LOOP draft that marks "use the plant-wide settings": its layers are the plant-wide base the
// loop would run under without its own bundle (PlantWideAsync, the re-stack's base rule) and its resolved block carries
// "inherit": {"loop_id": ...}. It goes through the normal draft -> validate -> approve -> deploy steps as one batch; the workers
// acknowledge it like any bundle and then pass over it to the PROFILE (else SITE) bundle in force, and once it verifies the loop
// has no active LOOP row (ConfigDeploymentService.ProbeAsync), so every read sees it under the plant-wide bundle.
using static Traverse.CplmApi.Services.Config.ConfigBatchService;

namespace Traverse.CplmApi.Services.Config;

public sealed partial class LoopSettingsService
{
    public const string InheritBatchKind = "inherit";
    public const int MaxInheritLoops = 200;

    /// <summary>
    /// One validated "use the plant-wide settings" draft per named loop that has its own active LOOP bundle (or the row's error);
    /// nothing is approved or deployed here. A row's PvMin / PvMax = the region the loop will have, Previous* = its own region now.
    /// </summary>
    public async Task<(Guid BatchId, IReadOnlyList<RowResult> Rows)> InheritAsync(string site, IReadOnlyList<string> loopIds, string? note, string actor, CancellationToken ct)
    {
        var batchId = Guid.NewGuid();
        var fullNote = Note(batchId, InheritBatchKind, note);
        var active = await _store.ActiveAsync(site, ct);
        var map = ActiveMap(active);
        var get = Cached(ct);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<RowResult>();
        foreach (var requested in loopIds)
        {
            var loopId = (requested ?? "").Trim();
            RowResult Fail(string error, double? min = null, double? max = null) => new(loopId, site, null, null, null, min, max, min, max, error, Array.Empty<string>());
            if (loopId.Length == 0) { results.Add(Fail("loopId is required")); continue; }
            if (!seen.Add(loopId)) { results.Add(Fail("the loop is listed twice")); continue; }
            var loop = await _registry.GetAsync(loopId, ct);
            if (loop is null) { results.Add(Fail("the loop is not registered")); continue; }
            if (!loop.IsActive) { results.Add(Fail("the loop is retired")); continue; }
            // the batch is read back by site (GET batches/{id}?site=), so its drafts must belong to the site named here
            if (!string.Equals(loop.Site, site, StringComparison.OrdinalIgnoreCase)) { results.Add(Fail($"the loop belongs to site '{loop.Site}'")); continue; }
            if (!map.TryGetValue(("LOOP", loop.LoopId), out var ownId) || await get(ownId) is not { Inherits: false } own)
            {
                results.Add(Fail("the loop already uses the plant-wide settings"));
                continue;
            }
            var (prevMin, prevMax) = RegionOf(own.Resolved);
            var plant = await PlantWideAsync(site, loop.LoopId, ConfigStore.ProfileIdFor(loop.LoopType), map, get);
            try
            {
                var draft = await _store.CreateInheritDraftAsync(site, loop.LoopId, own.BundleId, plant.Layers, actor, fullNote, ct);
                draft = await _store.ValidateAsync(draft.BundleId, ct);
                var (min, max) = RegionOf(draft.Resolved);
                _audit.Emit("CONFIG_DRAFT_CREATED", actor, "gate_config_bundle", draft.BundleId.ToString(),
                    new { draft.Site, draft.ScopeKind, draft.ScopeRef, draft.Version, draft.ContentHash, batchId, inherit = true, replaces = own.BundleId,
                        plantWide = plant.Name, plantWideBundleId = plant.Bundle?.BundleId });
                results.Add(new RowResult(loop.LoopId, site, draft.BundleId, draft.Version, draft.State, min, max, prevMin, prevMax, null, Problems(draft.Validation),
                    CreatedBy: actor, Inherits: true));
            }
            catch (Exception ex) when (ex is ArgumentException or ConfigStateException or KeyNotFoundException)
            {
                results.Add(Fail(ex.Message, prevMin, prevMax));
            }
        }
        _audit.Emit("CONFIG_INHERIT_BATCH_CREATED", actor, "gate_config_batch", batchId.ToString(),
            new { site, rows = results.Count, drafts = results.Count(r => r.BundleId is not null), note });
        return (batchId, results);
    }
}
