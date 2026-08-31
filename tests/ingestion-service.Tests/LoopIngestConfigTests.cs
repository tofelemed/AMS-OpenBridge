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
        Assert.Equal(30, s.StaleAfterSeconds);
        Assert.Equal(300, s.FutureSkewMaxSeconds);
        Assert.Equal(60, s.RegistryRefreshSeconds);
        Assert.Equal("pv", s.ParamRoles["PV"]);
        Assert.Equal("gw", s.ParamRoles["gw"]); // case-insensitive keys
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
        Assert.False(s.ParamRoles.ContainsKey("GW")); // explicit map replaces defaults entirely
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
    public void Validation_accepts_the_default_shape_used_by_the_wizard()
    {
        var cfg = new ProfileConfig
        {
            LoopIngest = new LoopIngestConfig
            {
                TopicTemplate = "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}",
                GridSeconds = 5,
                ParamRoles = LoopIngestConfig.DefaultParamRoles,
                ModeValueMap = new() { ["4"] = "AUT" },
            },
        };
        Assert.Null(DataSourceValidation.ValidateLoopIngest(cfg));
    }
}
