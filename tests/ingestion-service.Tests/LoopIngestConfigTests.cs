using Traverse.IngestionService.Models;
using Traverse.IngestionService.Services;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopIngestConfigTests
{
    [Fact]
    public void Resolve_applies_defaults_when_empty()
    {
        var s = new LoopIngestConfig().Resolve();
        Assert.Equal("{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}", s.TopicTemplate);
        Assert.Equal(5, s.GridSeconds);
        Assert.Equal(300, s.FutureSkewMaxSeconds);
        Assert.Equal(60, s.RegistryRefreshSeconds);
        Assert.Equal("pv", s.ParamRoles["PV"]);
        Assert.Equal("gw", s.ParamRoles["gw"]); // case-insensitive keys
        Assert.Equal("vp", s.ParamRoles["VP"]); // positioner feedback flows with no config change
        Assert.Empty(s.ModeValueMap);
    }

    [Fact]
    public void Resolve_keeps_explicit_values()
    {
        var s = new LoopIngestConfig
        {
            TopicTemplate = "{ns}/{site}/{fcs}/{class}/{loop}/PIDParams/{param}",
            GridSeconds = 10,
            ParamRoles = new() { ["PV"] = "pv", ["SP"] = "sp", ["OP"] = "op", ["MODE"] = "mode" },
            ModeValueMap = new() { ["4"] = "AUT" },
        }.Resolve();
        Assert.Equal(10, s.GridSeconds);
        Assert.Equal("AUT", s.ModeValueMap["4"]);
        // The configured map OVERLAYS the built-in one. It used to replace it, so the
        // natural edit — "just add VP" — un-mapped PV/SP/OP/MODE and every loop on the
        // source stopped producing tuples (verified live 2026-09-10).
        Assert.True(s.ParamRoles.ContainsKey("GW"));
        Assert.Equal("vp", s.ParamRoles["VP"]);
    }

    [Fact]
    public void Partial_param_roles_adds_to_the_defaults()
    {
        var s = new LoopIngestConfig { ParamRoles = new() { ["POS"] = "vp" } }.Resolve();
        Assert.Equal("vp", s.ParamRoles["POS"]);   // the new leaf
        Assert.Equal("vp", s.ParamRoles["VP"]);    // built-in still there
        Assert.Equal("pv", s.ParamRoles["PV"]);
        Assert.Equal("sp", s.ParamRoles["SV"]);    // CENTUM aliases survive
        Assert.Equal("op", s.ParamRoles["MV"]);
        Assert.Equal("mode", s.ParamRoles["MODE"]);
    }

    [Fact]
    public void Configured_entry_overrides_a_default_of_the_same_key()
    {
        // Case-insensitive: "mv" re-points the built-in MV alias.
        var s = new LoopIngestConfig { ParamRoles = new() { ["mv"] = "mv_raw" } }.Resolve();
        Assert.Equal("mv_raw", s.ParamRoles["MV"]);
        Assert.Single(s.ParamRoles.Keys, k => k.Equals("MV", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void Null_or_blank_value_unmaps_a_built_in_entry(string? value)
    {
        // The only way to REMOVE a default now that the map merges: a plant whose
        // gateway uses "MV" for something other than controller output.
        var s = new LoopIngestConfig { ParamRoles = new() { ["MV"] = value } }.Resolve();
        Assert.False(s.ParamRoles.ContainsKey("MV"));
        Assert.Equal("op", s.ParamRoles["OP"]);    // the primary name is untouched
    }

    [Fact]
    public void Resolve_never_mutates_the_shared_default_map()
    {
        _ = new LoopIngestConfig { ParamRoles = new() { ["PV"] = null, ["ZZ"] = "zz" } }.Resolve();
        Assert.Equal("pv", LoopIngestConfig.DefaultParamRoles["PV"]);
        Assert.False(LoopIngestConfig.DefaultParamRoles.ContainsKey("ZZ"));
    }

    [Fact]
    public void Param_roles_null_values_roundtrip_through_profile_config_json()
    {
        var json = """{"loop_ingest":{"param_roles":{"POS":"vp","MV":null,"GW":""}}}""";
        var cfg = ProfileConfig.FromJson(json);
        var s = cfg.LoopIngest!.Resolve();
        Assert.Equal("vp", s.ParamRoles["POS"]);
        Assert.False(s.ParamRoles.ContainsKey("MV"));
        Assert.False(s.ParamRoles.ContainsKey("GW"));
        // and the stored form still carries the unmap so a re-read gives the same answer
        var again = ProfileConfig.FromJson(cfg.ToJson()).LoopIngest!.Resolve();
        Assert.False(again.ParamRoles.ContainsKey("MV"));
        Assert.False(again.ParamRoles.ContainsKey("GW"));
    }

    [Fact]
    public void ProfileConfig_roundtrips_loop_ingest_json()
    {
        var json = """{"mqtt":{"topics":["OT/HDPE/+/+/+/PIDParams/+"]},"loop_ingest":{"grid_seconds":7,"mode_value_map":{"4":"AUT"}}}""";
        var cfg = ProfileConfig.FromJson(json);
        Assert.NotNull(cfg.LoopIngest);
        Assert.Equal(7, cfg.LoopIngest!.Resolve().GridSeconds);
        Assert.Contains("loop_ingest", cfg.ToJson());
    }

    [Theory]
    [InlineData("{site}/{loop}", "loop_ingest.topic_template")]           // missing {fcs}/{param}
    [InlineData("", null)]                                                 // empty = default = valid
    public void Validation_requires_the_four_capture_levels(string template, string? expectedField)
    {
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { TopicTemplate = template } };
        var result = DataSourceValidation.ValidateLoopIngest(cfg);
        if (expectedField is null) Assert.Null(result);
        else Assert.Equal(expectedField, result!.Value.Field);
    }

    [Fact]
    public void Validation_rejects_roles_shadowing_contract_fields()
    {
        var cfg = new ProfileConfig
        {
            LoopIngest = new LoopIngestConfig { ParamRoles = new() { ["PV"] = "pv", ["X"] = "loop_type" } },
        };
        var result = DataSourceValidation.ValidateLoopIngest(cfg);
        Assert.Equal("loop_ingest.param_roles", result!.Value.Field);
    }

    [Fact]
    public void Validation_rejects_uppercase_or_bad_chars_in_roles()
    {
        var cfg = new ProfileConfig
        {
            LoopIngest = new LoopIngestConfig { ParamRoles = new() { ["PV"] = "Bad-Role" } },
        };
        var result = DataSourceValidation.ValidateLoopIngest(cfg);
        Assert.Equal("loop_ingest.param_roles", result!.Value.Field);
    }

    [Fact]
    public void Validation_accepts_a_partial_map_that_only_adds_a_leaf()
    {
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { ParamRoles = new() { ["POS"] = "vp" } } };
        Assert.Null(DataSourceValidation.ValidateLoopIngest(cfg));
    }

    [Theory]
    [InlineData("PV", "pv")]
    [InlineData("SP,SV", "sp")]     // primary AND the CENTUM alias — one alone leaves the role reachable
    [InlineData("OP,MV", "op")]
    [InlineData("MODE", "mode")]
    public void Validation_rejects_a_map_that_leaves_a_required_role_unreachable(string keys, string role)
    {
        // Un-mapping the last source of pv/sp/op means no loop can ever emit a tuple;
        // losing mode means G1 excludes every loop. Both are "the fleet goes dark
        // from one config save" — reject at save time, name the role.
        var overlay = new Dictionary<string, string?>();
        foreach (var key in keys.Split(',')) overlay[key] = null;
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { ParamRoles = overlay } };
        var result = DataSourceValidation.ValidateLoopIngest(cfg);
        Assert.NotNull(result);
        Assert.Equal("loop_ingest.param_roles", result!.Value.Field);
        Assert.Contains($"'{role}'", result.Value.Error);
    }

    [Fact]
    public void Validation_accepts_unmapping_an_alias_while_the_primary_remains()
    {
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { ParamRoles = new() { ["SV"] = null, ["MV"] = "" } } };
        Assert.Null(DataSourceValidation.ValidateLoopIngest(cfg));
    }

    [Fact]
    public void Validation_rejects_a_blank_key()
    {
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { ParamRoles = new() { [" "] = "vp" } } };
        Assert.Equal("loop_ingest.param_roles", DataSourceValidation.ValidateLoopIngest(cfg)!.Value.Field);
    }

    [Fact]
    public void Validation_rejects_a_role_shadowing_ingest_ts_ms()
    {
        // CHG-001 added ingest_ts_ms to the wire; it must be reserved like the others.
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { ParamRoles = new() { ["X"] = "ingest_ts_ms" } } };
        Assert.Equal("loop_ingest.param_roles", DataSourceValidation.ValidateLoopIngest(cfg)!.Value.Field);
    }

    [Fact]
    public void Validation_accepts_the_default_shape_used_by_the_wizard()
    {
        var cfg = new ProfileConfig
        {
            LoopIngest = new LoopIngestConfig
            {
                TopicTemplate = "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}",
                GridSeconds = 5,
                ParamRoles = LoopIngestConfig.DefaultParamRoles.ToDictionary(kv => kv.Key, kv => (string?)kv.Value),
                ModeValueMap = new() { ["4"] = "AUT" },
            },
        };
        Assert.Null(DataSourceValidation.ValidateLoopIngest(cfg));
    }
}
