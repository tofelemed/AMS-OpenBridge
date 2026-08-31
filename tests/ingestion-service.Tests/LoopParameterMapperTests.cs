using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopParameterMapperTests
{
    private static LoopIngestSettings Cfg(Dictionary<string, string>? modeMap = null) =>
        new LoopIngestConfig { ModeValueMap = modeMap }.Resolve();

    private static OtLoopPayload Num(double v, string? raw = null) =>
        new(v, raw ?? v.ToString(System.Globalization.CultureInfo.InvariantCulture),
            "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);

    [Theory]
    [InlineData("PV", "pv", true)]
    [InlineData("SP", "sp", true)]
    [InlineData("OP", "op", true)]
    [InlineData("P", "p", false)]
    [InlineData("I", "i", false)]
    [InlineData("D", "d", false)]
    [InlineData("GW", "gw", false)]
    public void Maps_default_roles(string param, string role, bool member)
    {
        Assert.True(LoopParameterMapper.TryMap(param, Num(1.5), Cfg(), out var m, out _));
        Assert.Equal(role, m!.Role);
        Assert.Equal(member, m.IsTupleMember);
        Assert.Equal(1.5, m.NumericValue);
    }

    [Fact]
    public void Param_lookup_is_case_insensitive()
    {
        Assert.True(LoopParameterMapper.TryMap("pv", Num(1), Cfg(), out var m, out _));
        Assert.Equal("pv", m!.Role);
    }

    [Fact]
    public void Mode_numeric_is_translated_via_map()
    {
        Assert.True(LoopParameterMapper.TryMap("MODE", Num(4.0, "4.0"), Cfg(new() { ["4"] = "AUT" }), out var m, out _));
        Assert.Equal("AUT", m!.ModeString);
        Assert.True(m.IsTupleMember);
    }

    [Fact]
    public void Mode_unmapped_passes_raw_key_through()
    {
        Assert.True(LoopParameterMapper.TryMap("MODE", Num(7.0, "7.0"), Cfg(), out var m, out _));
        Assert.Equal("7", m!.ModeString); // visible degradation, no silent guessing
    }

    [Fact]
    public void Mode_string_values_pass_through_and_map()
    {
        var cas = new OtLoopPayload(null, "CAS", "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);
        Assert.True(LoopParameterMapper.TryMap("MODE", cas, Cfg(), out var m, out _));
        Assert.Equal("CAS", m!.ModeString);

        var mapped = new OtLoopPayload(null, "AUTOMATIC3", "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);
        Assert.True(LoopParameterMapper.TryMap("MODE", mapped, Cfg(new() { ["AUTOMATIC3"] = "AUT" }), out m, out _));
        Assert.Equal("AUT", m!.ModeString);
    }

    [Fact]
    public void Unknown_parameter_is_rejected()
    {
        Assert.False(LoopParameterMapper.TryMap("XYZ", Num(1), Cfg(), out _, out var reason));
        Assert.Equal(DlqReasons.UnknownParameter, reason);
    }

    [Fact]
    public void Non_numeric_value_on_numeric_role_is_rejected()
    {
        var payload = new OtLoopPayload(null, "banana", "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);
        Assert.False(LoopParameterMapper.TryMap("PV", payload, Cfg(), out _, out var reason));
        Assert.Equal(DlqReasons.MissingField, reason);
    }
}
