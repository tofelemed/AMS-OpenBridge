using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class OtTopicParserTests
{
    private const string T = "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}";

    [Fact]
    public void Parses_the_observed_hierarchy()
    {
        Assert.True(OtTopicParser.TryParse(T, "OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV", out var id, out _));
        Assert.Equal(new OtTopicIdentity("HDPE", "FCS0101", "Flow", "FIC10302", "PV"), id);
    }

    [Fact]
    public void Literal_template_levels_must_match()
    {
        var t = "{ns}/{site}/{fcs}/{class}/{loop}/PIDParams/{param}";
        Assert.True(OtTopicParser.TryParse(t, "OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV", out _, out _));
        Assert.False(OtTopicParser.TryParse(t, "OT/HDPE/FCS0101/Flow/FIC10302/OtherGroup/PV", out _, out var err));
        Assert.Contains("PIDParams", err);
    }

    [Theory]
    [InlineData("OT/HDPE/FCS0101/Flow/FIC10302/PIDParams")]          // too few levels
    [InlineData("OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV/extra")] // too many
    public void Wrong_depth_fails(string topic) =>
        Assert.False(OtTopicParser.TryParse(T, topic, out _, out _));

    [Fact]
    public void Template_missing_required_capture_fails()
    {
        Assert.False(OtTopicParser.TryParse("{ns}/{site}/{loop}/{param}", "OT/HDPE/FIC1/PV", out _, out var err));
        Assert.Contains("{fcs}", err);
    }

    [Fact]
    public void Empty_loop_or_param_level_fails()
    {
        Assert.False(OtTopicParser.TryParse(T, "OT/HDPE/FCS0101/Flow//PIDParams/PV", out _, out _));
        Assert.False(OtTopicParser.TryParse(T, "OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/ ", out _, out _));
    }

    [Fact]
    public void Class_is_optional_in_the_template()
    {
        Assert.True(OtTopicParser.TryParse("{ns}/{site}/{fcs}/{loop}/{param}", "OT/HDPE/FCS0101/FIC10302/PV", out var id, out _));
        Assert.Equal("", id!.ProcessClass);
    }
}
