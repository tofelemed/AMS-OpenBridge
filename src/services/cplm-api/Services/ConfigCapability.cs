using System.Text.Json;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services;

/// <summary>
/// v2.5 Task 3A.2 (spec v6 §5.3): the <c>config</c> section of /capabilities - the deployed build's
/// configuration truth. The catalogue hash and the installed plan come from this build; which
/// properties are READABLE comes only from the CAPABILITY records the running jobs announced
/// (cpm.config_worker_capability), never from the JSON alone: a property nobody reads is stated
/// as such, a job on another catalogue is a mismatch, two jars are two jars.
/// </summary>
public sealed record ConfigCapability(
    string CatalogueHash,
    int CatalogueCount,
    string State,                                                   // ANNOUNCED | NO_WORKER_ANNOUNCED | CATALOGUE_MISMATCH
    IReadOnlyList<ConfigCapability.Worker> Workers,
    IReadOnlyList<string> JarSha256s,
    IReadOnlyList<string> ReadablePropertyIds,                      // union over the announced jobs, sorted
    IReadOnlyDictionary<string, IReadOnlyList<string>> ReadableBy,  // property -> jobs that read it
    IReadOnlyList<string> NotReadByAnyJob,                          // flink-consumed catalogue properties no announced job reads
    IReadOnlyDictionary<string, string> UnsupportedInBuild,         // the build's own declaration (unsupported-in-build.json)
    IReadOnlyList<JsonElement> SupportedRoleModeCombinations,
    JsonElement? ExecutionPlanCapacity,                             // as announced by the most recently announced job
    string InstalledExecutionPlanHash,
    IReadOnlyDictionary<string, string> Schemas,
    IReadOnlyList<string> ArtifactKinds)
{
    public sealed record Worker(string JobName, string JarSha256, string? SourceCommit, string CatalogueHash, bool CatalogueMatches, int ReadableCount, DateTime? AnnouncedAt);

    public static ConfigCapability From(IEnumerable<WorkerCapabilityRow> rows)
    {
        var cat = PropertyCatalogue.Current;
        var workers = new List<Worker>();
        var readableBy = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var combos = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        JsonElement? capacity = null;
        DateTime? capacityAt = null;
        foreach (var r in rows.OrderBy(r => r.JobName, StringComparer.Ordinal))
        {
            JsonElement payload;
            try { payload = JsonDocument.Parse(r.Payload).RootElement.Clone(); }
            catch (JsonException) { payload = default; }
            var isObject = payload.ValueKind == JsonValueKind.Object;
            var readable = isObject && payload.TryGetProperty("readable_property_ids", out var ids) && ids.ValueKind == JsonValueKind.Array
                ? ids.EnumerateArray().Where(i => i.ValueKind == JsonValueKind.String).Select(i => i.GetString()!).Distinct(StringComparer.Ordinal).ToList()
                : new List<string>();
            foreach (var id in readable) (readableBy.TryGetValue(id, out var l) ? l : readableBy[id] = new List<string>()).Add(r.JobName);
            if (isObject && payload.TryGetProperty("supported_role_mode_combinations", out var c) && c.ValueKind == JsonValueKind.Array)
                foreach (var combo in c.EnumerateArray()) combos.TryAdd(combo.GetRawText(), combo);
            if (isObject && payload.TryGetProperty("execution_plan_capacity", out var cap) && cap.ValueKind == JsonValueKind.Object
                && (capacity is null || (r.ReceivedAt ?? DateTime.MinValue) > (capacityAt ?? DateTime.MinValue)))
            { capacity = cap; capacityAt = r.ReceivedAt; }
            workers.Add(new Worker(r.JobName, r.JarSha256, r.SourceCommit, r.CatalogueHash, r.CatalogueHash == cat.CatalogueHash, readable.Count, r.ReceivedAt));
        }
        var state = workers.Count == 0 ? "NO_WORKER_ANNOUNCED" : workers.All(w => w.CatalogueMatches) ? "ANNOUNCED" : "CATALOGUE_MISMATCH";
        var readableIds = readableBy.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();
        var notRead = cat.Properties.Where(p => p.Consumers.Any(x => x.StartsWith("flink:", StringComparison.Ordinal)) && !readableBy.ContainsKey(p.Property))
            .Select(p => p.Property).ToList();
        return new ConfigCapability(
            cat.CatalogueHash, cat.Count, state, workers,
            workers.Select(w => w.JarSha256).Distinct(StringComparer.Ordinal).OrderBy(j => j, StringComparer.Ordinal).ToList(),
            readableIds,
            readableBy.ToDictionary(kv => kv.Key, kv => (IReadOnlyList<string>)kv.Value, StringComparer.Ordinal),
            notRead,
            Traverse.CplmApi.Config.UnsupportedInBuild.Reasons,
            combos.Values.ToList(),
            capacity,
            ExecutionPlans.InstalledHash(),
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["catalogue"]     = cat.Schema,
                ["bundle"]        = "traverse.cpa.gate-config.bundle/v1",
                ["executionPlan"] = "traverse.cpa.gate-config.execution-plan/v1",
                ["capability"]    = "traverse.cpa.gate-config.capability/v1",
                ["ack"]           = "traverse.cpa.gate-config.ack/v1",
            },
            GateCatalog.Catalogue().SelectMany(g => g.ArtifactKinds).Distinct(StringComparer.Ordinal).OrderBy(k => k, StringComparer.Ordinal).ToList());
    }
}
