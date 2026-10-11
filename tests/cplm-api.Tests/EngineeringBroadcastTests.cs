// CHG-088: the cplm.loop.engineering broadcast carries the loop's VP declaration so the Flink engine stops
// flagging NO_VP (and stops asking to "bind VP") on a loop that has no valve position by design. It is sent for
// every loop now - before, a loop without an OP/PV range got no record at all, so the engine could never learn it.
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EngineeringBroadcastTests
{
    private static JsonElement Value(Dictionary<string, string> p)
    {
        p["name"].Should().Be("cplm.loop.engineering");
        return JsonDocument.Parse(p["value"]).RootElement;
    }

    [Theory]
    [InlineData("""{"vpApplicability":"NOT_APPLICABLE"}""", "OP_TO_VALVE", "NOT_APPLICABLE")]   // the engineer's word wins
    [InlineData("""{"vpApplicability":"not_installed"}""", null, "NOT_INSTALLED")]
    [InlineData("""{"vpApplicability":"EXPECTED"}""", "OP_TO_VFD", "EXPECTED")]
    [InlineData("{}", "OP_TO_VFD", "NOT_APPLICABLE")]                                       // command-path default
    [InlineData("{}", "OP_TO_PV", "NOT_APPLICABLE")]
    [InlineData("{}", "OP_TO_VALVE", "EXPECTED")]
    [InlineData(null, null, "EXPECTED")]                                                     // no engineering at all
    public void Every_loop_broadcasts_its_vp_declaration(string? engineering, string? commandPath, string expected) =>
        Value(CpmLoopRegistryService.EngineeringParameter(engineering, commandPath))
            .GetProperty("vpApplicability").GetString().Should().Be(expected);

    [Fact]
    public void Undeclared_ranges_stay_absent_so_the_engine_keeps_its_defaults()
    {
        var v = Value(CpmLoopRegistryService.EngineeringParameter("""{"vpApplicability":"NOT_APPLICABLE"}""", null));
        v.TryGetProperty("opEngMin", out _).Should().BeFalse();
        v.TryGetProperty("pvEngMin", out _).Should().BeFalse();
    }

    [Fact]
    public void Declared_ranges_ride_along_unchanged()
    {
        var v = Value(CpmLoopRegistryService.EngineeringParameter("""{"opMin":0,"opMax":1,"pvMax":250}""", "OP_TO_VALVE"));
        v.GetProperty("opEngMin").GetDouble().Should().Be(0);
        v.GetProperty("opEngMax").GetDouble().Should().Be(1);
        v.GetProperty("pvEngMin").GetDouble().Should().Be(0);
        v.GetProperty("pvEngMax").GetDouble().Should().Be(250);
        v.GetProperty("vpApplicability").GetString().Should().Be("EXPECTED");
    }
}
