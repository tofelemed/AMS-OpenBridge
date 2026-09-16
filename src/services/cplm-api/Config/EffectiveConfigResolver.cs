using System.Text.Json;

namespace Traverse.CplmApi.Config;

/// <summary>One layer of a bundle: kind (FACTORY, SITE, PROFILE, LOOP, REGIME), reference, content {property -> value | "RESET_TO_INHERITED"}.</summary>
public sealed record ConfigLayer(string Kind, string? Ref, JsonElement Content);

/// <summary>
/// v2.5 Task 3B.2 (spec v6 §5.3; NR-047): the deterministic merge FACTORY → SITE → exactly one
/// PROFILE → LOOP → exactly one REGIME. Absent inherits; RESET_TO_INHERITED removes the layer's
/// override; explicit null is refused (a value the catalogue requires is never "unset" by a layer);
/// a catalogue property no layer sets is NO_VALUE, stated. The same layers always give the same
/// resolved properties and hash; two loops' overrides never leak into each other.
/// </summary>
public static class EffectiveConfigResolver
{
    public const string ResetToInherited = "RESET_TO_INHERITED";
    public static readonly string[] Order = { "FACTORY", "SITE", "PROFILE", "LOOP", "REGIME" };

    public sealed class Result
    {
        public SortedDictionary<string, JsonElement> Properties { get; } = new(StringComparer.Ordinal);
        public SortedDictionary<string, string> Sources { get; } = new(StringComparer.Ordinal);
        public List<string> Errors { get; } = new();
        /// <summary>SHA-256 of the canonical resolved properties (the "effective" hash; the bundle hash also covers scope + layers).</summary>
        public string Hash { get; set; } = "";

        public JsonElement PropertiesElement()
        {
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(Properties.ToDictionary(p => p.Key, p => p.Value)));
            return doc.RootElement.Clone();
        }
    }

    public static Result Resolve(IReadOnlyList<ConfigLayer> layers)
    {
        var r = new Result();
        var catalogue = PropertyCatalogue.Current;
        var counts = layers.GroupBy(l => l.Kind, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);
        if (counts.GetValueOrDefault("PROFILE") > 1) r.Errors.Add("PROFILE_AMBIGUOUS: a bundle resolves exactly one profile layer, got " + counts["PROFILE"]);
        if (counts.GetValueOrDefault("REGIME") > 1) r.Errors.Add("REGIME_AMBIGUOUS: a bundle resolves exactly one regime layer, got " + counts["REGIME"]);
        foreach (var l in layers)
            if (Array.IndexOf(Order, l.Kind) < 0) r.Errors.Add($"LAYER_KIND_UNKNOWN: '{l.Kind}' is not one of {string.Join(", ", Order)}");
        if (r.Errors.Count > 0) return r;

        var values = new Dictionary<string, (JsonElement Value, string Source)>(StringComparer.Ordinal);
        foreach (var kind in Order)
        {
            foreach (var layer in layers.Where(l => l.Kind == kind))
            {
                if (layer.Content.ValueKind != JsonValueKind.Object)
                {
                    r.Errors.Add($"LAYER_CONTENT_INVALID: {kind} layer content must be an object");
                    continue;
                }
                foreach (var p in layer.Content.EnumerateObject())
                {
                    if (!catalogue.TryGet(p.Name, out _))
                    {
                        r.Errors.Add($"'{p.Name}' is not a catalogue property ({kind} layer)");
                        continue;
                    }
                    if (p.Value.ValueKind == JsonValueKind.String && p.Value.GetString() == ResetToInherited)
                    {
                        // remove THIS layer's override: the value falls back to what the layers below resolved
                        values.Remove(p.Name);
                        foreach (var lower in layers.Where(l => Array.IndexOf(Order, l.Kind) < Array.IndexOf(Order, kind)).OrderBy(l => Array.IndexOf(Order, l.Kind)))
                        {
                            if (lower.Content.ValueKind == JsonValueKind.Object && lower.Content.TryGetProperty(p.Name, out var lv) && !(lv.ValueKind == JsonValueKind.String && lv.GetString() == ResetToInherited) && lv.ValueKind != JsonValueKind.Null)
                                values[p.Name] = (lv.Clone(), lower.Kind);
                        }
                        continue;
                    }
                    if (p.Value.ValueKind == JsonValueKind.Null)
                    {
                        r.Errors.Add($"'{p.Name}' is null in the {kind} layer: a layer may set a value or RESET_TO_INHERITED, never null");
                        continue;
                    }
                    values[p.Name] = (p.Value.Clone(), kind);
                }
            }
        }
        foreach (var entry in catalogue.Properties)
        {
            if (values.TryGetValue(entry.Property, out var v))
            {
                r.Properties[entry.Property] = v.Value;
                r.Sources[entry.Property] = v.Source;
            }
            else
            {
                r.Properties[entry.Property] = JsonDocument.Parse("null").RootElement.Clone();
                r.Sources[entry.Property] = "NO_VALUE";
            }
        }
        r.Hash = CanonicalJson.Sha256(r.PropertiesElement());
        return r;
    }
}
