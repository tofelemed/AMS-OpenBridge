// CHG-224 (owner, 23 Nov: "Gate property values: show what is really used, and where it is set"): the source map. One entry per
// catalogue property says what decides the value the system really uses and where it is changed - Gate Configuration (EDITABLE,
// DECISION), Loop Registry (REGISTRY), the evidence retention policy (RETENTION), a rule of the method (AUTOMATIC_FIXED), a value
// worked out per loop (AUTOMATIC_DERIVED) or a check the system does not perform (NOT_APPLIED) - with the plain sentence the
// pages show. All wording lives in the embedded property-sources.json; the property catalogue (and so its fingerprint) is unchanged.
// Owner decision D1: a property that is not editable can never be set in a draft, and a value already stored for one is dropped
// whenever a new version is made from stored layers (WithoutNonEditable).
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Traverse.CplmApi.Config;

public sealed class PropertySources
{
    public static readonly string[] Kinds = { "EDITABLE", "DECISION", "REGISTRY", "RETENTION", "AUTOMATIC_FIXED", "AUTOMATIC_DERIVED", "NOT_APPLIED" };
    public static readonly string[] SetIns = { "GATE_CONFIGURATION", "LOOP_REGISTRY", "EVIDENCE_RETENTION", "AUTOMATIC", "NOT_APPLIED" };

    /// <summary>One property's source. <paramref name="Basis"/>: variant name -> sentence ("default" when the file gives one string).</summary>
    public sealed record Entry(string Property, string Kind, bool Editable, string SetIn, string? RegistryField, string? Resolver, string? Follows,
        string? Unit, JsonElement? Value, IReadOnlyDictionary<string, string> Basis, string? Where);

    public IReadOnlyDictionary<string, Entry> Entries { get; }
    /// <summary>Property names listed more than once in the file (the coverage test requires none).</summary>
    public IReadOnlyList<string> Duplicates { get; }
    public IReadOnlyDictionary<string, string> Levels { get; }
    public IReadOnlyDictionary<string, string> EditableBasis { get; }
    public string DecidedBasis { get; }
    public IReadOnlyDictionary<string, string> UnitWords { get; }
    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> Words { get; }
    public IReadOnlyDictionary<string, string> WhereByKind { get; }

    private PropertySources(JsonElement root)
    {
        var entries = new Dictionary<string, Entry>(StringComparer.Ordinal);
        var duplicates = new List<string>();
        foreach (var p in root.GetProperty("properties").EnumerateObject())
        {
            if (entries.ContainsKey(p.Name)) duplicates.Add(p.Name);
            var e = p.Value;
            var basis = new Dictionary<string, string>(StringComparer.Ordinal);
            if (e.TryGetProperty("basis", out var b))
            {
                if (b.ValueKind == JsonValueKind.String) basis["default"] = b.GetString()!;
                else foreach (var v in b.EnumerateObject()) basis[v.Name] = v.Value.GetString() ?? "";
            }
            entries[p.Name] = new Entry(p.Name, e.GetProperty("kind").GetString()!, e.GetProperty("editable").GetBoolean(), e.GetProperty("setIn").GetString()!,
                Text(e, "registryField"), Text(e, "resolver"), Text(e, "follows"), Text(e, "unit"),
                e.TryGetProperty("value", out var value) ? value.Clone() : null, basis, Text(e, "where"));
        }
        Entries = entries;
        Duplicates = duplicates;
        Levels = Map(root.GetProperty("levels"));
        EditableBasis = Map(root.GetProperty("editableBasis"));
        DecidedBasis = root.GetProperty("decidedBasis").GetString()!;
        UnitWords = Map(root.GetProperty("unitWords"));
        Words = root.GetProperty("words").EnumerateObject().ToDictionary(w => w.Name, w => Map(w.Value), StringComparer.Ordinal);
        WhereByKind = Map(root.GetProperty("where"));
    }

    private static string? Text(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static IReadOnlyDictionary<string, string> Map(JsonElement o) =>
        o.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "", StringComparer.Ordinal);

    private static readonly Lazy<PropertySources> Loaded = new(() =>
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Traverse.CplmApi.Config.property-sources.json")
            ?? throw new InvalidOperationException("property-sources.json is not embedded");
        using var doc = JsonDocument.Parse(stream);
        return new PropertySources(doc.RootElement);
    });

    /// <summary>The source map this service carries.</summary>
    public static PropertySources Current => Loaded.Value;

    public bool TryGet(string property, out Entry entry) => Entries.TryGetValue(property, out entry!);

    /// <summary>True only for EDITABLE and DECISION properties; an unknown name is not editable.</summary>
    public bool IsEditable(string property) => Entries.TryGetValue(property, out var e) && e.Editable;

    /// <summary>The plain sentence that says where a property that is not editable is changed (or that it cannot be).</summary>
    public string WhereChanged(string property) =>
        Entries.TryGetValue(property, out var e) ? e.Where ?? WhereByKind.GetValueOrDefault(e.Kind, "it is worked out automatically") : "it is not a setting";

    /// <summary>D1: the message a refused edit (PatchAsync) and a leftover value (ValidateAsync) carry.</summary>
    public string Refusal(string property) => $"'{property}' cannot be changed in Gate Configuration: {WhereChanged(property)}";

    /// <summary>
    /// D1: the layers with every property that is not editable removed from each non-FACTORY layer's content (content_hash
    /// recomputed). The FACTORY layer is kept as it is: the engine never applies it, and it restates the starting values.
    /// </summary>
    public JsonElement WithoutNonEditable(JsonElement layers)
    {
        if (layers.ValueKind != JsonValueKind.Array) return layers;
        var list = JsonNode.Parse(layers.GetRawText())!.AsArray();
        var changed = false;
        foreach (var node in list)
        {
            if (node is not JsonObject layer || layer["kind"]?.GetValue<string>() == "FACTORY" || layer["content"] is not JsonObject content) continue;
            var drop = content.Select(p => p.Key).Where(k => !IsEditable(k)).ToList();
            if (drop.Count == 0) continue;
            foreach (var k in drop) content.Remove(k);
            using var doc = JsonDocument.Parse(content.ToJsonString());
            layer["content_hash"] = CanonicalJson.Sha256(doc.RootElement);
            changed = true;
        }
        return changed ? JsonDocument.Parse(list.ToJsonString()).RootElement.Clone() : layers;
    }
}
