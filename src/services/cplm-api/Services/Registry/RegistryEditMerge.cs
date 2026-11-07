using System.Text.Json.Nodes;

namespace Traverse.CplmApi.Services.Registry;

/// <summary>
/// Activate is an upsert, so an edit of a stored loop must keep what the request does not carry (production
/// configuration), and must not revive a retired loop. Pure rules, used inside the activate transaction.
/// </summary>
public static class RegistryEditMerge
{
    /// <summary>The engineering keys the registry form sends; an edit replaces these and keeps every other key.</summary>
    private static readonly string[] FormKeys =
        { "opMin", "opMax", "pvMin", "pvMax", "pvUnit", "vpApplicability", "peerApplicability" };

    /// <summary>An edit would set is_active back to TRUE and lose Retired; Restore is the one way back.</summary>
    public static void EnsureNotRetired(bool? storedIsActive, string loopId)
    {
        if (storedIsActive == false)
            throw new LoopIdCollisionException("LOOP_RETIRED",
                $"Loop '{loopId}' is retired. Restore the loop first; an edit would silently bring it back.");
    }

    public const string BulkRetiredMessage = "Loop is retired. Restore it first.";

    /// <summary>Bulk import: rows of a retired loop are not applied (they would revive it and rewrite its monitoring and tags).</summary>
    public static (List<T> Apply, List<string> Refused) SplitRetired<T>(IEnumerable<T> rows, Func<T, string> idOf, ISet<string> retiredIds)
    {
        var apply = new List<T>();
        var refused = new List<string>();
        foreach (var r in rows)
        {
            if (retiredIds.Contains(idOf(r))) refused.Add(idOf(r)); else apply.Add(r);
        }
        return (apply, refused);
    }

    /// <summary>A request entry without a source keeps the stored source of the same role and path.</summary>
    public static IReadOnlyList<CpmTagMapEntry> MergeTagSources(IEnumerable<CpmTagMapEntry> existing, IReadOnlyList<CpmTagMapEntry> incoming)
    {
        var stored = new Dictionary<(string, string), CpmTagMapEntry>();
        foreach (var e in existing) stored[(e.SignalRole.ToUpperInvariant(), e.UnsPath)] = e;
        return incoming.Select(t =>
            string.IsNullOrEmpty(t.SourceSystem) && string.IsNullOrEmpty(t.SourceTag)
            && stored.TryGetValue((t.SignalRole.ToUpperInvariant(), t.UnsPath), out var old)
                ? t with { SourceSystem = old.SourceSystem, SourceTag = old.SourceTag }
                : t).ToList();
    }

    /// <summary>Null incoming = keep the stored range (the SQL COALESCE). Otherwise the form's keys are replaced and others kept.</summary>
    public static string? MergeEngineering(string? existingJson, string? incomingJson)
    {
        if (incomingJson is null) return null;
        var merged = Parse(existingJson);
        foreach (var k in FormKeys) merged.Remove(k);
        foreach (var kv in Parse(incomingJson)) merged[kv.Key] = kv.Value?.DeepClone();
        return merged.ToJsonString();
    }

    /// <summary>The whole monitoring object: stored keys kept, evidence merged key by key, the request overwriting only what it sends.</summary>
    public static string MergeMonitoring(string? existingJson, bool enabled, bool stepTestApproved)
    {
        var m = Parse(existingJson);
        var evidence = m["evidence"] as JsonObject ?? new JsonObject();
        evidence["stepTestApproved"] = stepTestApproved;
        // Derived from real edges at publish time, never hand-set.
        evidence["peerLinksConfigured"] = false;
        m["enabled"] = enabled;
        m["cplmPipeline"] = "cplm-three-stage-system";
        m["evidence"] = evidence;
        return m.ToJsonString();
    }

    private static JsonObject Parse(string? json) =>
        string.IsNullOrWhiteSpace(json) ? new JsonObject() : JsonNode.Parse(json) as JsonObject ?? new JsonObject();
}
