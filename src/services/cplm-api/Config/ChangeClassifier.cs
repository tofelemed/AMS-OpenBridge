using System.Text.Json;

namespace Traverse.CplmApi.Config;

/// <summary>
/// v2.5 Task 3B.2 (spec v6 §5.4, R18): the change class of an edit set is the maximum over the
/// edited properties promoted through the catalogue's dependency graph - a POLICY threshold an
/// event detector reads is a STATE_BOUNDARY change. Nothing is inferred from the edit's size.
/// </summary>
public static class ChangeClassifier
{
    public static string Classify(IEnumerable<string> editedProperties) => PropertyCatalogue.Current.EffectiveChangeClass(editedProperties);

    /// <summary>The property names whose values differ between two resolved property objects (added, removed or changed).</summary>
    public static IReadOnlyList<string> Diff(JsonElement before, JsonElement after)
    {
        var names = new SortedSet<string>(StringComparer.Ordinal);
        var b = before.ValueKind == JsonValueKind.Object ? before.EnumerateObject().ToDictionary(p => p.Name, p => CanonicalJson.Canonicalize(p.Value), StringComparer.Ordinal) : new Dictionary<string, string>();
        var a = after.ValueKind == JsonValueKind.Object ? after.EnumerateObject().ToDictionary(p => p.Name, p => CanonicalJson.Canonicalize(p.Value), StringComparer.Ordinal) : new Dictionary<string, string>();
        foreach (var k in b.Keys.Union(a.Keys))
        {
            if (!b.TryGetValue(k, out var bv) || !a.TryGetValue(k, out var av) || bv != av) names.Add(k);
        }
        return names.ToList();
    }
}
