// Gate Configuration re-check (owner, 24 Nov, item 5): the Check step's Now and New columns, both the engine's way. A bundle's own
// resolution starts from FACTORY only, but the engine (EffectiveBundleSelector.apply) lays every bundle layer over the loop's
// CLASS PACK. A first loop-type version therefore compared factory values its loops do not run. Both sides must use the same
// order, or the pack shows up as changes nobody made: a type version started from the plant's version holds FACTORY, the plant
// layer and an empty PROFILE layer (no pack copy), while one built from the factory layers carries a copy of the pack.
//   Below     = FACTORY with the class pack over it, then the layers below the version's own level (what the loops run without it);
//   Effective = the same, then every layer including the version's own (what they run with it) - LoopEffective's order.
// A plant version has no single pack (each loop type has its own), so both sides keep FACTORY alone there.
using System.Text.Json;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services.Config;

public static class BundleBelow
{
    /// <summary>
    /// The class pack under a version: a loop type's own; a loop's (or regime's) from the registry's loop type
    /// (<paramref name="loopProfileId"/>), else its PROFILE layer; none for the plant.
    /// </summary>
    public static string? PackFor(BundleView b, string? loopProfileId = null) => b.ScopeKind switch
    {
        "PROFILE" => b.ScopeRef,
        "LOOP" or "REGIME" => loopProfileId ?? Stack(b).Where(l => Kind(l) == "PROFILE").Select(Ref).FirstOrDefault(r => !string.IsNullOrEmpty(r)),
        _ => null,
    };

    /// <summary>What the loops of the version's scope run without it, or null when the scope is unknown or nothing resolves.</summary>
    public static JsonElement? Below(BundleView b, string? pack)
    {
        var own = Array.IndexOf(EffectiveConfigResolver.Order, b.ScopeKind);
        return own <= 0 ? null : Resolve(b, pack, k => k < own);            // unknown scope, or FACTORY itself
    }

    /// <summary>What the loops of the version's scope run with it (every layer over the pack), or null when the scope is unknown.</summary>
    public static JsonElement? Effective(BundleView b, string? pack) =>
        Array.IndexOf(EffectiveConfigResolver.Order, b.ScopeKind) <= 0 ? null : Resolve(b, pack, _ => true);

    private static JsonElement? Resolve(BundleView b, string? pack, Func<int, bool> takes)
    {
        var stack = Stack(b);
        var factory = stack.Where(l => Kind(l) == "FACTORY").Select(Content).FirstOrDefault(c => c.ValueKind == JsonValueKind.Object);
        if (factory.ValueKind != JsonValueKind.Object) factory = FactoryLayers.Factory();
        var packContent = pack is null ? null : FactoryLayers.Profile(pack);
        // the pack is part of the bottom layer, so RESET_TO_INHERITED above it falls back to the pack's value, as in the engine
        var layers = new List<ConfigLayer> { new("FACTORY", null, packContent is { ValueKind: JsonValueKind.Object } p ? LoopEffective.Merge(factory, p) : factory) };
        layers.AddRange(stack
            .Where(l => { var k = Array.IndexOf(EffectiveConfigResolver.Order, Kind(l)); return k > 0 && takes(k); })
            .OrderBy(l => l.TryGetProperty("ordinal", out var o) && o.ValueKind == JsonValueKind.Number ? o.GetInt32() : 0)
            .Select(l => new ConfigLayer(Kind(l), Ref(l), Content(l))));
        var result = EffectiveConfigResolver.Resolve(layers);
        return result.Properties.Count == 0 ? null : result.PropertiesElement();
    }

    private static List<JsonElement> Stack(BundleView b) =>
        b.Layers.ValueKind == JsonValueKind.Array ? b.Layers.EnumerateArray().ToList() : new List<JsonElement>();

    private static string Kind(JsonElement layer) => layer.TryGetProperty("kind", out var k) ? k.GetString() ?? "" : "";

    private static string? Ref(JsonElement layer) => layer.TryGetProperty("ref", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null;

    private static JsonElement Content(JsonElement layer) => layer.TryGetProperty("content", out var c) ? c : default;
}
