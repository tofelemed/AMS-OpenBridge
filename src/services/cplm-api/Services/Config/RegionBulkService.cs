// CHG-108 (System Response plan Phase 4, owner 22 Nov): operating regions for many loops at once. A region (G2r.pv_region_min /
// _max, PV units) belongs to one loop, so each loop gets its own LOOP-scope draft; the batch is approved and deployed through
// ConfigBatchService, each draft on the governed lifecycle of one bundle. The same call updates or clears regions later. Each
// draft starts from the bundle the loop runs under now (its LOOP bundle, else the active PROFILE or SITE bundle with an own
// LOOP layer added), so the loop keeps everything it runs under and only the region changes. A region also drives gate G2r: a
// window mostly outside it loses its fused verdict.
using System.Text.Json;
using Traverse.CplmApi.Services;
using static Traverse.CplmApi.Services.Config.ConfigBatchService;

namespace Traverse.CplmApi.Services.Config;

public sealed class RegionBulkService
{
    public const int MaxRows = 200;
    public const string BatchKind = "regions";

    public sealed record RegionRow(string LoopId, double? PvMin, double? PvMax);

    public sealed record CurrentRegion(string LoopId, string DisplayName, string LoopType, string Site, double? PvRangeMin, double? PvRangeMax,
        double? RegionMin, double? RegionMax, string Source, Guid? BundleId, int? BundleVersion);

    private readonly ConfigStore _store;
    private readonly ICpmLoopRegistryService _registry;
    private readonly ICplmAuditEmitter _audit;

    public RegionBulkService(ConfigStore store, ICpmLoopRegistryService registry, ICplmAuditEmitter audit)
    {
        _store = store; _registry = registry; _audit = audit;
    }

    /// <summary>One validated LOOP draft per row (or the row's error); nothing is approved or deployed here.</summary>
    public async Task<(Guid BatchId, IReadOnlyList<RowResult> Rows)> CreateAsync(IReadOnlyList<RegionRow> rows, string? note, string actor, CancellationToken ct)
    {
        var batchId = Guid.NewGuid();
        var fullNote = Note(batchId, BatchKind, note);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<RowResult>();
        foreach (var row in rows)
        {
            var loopId = (row.LoopId ?? "").Trim();
            RowResult Fail(string error, string? site = null) => new(loopId, site, null, null, null, row.PvMin, row.PvMax, null, null, error, Array.Empty<string>());
            if (loopId.Length == 0) { results.Add(Fail("loopId is required")); continue; }
            if (!seen.Add(loopId)) { results.Add(Fail("the loop is listed twice")); continue; }
            if (row.PvMin is null != row.PvMax is null) { results.Add(Fail("give both bounds, or neither to clear the region")); continue; }
            if (row.PvMin is { } lo && row.PvMax is { } hi && !(lo < hi)) { results.Add(Fail("the minimum must be below the maximum")); continue; }
            var loop = await _registry.GetAsync(loopId, ct);
            if (loop is null) { results.Add(Fail("the loop is not registered")); continue; }
            if (!loop.IsActive) { results.Add(Fail("the loop is retired", loop.Site)); continue; }
            var profileId = ConfigStore.ProfileIdFor(loop.LoopType);
            var active = await _store.ActiveForLoopAsync(loop.Site, loop.LoopId, profileId, ct);
            var (prevMin, prevMax) = active is null ? (null, null) : RegionOf(active.Resolved);
            try
            {
                var draft = await _store.CreateDraftAsync(loop.Site, "LOOP", loop.LoopId, active?.BundleId, profileId, actor, fullNote, ct);
                var ops = row.PvMin is null
                    ? new List<ConfigStore.PatchOp> { new("reset", MinProperty, null), new("reset", MaxProperty, null) }
                    : new List<ConfigStore.PatchOp> { new("set", MinProperty, Num(row.PvMin.Value)), new("set", MaxProperty, Num(row.PvMax!.Value)) };
                draft = await _store.PatchAsync(draft.BundleId, draft.Etag, ops, actor, ct);
                draft = await _store.ValidateAsync(draft.BundleId, ct);
                var problems = Problems(draft.Validation);
                if (loop.Engineering is { PvMin: { } rMin, PvMax: { } rMax } && row.PvMin is { } a && row.PvMax is { } b && (a < rMin || b > rMax))
                    problems.Add($"the region {a} - {b} reaches outside the PV range {rMin} - {rMax}");
                _audit.Emit("CONFIG_DRAFT_CREATED", actor, "gate_config_bundle", draft.BundleId.ToString(),
                    new { draft.Site, draft.ScopeKind, draft.ScopeRef, draft.Version, draft.ContentHash, batchId, region = new { row.PvMin, row.PvMax } });
                results.Add(new RowResult(loop.LoopId, loop.Site, draft.BundleId, draft.Version, draft.State, row.PvMin, row.PvMax, prevMin, prevMax, null, problems, CreatedBy: actor));
            }
            catch (Exception ex) when (ex is ArgumentException or ConfigStateException or ConfigConflictException or KeyNotFoundException)
            {
                results.Add(Fail(ex.Message, loop.Site));
            }
        }
        _audit.Emit("CONFIG_REGION_BATCH_CREATED", actor, "gate_config_batch", batchId.ToString(),
            new { rows = results.Count, drafts = results.Count(r => r.BundleId is not null), note });
        return (batchId, results);
    }

    /// <summary>Every active loop's region now (from its active LOOP, else PROFILE, else SITE bundle; none = no region) beside its PV range.</summary>
    public async Task<IReadOnlyList<CurrentRegion>> CurrentAsync(string? site, CancellationToken ct)
    {
        var loops = (await _registry.GetAllAsync(ct)).Where(l => l.IsActive && (site is null || string.Equals(l.Site, site, StringComparison.OrdinalIgnoreCase)))
            .OrderBy(l => l.LoopId, StringComparer.Ordinal).ToList();
        var bundles = new Dictionary<Guid, BundleView?>();
        var result = new List<CurrentRegion>();
        foreach (var group in loops.GroupBy(l => l.Site, StringComparer.OrdinalIgnoreCase))
        {
            var active = (await _store.ActiveAsync(group.Key, ct)).ToDictionary(a => (a.ScopeKind, a.ScopeRef), a => a.BundleId);
            foreach (var l in group)
            {
                Guid? id = null; string source = "NONE";
                foreach (var key in new[] { ("LOOP", l.LoopId), ("PROFILE", ConfigStore.ProfileIdFor(l.LoopType)), ("SITE", "") })
                    if (active.TryGetValue(key, out var found)) { id = found; source = key.Item1; break; }
                BundleView? b = null;
                if (id is { } bid && !bundles.TryGetValue(bid, out b)) bundles[bid] = b = await _store.GetAsync(bid, ct);
                var (min, max) = b is null ? (null, null) : RegionOf(b.Resolved);
                result.Add(new CurrentRegion(l.LoopId, l.DisplayName, l.LoopType, l.Site, l.Engineering?.PvMin, l.Engineering?.PvMax, min, max, source, b?.BundleId, b?.Version));
            }
        }
        return result;
    }

    private static JsonElement Num(double v) => JsonDocument.Parse(JsonSerializer.Serialize(v)).RootElement.Clone();
}
