// Gate Configuration gap #1 (owner, 23 Nov: all gaps in this release): what a loop really runs under. The engine
// (EffectiveBundleSelector.apply) lays the governing bundle's SITE / PROFILE / LOOP layer contents over the loop's CLASS PACK.
// A bundle's own resolution (bundle.Resolved) starts from FACTORY only, so a SITE bundle - and a LOOP bundle stacked on a SITE
// bundle - read factory values where the engine runs the class pack's (36-42 of 48 properties differed on the lab). This
// resolves the loop's effective values the engine's way: FACTORY with the loop's class pack over it, then the bundle's other
// layers in order. Values that come from the pack are reported with source PROFILE.
using System.Text.Json;
using System.Text.Json.Nodes;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services.Config;

public static class LoopEffective
{
    /// <summary>The loop's effective properties and sources under <paramref name="bundle"/> for its class pack <paramref name="profileId"/>.</summary>
    public static EffectiveConfigResolver.Result Resolve(BundleView bundle, string profileId)
    {
        var stack = bundle.Layers.ValueKind == JsonValueKind.Array ? bundle.Layers.EnumerateArray().ToList() : new List<JsonElement>();
        var factory = stack.Where(l => Kind(l) == "FACTORY").Select(Content).FirstOrDefault(c => c.ValueKind == JsonValueKind.Object);
        if (factory.ValueKind != JsonValueKind.Object) factory = FactoryLayers.Factory();
        var pack = FactoryLayers.Profile(profileId);
        var layers = new List<ConfigLayer> { new("FACTORY", null, pack is { ValueKind: JsonValueKind.Object } p ? Merge(factory, p) : factory) };
        layers.AddRange(stack.Where(l => Kind(l) != "FACTORY")
            .OrderBy(l => l.TryGetProperty("ordinal", out var o) && o.ValueKind == JsonValueKind.Number ? o.GetInt32() : 0)
            .Select(l => new ConfigLayer(Kind(l), l.TryGetProperty("ref", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null, Content(l))));
        var result = EffectiveConfigResolver.Resolve(layers);
        if (pack is { ValueKind: JsonValueKind.Object } packContent)
            foreach (var prop in packContent.EnumerateObject())
                if (result.Sources.TryGetValue(prop.Name, out var source) && source == "FACTORY") result.Sources[prop.Name] = "PROFILE";
        return result;
    }

    private static string Kind(JsonElement layer) => layer.TryGetProperty("kind", out var k) ? k.GetString() ?? "" : "";

    private static JsonElement Content(JsonElement layer) => layer.TryGetProperty("content", out var c) ? c : default;

    private static JsonElement Merge(JsonElement under, JsonElement over)
    {
        var merged = JsonNode.Parse(under.GetRawText())!.AsObject();
        foreach (var prop in over.EnumerateObject()) merged[prop.Name] = JsonNode.Parse(prop.Value.GetRawText());
        return JsonDocument.Parse(merged.ToJsonString()).RootElement.Clone();
    }
}
