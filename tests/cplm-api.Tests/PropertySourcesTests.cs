// CHG-224: the source map (Config/property-sources.json) - exactly one entry per catalogue property, the owner's editable rule, plain
// wording - and the per-loop values GET /configuration/effective works out from it, checked in memory (no database): a flow loop on
// 0-200 kg/h sampled every 5 s with a 4 s dead time, and the same loop without a PV range or any data.
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentAssertions;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class PropertySourcesTests
{
    private static readonly PropertySources Map = PropertySources.Current;

    [Fact]
    public void Every_catalogue_property_has_exactly_one_source_and_no_source_names_anything_else()
    {
        Map.Duplicates.Should().BeEmpty("a property listed twice would silently take the last entry");
        var catalogue = PropertyCatalogue.Current.Properties.Select(p => p.Property).ToList();
        catalogue.Where(p => !Map.Entries.ContainsKey(p)).Should().BeEmpty("every catalogue property needs a source");
        Map.Entries.Keys.Where(k => !catalogue.Contains(k)).Should().BeEmpty("a source for a property the catalogue does not have");
        Map.Entries.Should().HaveCount(165);
    }

    [Fact]
    public void Kind_editable_and_set_in_agree_and_every_resolver_and_link_is_complete()
    {
        var setIn = new Dictionary<string, string>
        {
            ["EDITABLE"] = "GATE_CONFIGURATION", ["DECISION"] = "GATE_CONFIGURATION", ["REGISTRY"] = "LOOP_REGISTRY", ["RETENTION"] = "EVIDENCE_RETENTION",
            ["AUTOMATIC_FIXED"] = "AUTOMATIC", ["AUTOMATIC_DERIVED"] = "AUTOMATIC", ["NOT_APPLIED"] = "NOT_APPLIED",
        };
        foreach (var e in Map.Entries.Values)
        {
            PropertySources.Kinds.Should().Contain(e.Kind, e.Property);
            e.Editable.Should().Be(e.Kind is "EDITABLE" or "DECISION", e.Property);
            e.SetIn.Should().Be(setIn[e.Kind], e.Property);
            (e.RegistryField is not null).Should().Be(e.SetIn == "LOOP_REGISTRY", e.Property + ": a registry property names its field (and only those)");
            if (e.Follows is not null) Map.Entries[e.Follows].Kind.Should().Be("EDITABLE", e.Property + " follows an editable property");
            if (!e.Editable || e.Resolver is not null) e.Basis.Should().NotBeEmpty(e.Property + " needs a sentence");
        }
    }

    [Fact]
    public void The_owner_rule_editable_is_what_the_engine_reads_less_the_copies_and_unread_roles()
    {
        var counts = Map.Entries.Values.GroupBy(e => e.Kind).ToDictionary(g => g.Key, g => g.Count());
        counts.Should().BeEquivalentTo(new Dictionary<string, int>
        {
            ["EDITABLE"] = 61, ["DECISION"] = 2, ["REGISTRY"] = 3, ["RETENTION"] = 17, ["AUTOMATIC_FIXED"] = 43, ["AUTOMATIC_DERIVED"] = 17, ["NOT_APPLIED"] = 22,
        });
        foreach (var p in new[] { "G6.period_min_s", "G6.period_max_s", "G7.min_accepted_cycles", "G9.min_accepted_cycles" })
        {
            Map.Entries[p].Kind.Should().Be("AUTOMATIC_DERIVED", p);
            Map.Entries[p].Follows.Should().StartWith("G5.", p + " follows G5");
        }
        foreach (var p in new[] { "G7.role", "G8.role", "G10.role" }) Map.Entries[p].Kind.Should().Be("NOT_APPLIED", p);
        foreach (var p in new[] { "G2r.pv_region_min", "G2r.pv_region_max", "G2.stability_band_pv_eu", "G9.role" }) Map.Entries[p].Kind.Should().Be("EDITABLE", p);
        foreach (var p in new[] { "G10.limit_dwell_warn_s", "G12.lambda_s" }) Map.Entries[p].Kind.Should().Be("DECISION", p);
        Map.Entries.Values.Where(e => e.Property.EndsWith(".evidence_retention_days")).Should().HaveCount(17).And.OnlyContain(e => e.Kind == "RETENTION");
        Map.Entries.Values.Where(e => e.Kind == "REGISTRY").Select(e => e.Property).Should().BeEquivalentTo("G0.acquisition_mode", "G3.objective_type", "G13.peer_binding_ids");
        UnsupportedInBuild.Reasons.Keys.Where(Map.IsEditable).Should().BeEmpty("nothing the engine does not read can be edited");
        // every other editable property is one the engine reads: not declared unsupported, and a flink consumer in the catalogue
        foreach (var e in Map.Entries.Values.Where(e => e.Editable))
            PropertyCatalogue.Current[e.Property].Consumers.Should().Contain(c => c.StartsWith("flink:"), e.Property);
    }

    [Fact]
    public void The_wording_is_plain_and_a_refusal_says_where_the_value_is_changed()
    {
        var forbidden = new Regex(@"\b(build|release|version|catalogue|consumer|NO_VALUE|unset|FACTORY|hash)\b", RegexOptions.IgnoreCase);
        var texts = Map.Entries.Values.SelectMany(e => e.Basis.Values.Append(Map.WhereChanged(e.Property)))
            .Concat(Map.Levels.Values).Concat(Map.EditableBasis.Values).Append(Map.DecidedBasis);
        texts.Where(t => forbidden.IsMatch(t)).Should().BeEmpty();
        Map.Refusal("G3.objective_type").Should().Be("'G3.objective_type' cannot be changed in Gate Configuration: the control goal is set in Loop Registry (Classification, Control goal)");
        Map.Refusal("G5.evidence_retention_days").Should().Contain("evidence retention policy");
        Map.Refusal("G6.period_min_s").Should().Contain("G5 shortest period");
        Map.Refusal("G8.surrogate_repetitions").Should().Contain("does not perform this check");
    }

    [Fact]
    public void The_cleanup_drops_values_that_change_nothing_from_every_layer_but_factory()
    {
        var layers = FactoryLayers.InitialLayers("s", "LOOP", "L1", "FLOW_FAST_SELF_REG");
        var profile = layers.EnumerateArray().Single(l => l.GetProperty("kind").GetString() == "PROFILE").GetProperty("content");
        profile.TryGetProperty("G6.period_min_s", out _).Should().BeTrue("the class pack restates the G6 copy");
        var clean = Map.WithoutNonEditable(layers);
        foreach (var l in clean.EnumerateArray())
        {
            var content = l.GetProperty("content");
            if (l.GetProperty("kind").GetString() == "FACTORY")
                content.GetRawText().Should().Be(layers[0].GetProperty("content").GetRawText(), "FACTORY is kept as it is");
            else
                content.EnumerateObject().Where(p => !Map.IsEditable(p.Name)).Should().BeEmpty(l.GetProperty("kind").GetString());
            l.GetProperty("content_hash").GetString().Should().Be(CanonicalJson.Sha256(content));
        }
        var cleanProfile = clean.EnumerateArray().Single(l => l.GetProperty("kind").GetString() == "PROFILE").GetProperty("content");
        profile.EnumerateObject().Where(p => Map.IsEditable(p.Name)).Should().OnlyContain(p => cleanProfile.GetProperty(p.Name).GetRawText() == p.Value.GetRawText(),
            "everything the engine reads stays");
        Map.WithoutNonEditable(clean).GetRawText().Should().Be(clean.GetRawText(), "a clean stack is returned as it is");
    }

    // ── the per-loop values, in memory ──────────────────────────────────────
    private static CpmLoopDto Loop(CpmEngineeringRange? engineering, params string[] links) =>
        new("UT_FIC1", null, "UT_FIC1", "s", null, null, "FIC", "LOW", true, true, new Dictionary<string, string>(), Array.Empty<string>(),
            links.Select(l => new CpmLoopLinkDto(l, "INTERACTS", "PLANT_MODEL")).ToList(), false, null, engineering);

    private static Dictionary<string, EffectiveEntry> Entries(CpmLoopDto loop, LoopValueFacts facts)
    {
        var layers = new List<ConfigLayer> { new("FACTORY", null, FactoryLayers.Factory()), new("PROFILE", "FLOW_FAST_SELF_REG", FactoryLayers.Profile("FLOW_FAST_SELF_REG")!.Value) };
        var resolved = EffectiveConfigResolver.Resolve(layers);
        return EffectiveEntries.Build(new EffectiveEntries.Context(loop, "FLOW_FAST_SELF_REG", resolved, null, facts)).ToDictionary(e => e.Property);
    }

    private static readonly LoopValueFacts Lab = new(5.0, 4.0, new RetentionFacts(6, 2L << 30,
        new Dictionary<string, int?> { ["STANDARD"] = 3, ["EPISODE"] = 2, ["EVIDENCE_ARCHIVE"] = 30, ["RESPONSE"] = 90, ["RESPONSE_CHARTS"] = 30, ["PINNED"] = null }));

    private static double Num(EffectiveEntry e) => e.Value switch { double d => d, JsonElement j => j.GetDouble(), _ => throw new InvalidOperationException(e.Property + ": " + e.Value) };

    [Fact]
    public void A_flow_loop_on_0_200_gets_its_scaled_and_worked_out_values_in_plain_words()
    {
        var e = Entries(Loop(new CpmEngineeringRange(0, 100, 0, 200, "kg/h"), "UT_FIC2"), Lab);
        e.Should().HaveCount(165);
        e.Values.Should().OnlyContain(x => !x.Basis.Contains('{') && x.Basis.Length > 0, "every placeholder is filled");
        e.Values.Where(x => !x.Editable).Should().OnlyContain(x => x.Configured == null && x.Level == null);

        (Num(e["G2.stability_band_pv_eu"]), e["G2.stability_band_pv_eu"].Basis, e["G2.stability_band_pv_eu"].Unit).Should().Be((2.0, "2.0 kg/h - 1 % of the PV range", "kg/h"));
        e["G2.stability_band_pv_eu"].Configured.Should().BeNull();
        (Num(e["G12.step_min_input_eu"]), e["G12.step_min_input_eu"].Basis, e["G12.step_min_input_eu"].Level).Should().Be((2.0, "2.0 kg/h - 1.0 per 100 of the PV range", "FACTORY"));
        e["G12.step_min_input_eu"].Configured!.Value.GetDouble().Should().Be(1.0);
        (Num(e["G12.settling_abs_band_pv_eu"]), e["G12.settling_abs_band_pv_eu"].Basis).Should().Be((0.2, "0.2 kg/h - 0.1 per 100 of the PV range"));
        (Num(e["G12.gain_abs_max"]), e["G12.gain_abs_max"].Basis, e["G12.gain_abs_max"].Unit).Should().Be((2000.0, "2,000 kg/h per % - 1,000 per 100 of the PV range", "kg/h per %"));
        (Num(e["G10.limit_dwell_warn_s"]), e["G10.limit_dwell_warn_s"].Basis).Should().Be((150.0, "Not decided - 150 s used (30 samples at 5.0 s)"));
        (Num(e["G12.lambda_s"]), e["G12.lambda_s"].Basis).Should().Be((4.0, "Not decided - advice uses the dead time (4.0 s)"));
        (Num(e["G0.max_gap_s"]), e["G0.max_gap_s"].Basis).Should().Be((7.5, "A gap is a pause over 7.5 s (1.5 × the 5.0 s sample interval); a response test stops after 60 s without data"));
        Num(e["G0.alignment_tolerance_s"]).Should().Be(3.75);
        (Num(e["G5.acf_lag_max_s"]), e["G5.acf_lag_max_s"].Basis).Should().Be((10000.0, "Up to 2.8 h (2,000 samples) - fixed by the method"));
        e["G8.max_lag_s"].Basis.Should().Be("Up to 1,000 s (200 samples) - fixed by the method");
        (Num(e["G3.error_band_abs_pv_eu"]), e["G3.error_band_abs_pv_eu"].Basis).Should().Be((1.0, "±1.0 kg/h - 0.5 % of the PV range"));
        (Num(e["G12.validation_rmse_max_pv_eu"]), Num(e["G2.ramp_min_pv_eu_per_s"]), e["G2.ramp_min_pv_eu_per_s"].Unit).Should().Be((0.3, 0.04, "kg/h/s"));
        e["G2.step_min_pv_eu"].Basis.Should().Be("2.0 kg/h or 4 × the PV noise, whichever is larger - from the response test settings");
        (Num(e["G6.period_min_s"]), e["G6.period_min_s"].Basis).Should().Be((10.0, "Same as G5 shortest period: 10 s"));
        e["G7.min_accepted_cycles"].Basis.Should().Be("Same as G5: 5 complete cycles");
        e["G3.ewma_alpha"].Basis.Should().Be("Not used for the error check; corner detection smooths over 5 samples");
        e["G5.signal_role"].Value.Should().Be("OP");
        e["G12.model_families"].Basis.Should().Be("First order with dead time - from the loop type");
        e["G14.allowed_evidence_types"].Basis.Should().Be("Valve not following the output by 5 % for 60 s - the only proof accepted");
        e["G13.peer_binding_ids"].Basis.Should().Be("UT_FIC2 - from the Plant model");
        (e["G3.objective_type"].Value, e["G3.objective_type"].Basis, e["G3.objective_type"].RegistryField).Should().Be(("TIGHT", "Tight, from the loop type - set in Loop Registry", "model.objectiveType"));
        e["G0.acquisition_mode"].Basis.Should().Be("Periodic - set in Loop Registry");
        e["G0.evidence_retention_days"].Basis.Should().Be("Live 6 hours · rebuilt evidence 3 days - evidence retention");
        e["G9.evidence_retention_days"].Basis.Should().Be("Live 6 hours · daily archive 30 days · diagnosis episodes 2 days after they close - evidence retention");
        e["G12.evidence_retention_days"].Basis.Should().Be("Charts 30 days · test results 90 days · rejected tests 90 days - evidence retention");
        (e["G4.activity_warn_ratio"].Basis, e["G4.activity_warn_ratio"].Level).Should().Be(("3.0 - set for this loop type", "PROFILE"));
        e["G2r.pv_region_min"].Basis.Should().Be("Not limited - set a region in Per-loop settings");
        e["G9.role"].Basis.Should().Be("Supporting - set for this loop type");
        e["G7.role"].Basis.Should().Be("Not used - the part this check plays in a diagnosis is fixed");
    }

    [Fact]
    public void Without_a_pv_range_or_data_the_values_say_what_is_assumed()
    {
        var e = Entries(Loop(null), LoopValueFacts.None);
        e.Values.Should().OnlyContain(x => !x.Basis.Contains('{'));
        (Num(e["G2.stability_band_pv_eu"]), e["G2.stability_band_pv_eu"].Basis, e["G2.stability_band_pv_eu"].Unit)
            .Should().Be((1.0, "1.0 - range assumed 0-100; declare the PV range in Loop Registry", (string?)null));
        (Num(e["G12.step_min_input_eu"]), e["G12.step_min_input_eu"].Basis).Should().Be((1.0, "1.0 - range assumed 0-100; declare the PV range in Loop Registry"));
        (e["G10.limit_dwell_warn_s"].Value, e["G10.limit_dwell_warn_s"].Basis).Should().Be(((object?)null, "Not decided - 30 samples at the loop's sample interval are used"));
        e["G12.lambda_s"].Basis.Should().Be("Not decided - no tuning advice until a validated model gives the dead time");
        e["G0.max_gap_s"].Basis.Should().StartWith("A gap is a pause over 1.5 × the sample interval");
        e["G13.peer_binding_ids"].Basis.Should().Be("None - link loops in the Plant model");
        e["G12.evidence_retention_days"].Basis.Should().Be("Charts without a time limit · test results without a time limit · rejected tests without a time limit - evidence retention");
        e["G9.evidence_retention_days"].Basis.Should().Contain("daily archive 30 days").And.Contain("diagnosis episodes 90 days");
    }
}
