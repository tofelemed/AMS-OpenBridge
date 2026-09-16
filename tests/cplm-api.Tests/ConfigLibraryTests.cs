// v2.5 Task 3B.2 (spec v6 §5.3-5.5; NR-047..050, NR-055): the pure configuration library - RFC 8785
// canonical JSON (the content hash), the deterministic layer merge (FACTORY -> SITE -> one PROFILE ->
// LOOP -> one REGIME), the change classifier (promotion through the catalogue graph) and the bundle
// validator (typed finite values, unit guards, forbidden combinations, execution-plan capacity).
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ConfigLibraryTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Canonical_json_follows_rfc_8785()
    {
        // key order, no whitespace, ES6 number formatting, minimal string escapes
        CanonicalJson.Canonicalize(J("""{"b":1,"a":{"y":true,"x":null},"c":[3,1.0,2.5e3,1e21,0.0000001]}""")).Should().Be("""{"a":{"x":null,"y":true},"b":1,"c":[3,1,2500,1e+21,1e-7]}""");
        CanonicalJson.Canonicalize(J("{\"€\":\"a\\u000bb\",\"é\":\"tab\\tq\\\"\",\"1\":\"x\"}")).Should().Be("{\"1\":\"x\",\"é\":\"tab\\tq\\\"\",\"€\":\"a\\u000bb\"}");
        CanonicalJson.Sha256(J("""{"a":1}""")).Should().Be(CanonicalJson.Sha256(J("""{ "a" : 1.0 }""")), because: "1 and 1.0 canonicalise to the same text");
        CanonicalJson.Sha256(J("""{"a":1}""")).Should().MatchRegex("^[0-9a-f]{64}$");
    }

    private static readonly JsonElement Factory = J("""{"G5.period_min_s": 60, "G5.period_max_s": 3600, "G5.min_complete_cycles": 5, "G4.activity_warn_ratio": 3.0, "G4.activity_high_ratio": 8.0, "G3.objective_type": "TIGHT_TRACKING"}""");

    [Fact]
    public void Nr047_a_partial_loop_override_keeps_every_unrelated_commissioned_value_and_names_its_source()
    {
        var layers = new[]
        {
            new ConfigLayer("FACTORY", null, Factory),
            new ConfigLayer("SITE", "hdpe", J("""{"G5.period_max_s": 7200}""")),
            new ConfigLayer("PROFILE", "TEMP_SLOW_SELF_REG", J("""{"G5.period_min_s": 120}""")),
            new ConfigLayer("LOOP", "TIC10305", J("""{"G4.activity_warn_ratio": 4.5}""")),
        };
        var r = EffectiveConfigResolver.Resolve(layers);
        r.Errors.Should().BeEmpty();
        r.Properties["G4.activity_warn_ratio"].GetDouble().Should().Be(4.5);
        r.Properties["G4.activity_high_ratio"].GetDouble().Should().Be(8.0, because: "unrelated commissioned values are untouched");
        r.Properties["G5.period_min_s"].GetDouble().Should().Be(120);
        r.Properties["G5.period_max_s"].GetDouble().Should().Be(7200);
        r.Sources["G4.activity_warn_ratio"].Should().Be("LOOP");
        r.Sources["G5.period_max_s"].Should().Be("SITE");
        r.Sources["G4.activity_high_ratio"].Should().Be("FACTORY");
        // repeated resolution of the same layers gives the same hash; another loop's override never leaks
        EffectiveConfigResolver.Resolve(layers).Hash.Should().Be(r.Hash);
        var other = EffectiveConfigResolver.Resolve(new[] { new ConfigLayer("FACTORY", null, Factory), new ConfigLayer("LOOP", "FIC10302", J("""{"G4.activity_warn_ratio": 9}""")) });
        other.Properties["G4.activity_warn_ratio"].GetDouble().Should().Be(9);
        other.Hash.Should().NotBe(r.Hash);
    }

    [Fact]
    public void Reset_to_inherited_removes_an_override_and_explicit_null_is_refused_where_the_catalogue_forbids_it()
    {
        var r = EffectiveConfigResolver.Resolve(new[]
        {
            new ConfigLayer("FACTORY", null, Factory),
            new ConfigLayer("SITE", "hdpe", J("""{"G5.period_max_s": 7200}""")),
            new ConfigLayer("LOOP", "TIC10305", J("""{"G5.period_max_s": "RESET_TO_INHERITED"}""")),
        });
        r.Properties["G5.period_max_s"].GetDouble().Should().Be(7200, because: "the loop reset falls back to the site value");
        r.Sources["G5.period_max_s"].Should().Be("SITE");
        var bad = EffectiveConfigResolver.Resolve(new[] { new ConfigLayer("FACTORY", null, Factory), new ConfigLayer("LOOP", "L", J("""{"G5.period_min_s": null}""")) });
        bad.Errors.Should().ContainSingle().Which.Should().Contain("G5.period_min_s").And.Contain("null");
    }

    [Fact]
    public void Two_profile_or_two_regime_layers_are_ambiguous_and_an_unknown_field_is_named()
    {
        var two = EffectiveConfigResolver.Resolve(new[] { new ConfigLayer("FACTORY", null, Factory), new ConfigLayer("PROFILE", "A", J("{}")), new ConfigLayer("PROFILE", "B", J("{}")) });
        two.Errors.Should().ContainSingle().Which.Should().Contain("PROFILE_AMBIGUOUS");
        var unknown = EffectiveConfigResolver.Resolve(new[] { new ConfigLayer("FACTORY", null, Factory), new ConfigLayer("SITE", "s", J("""{"G5.perid_min_s": 3}""")) });
        unknown.Errors.Should().ContainSingle().Which.Should().Contain("G5.perid_min_s").And.Contain("not a catalogue property");
        // a required objective left unset is a stated NO_VALUE, not an error
        var noObjective = EffectiveConfigResolver.Resolve(new[] { new ConfigLayer("FACTORY", null, J("""{"G5.period_min_s": 60}""")) });
        noObjective.Errors.Should().BeEmpty();
        noObjective.Properties.Should().ContainKey("G3.objective_type").WhoseValue.ValueKind.Should().Be(JsonValueKind.Null);
        noObjective.Sources["G3.objective_type"].Should().Be("NO_VALUE");
    }

    [Fact]
    public void The_classifier_promotes_a_policy_threshold_read_by_an_event_detector_to_state_boundary()
    {
        ChangeClassifier.Classify(new[] { "G4.activity_warn_ratio" }).Should().Be("POLICY");
        ChangeClassifier.Classify(new[] { "G2.stability_band_pv_eu" }).Should().Be("STATE_BOUNDARY");
        ChangeClassifier.Classify(new[] { "G4.activity_warn_ratio", "G6.segment_samples" }).Should().Be("STATE_BOUNDARY");
        ChangeClassifier.Classify(Array.Empty<string>()).Should().Be("POLICY");
        ChangeClassifier.Diff(J("""{"a":1,"b":2,"c":[1]}"""), J("""{"a":1,"b":3,"c":[1,2],"d":true}""")).Should().BeEquivalentTo(new[] { "b", "c", "d" });
    }

    [Fact]
    public void Nr049_non_finite_out_of_range_inverted_and_impossible_values_are_refused_naming_the_field()
    {
        var errors = BundleValidator.ValidateProperties(J("""
            {"G5.period_min_s": 3600, "G5.period_max_s": 60, "G12.settling_relative_band": 50, "G6.overlap_fraction": "NaN", "G0.mode": "TURBO",
             "G13.peer_binding_ids": ["a","b"], "G14.require_independent_review": "yes", "G6.segment_samples": 12.5, "G5.min_complete_cycles": 2, "G5.period_max_s2": 1}
            """));
        errors.Should().Contain(e => e.Contains("G5.period_max_s") && e.Contains("period_min_s"), because: "an inverted range is refused");
        errors.Should().Contain(e => e.Contains("G12.settling_relative_band") && e.Contains("fraction"), because: "a percent in a fraction field is refused");
        errors.Should().Contain(e => e.Contains("G6.overlap_fraction") && e.Contains("number"));
        errors.Should().Contain(e => e.Contains("G0.mode") && e.Contains("TURBO"));
        errors.Should().Contain(e => e.Contains("G14.require_independent_review") && e.Contains("boolean"));
        errors.Should().Contain(e => e.Contains("G6.segment_samples") && e.Contains("integer"));
        errors.Should().Contain(e => e.Contains("G5.period_max_s2") && e.Contains("not a catalogue property"), because: "NR-048: an unknown field is named");
        errors.Should().NotContain(e => e.Contains("G13.peer_binding_ids"));
        errors.Should().NotContain(e => e.Contains("G5.min_complete_cycles"));
        // G5 capacity (spec §6.3): five cycles of a six-hour period do not fit 24 h of retention
        BundleValidator.ValidateProperties(J("""{"G5.period_min_s": 600, "G5.period_max_s": 21600, "G5.min_complete_cycles": 5}"""))
            .Should().ContainSingle().Which.Should().Contain("G5 UNSUPPORTED_CAPACITY").And.Contain("24 h");
    }

    [Fact]
    public void Nr050_forbidden_combinations_and_integrity_bypasses_are_refused()
    {
        var errors = BundleValidator.ValidateProperties(J("""{"G9.role": "PRIMARY", "G8.method": "BICOHERENCE_V1", "G14.allowed_evidence_types": ["VP_PRESENCE"], "G6.estimator": "LEGACY_DFT"}"""));
        errors.Should().Contain(e => e.Contains("G9.role") && e.Contains("PRIMARY"), because: "geometry can never be decisive");
        errors.Should().Contain(e => e.Contains("G8.method") && e.Contains("DEPLOYMENT_REQUIRED"));
        errors.Should().Contain(e => e.Contains("G14.allowed_evidence_types") && e.Contains("VP_PRESENCE"), because: "VP presence is not a proof type");
        errors.Should().Contain(e => e.Contains("G6.estimator") && e.Contains("DEPLOYMENT_REQUIRED"));
        BundleValidator.ValidateProperties(J("""{"G9.role": "SUPPORTING", "G14.allowed_evidence_types": ["NON_FOLLOWING_RECORD", "APPROVED_TEST_RECORD"]}""")).Should().BeEmpty();
    }

    [Fact]
    public void Nr055_an_execution_plan_outside_the_compiled_capacity_is_deployment_required_and_the_installed_plan_validates()
    {
        var reasons = BundleValidator.ValidateExecutionPlan(J("""{"plan_version":"1.0.0","scheduler_mode":"BOUNDED_KEYED","horizons":[{"horizon_id":"long_30h","tier":"long","duration_s":108000,"slide_s":900}],"assignments":[],"capacity_identity":{"max_retention_s":1,"supported_slides_s":[1],"max_active_horizons":1}}"""));
        reasons.Should().Contain(r => r.StartsWith("DEPLOYMENT_REQUIRED") && r.Contains("scheduler_mode"));
        reasons.Should().Contain(r => r.StartsWith("DEPLOYMENT_REQUIRED") && r.Contains("long_30h"));
        BundleValidator.ValidateExecutionPlan(ExecutionPlans.Installed()).Should().BeEmpty();
        BundleValidator.ValidateExecutionPlan(J("null")).Should().ContainSingle();
    }

    [Fact]
    public void Properties_no_running_job_reads_are_reported_not_refused()
    {
        var report = BundleValidator.Report(J("""{"G0.jitter_warn_fraction": 0.2, "G5.period_min_s": 60, "G5.period_max_s": 3600}"""), ExecutionPlans.Installed());
        report.Errors.Should().BeEmpty();
        report.NotReadByBuild.Should().ContainKey("G0.jitter_warn_fraction");
        report.NotReadByBuild.Should().NotContainKey("G5.period_min_s");
    }
}
