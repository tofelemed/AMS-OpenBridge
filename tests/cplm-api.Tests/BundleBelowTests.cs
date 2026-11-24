// Gate Configuration re-check (owner, 24 Nov): item 5 - the Check step's Now (Below) and New (Effective) are both resolved the
// engine's way, the class pack under every layer, so only the version's own edits differ whatever stack it was started with;
// item 6 - "Same result" names the diagnoses the compared windows kept (ShadowComparison.Unchanged). Pure: no database.
using System.Text.Json;
using System.Text.Json.Nodes;
using FluentAssertions;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class BundleBelowTests
{
    private const string Pack = "FLOW_FAST_SELF_REG";
    private const string SiteProp = "G4.activity_warn_ratio";

    private static JsonElement Obj(object o) => JsonSerializer.SerializeToElement(o);
    private static JsonElement Props(params (string Key, object Value)[] kv) => Obj(kv.ToDictionary(p => p.Key, p => p.Value));

    private static BundleView View(string scopeKind, string? scopeRef, params object[] layers) => new(
        Guid.NewGuid(), 1, "h", "lab", scopeKind, scopeRef, null, null, "c", "e", "POLICY", "DRAFT", Obj(layers), Obj(new { }), null, null, null,
        "alice", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "etag", null);

    private static object Layer(string kind, string? @ref, int ordinal, JsonElement content) => new { kind, @ref, ordinal, content };
    private static object Factory() => Layer("FACTORY", null, 0, FactoryLayers.Factory());

    /// <summary>A pack property whose value differs from the factory's, other than <paramref name="not"/>.</summary>
    private static JsonProperty Differing(params string[] not)
    {
        var factory = FactoryLayers.Factory();
        return FactoryLayers.Profile(Pack)!.Value.EnumerateObject()
            .First(p => p.Name != SiteProp && !not.Contains(p.Name) && (!factory.TryGetProperty(p.Name, out var f) || f.GetRawText() != p.Value.GetRawText()));
    }

    private static string Raw(JsonElement e, string name) => e.TryGetProperty(name, out var v) ? v.GetRawText() : "null";

    /// <summary>The properties whose value differs between Now and New - what the Check step lists.</summary>
    private static List<string> Changes(BundleView b, string? loopProfile = null)
    {
        var pack = BundleBelow.PackFor(b, loopProfile);
        var below = BundleBelow.Below(b, pack)!.Value;
        var effective = BundleBelow.Effective(b, pack)!.Value;
        var names = below.EnumerateObject().Select(p => p.Name).Union(effective.EnumerateObject().Select(p => p.Name));
        return names.Where(n => Raw(below, n) != Raw(effective, n)).OrderBy(n => n, StringComparer.Ordinal).ToList();
    }

    [Fact]
    public void A_type_version_started_from_the_plants_version_lists_only_its_own_edits()
    {
        // what CreateDraftAsync builds from a plant parent: the plant's layers and an empty PROFILE layer - no copy of the pack
        var plant = Layer("SITE", "lab", 1, Props((SiteProp, 2.75)));
        Changes(View("PROFILE", Pack, Factory(), plant, Layer("PROFILE", Pack, 2, Props()))).Should().BeEmpty("nothing was edited");

        var edited = Differing();
        var b = View("PROFILE", Pack, Factory(), plant, Layer("PROFILE", Pack, 2, Props((edited.Name, 0.123))));
        Changes(b).Should().Equal(edited.Name);
        var pack = BundleBelow.PackFor(b);
        Raw(BundleBelow.Below(b, pack)!.Value, edited.Name).Should().Be(edited.Value.GetRawText(), "Now is the pack value the type's loops run");
        Raw(BundleBelow.Effective(b, pack)!.Value, edited.Name).Should().Be("0.123");
        Raw(BundleBelow.Below(b, pack)!.Value, SiteProp).Should().Be("2.75", "the plant's value lies over the pack");
    }

    [Fact]
    public void A_type_version_built_from_the_factory_layers_lists_only_its_own_edits()
    {
        // FactoryLayers.InitialLayers: the PROFILE layer is a copy of the pack, edited on top
        var edited = Differing();
        var copy = JsonNode.Parse(FactoryLayers.Profile(Pack)!.Value.GetRawText())!.AsObject();
        copy[edited.Name] = 0.123;
        var b = View("PROFILE", Pack, Factory(), Layer("SITE", "lab", 1, Props()), Layer("PROFILE", Pack, 2, JsonDocument.Parse(copy.ToJsonString()).RootElement.Clone()));
        Changes(b).Should().Equal(edited.Name);
    }

    [Fact]
    public void Resetting_a_pack_value_falls_back_to_the_pack_as_in_the_engine()
    {
        var reset = Differing();
        var b = View("PROFILE", Pack, Factory(), Layer("SITE", "lab", 1, Props()), Layer("PROFILE", Pack, 2, Props((reset.Name, EffectiveConfigResolver.ResetToInherited))));
        Changes(b).Should().BeEmpty("the engine skips the sentinel and keeps the pack value");
    }

    [Fact]
    public void A_loop_version_without_a_type_layer_takes_its_pack_from_the_registry()
    {
        var edited = Differing();
        var b = View("LOOP", "FIC10302", Factory(), Layer("SITE", "lab", 1, Props()), Layer("LOOP", "FIC10302", 3, Props((edited.Name, 0.123))));
        BundleBelow.PackFor(b).Should().BeNull("no PROFILE layer names one");
        BundleBelow.PackFor(b, Pack).Should().Be(Pack);
        Changes(b, Pack).Should().Equal(edited.Name);
        Raw(BundleBelow.Below(b, Pack)!.Value, edited.Name).Should().Be(edited.Value.GetRawText());
    }

    [Fact]
    public void A_loop_version_reads_its_pack_from_its_type_layer_when_the_registry_has_none()
    {
        var b = View("LOOP", "FIC10302", Factory(), Layer("SITE", "lab", 1, Props()), Layer("PROFILE", Pack, 2, Props((SiteProp, 3.5))), Layer("LOOP", "FIC10302", 3, Props()));
        BundleBelow.PackFor(b).Should().Be(Pack);
        Changes(b).Should().BeEmpty();
        Raw(BundleBelow.Below(b, Pack)!.Value, SiteProp).Should().Be("3.5");
    }

    [Fact]
    public void A_plant_version_keeps_the_factory_alone_and_lists_its_own_edits()
    {
        var b = View("SITE", null, Factory(), Layer("SITE", "lab", 1, Props((SiteProp, 2.75))));
        BundleBelow.PackFor(b).Should().BeNull("each loop type has its own pack");
        Changes(b).Should().Equal(SiteProp);
        var differing = Differing();
        var factory = FactoryLayers.Factory();
        Raw(BundleBelow.Below(b, null)!.Value, differing.Name).Should().Be(factory.TryGetProperty(differing.Name, out var f) ? f.GetRawText() : "null");
    }

    [Fact]
    public void An_unknown_scope_has_nothing_below()
    {
        BundleBelow.Below(View("FACTORY", null, Factory()), null).Should().BeNull();
        BundleBelow.Effective(View("WHATEVER", null, Factory()), null).Should().BeNull();
    }

    [Fact]
    public void Same_result_lists_the_kept_diagnoses_most_windows_first()
    {
        var counts = new Dictionary<string, int> { ["SLUGGISH"] = 2, ["HEALTHY"] = 10, [""] = 1, ["AGGRESSIVE"] = 2 };

        var list = ShadowComparison.Unchanged(counts);

        list.Select(c => (c.Diagnosis, c.Windows)).Should().Equal(
            ("HEALTHY", 10), ("AGGRESSIVE", 2), ("SLUGGISH", 2), (null, 1));
    }
}
