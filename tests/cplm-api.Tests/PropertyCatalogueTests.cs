// v2.5 Task 3A.1 (spec v6 §5.1, R16 / R18): the 165-property catalogue is code the service carries -
// every id and property once, every gate present, every property with a consumer, typed defaults and
// validation, a dependency graph without cycles, and a content hash the Flink jobs and the UI report
// identically (the runtime parity check of /capabilities).
using FluentAssertions;
using Traverse.CplmApi.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class PropertyCatalogueTests
{
    [Fact]
    public void Carries_the_165_properties_once_with_a_content_hash()
    {
        var c = PropertyCatalogue.Current;
        c.Count.Should().Be(165);
        c.Properties.Select(p => p.Id).Distinct().Count().Should().Be(165);
        c.Properties.Select(p => p.Property).Distinct().Count().Should().Be(165);
        c.CatalogueHash.Should().MatchRegex("^[0-9a-f]{64}$");
        c.CatalogueHash.Should().Be(PropertyCatalogue.HashOf(c.Properties), because: "the hash is recomputable from the entries");
    }

    [Fact]
    public void Every_gate_appears_and_every_property_names_a_consumer_and_a_change_class()
    {
        var c = PropertyCatalogue.Current;
        c.Properties.Select(p => p.Gate).Distinct().Should().BeEquivalentTo(new[] { "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15" });
        foreach (var p in c.Properties)
        {
            p.Consumers.Should().NotBeEmpty(p.Property);
            p.ChangeClass.Should().BeOneOf("POLICY", "STATE_BOUNDARY", "DEPLOYMENT");
            p.Type.Should().BeOneOf("enum", "number", "integer", "boolean", "string_array");
            p.Property.Should().StartWith(p.Gate + ".");
        }
        c.Properties.Count(p => p.Default is null).Should().Be(106, because: "106 properties are 'Commissioning required' in the spec");
        c["G12.noise_multiplier"].Default.Should().Be(5.0);
        c["G14.require_independent_review"].Default.Should().Be(true);
        c["G6.segment_samples"].Default.Should().Be(92 + 164);
    }

    [Fact]
    public void Enum_and_range_validation_are_typed()
    {
        var c = PropertyCatalogue.Current;
        c["G0.mode"].EnumValues.Should().Equal("OPERATIONAL", "OBSERVE_ONLY", "SHADOW", "DISABLED");
        c["G5.period_min_s"].Minimum.Should().Be(0.001);
        c["G5.period_min_s"].Maximum.Should().Be(31_536_000);
        c["G13.peer_binding_ids"].MinItems.Should().Be(0);
        c["G13.peer_binding_ids"].MaxItems.Should().Be(200);
        c["G12.settling_relative_band"].Unit.Should().Be("fraction");
    }

    [Fact]
    public void The_dependency_graph_is_acyclic_and_promotes_change_classes_through_dependants()
    {
        var c = PropertyCatalogue.Current;
        c.HasCycle().Should().BeFalse();
        // G2.stability_band_pv_eu is POLICY, but the G2 event detector's step threshold depends on it
        c["G2.stability_band_pv_eu"].ChangeClass.Should().Be("POLICY");
        c.EffectiveChangeClass(new[] { "G2.stability_band_pv_eu" }).Should().Be("STATE_BOUNDARY");
        c.EffectiveChangeClass(new[] { "G4.activity_warn_ratio" }).Should().Be("POLICY");
        c.EffectiveChangeClass(new[] { "G12.model_families" }).Should().Be("STATE_BOUNDARY");
        c.Dependants("G5.min_complete_cycles").Should().Contain(new[] { "G7.min_accepted_cycles", "G9.min_accepted_cycles" });
    }

    [Fact]
    public void An_unknown_property_is_refused_by_name()
    {
        var c = PropertyCatalogue.Current;
        c.TryGet("G99.nothing", out _).Should().BeFalse();
        var act = () => c["G99.nothing"];
        act.Should().Throw<KeyNotFoundException>().WithMessage("*G99.nothing*");
    }
}
