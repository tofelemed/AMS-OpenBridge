// Task 24 fix round 1: an edit (activate on an existing loop) must not silently reset what the form does not send,
// and must not revive a retired loop. Pure rules, no database.
using System.Text.Json.Nodes;
using FluentAssertions;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Registry;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class RegistryEditMergeTests
{
    [Fact]
    public void A_retired_loop_cannot_be_edited_and_the_message_says_what_to_do()
    {
        var ex = Assert.Throws<LoopIdCollisionException>(() => RegistryEditMerge.EnsureNotRetired(false, "FIC1"));
        ex.Code.Should().Be("LOOP_RETIRED");
        ex.Message.Should().Contain("FIC1").And.Contain("Restore");
    }

    [Theory]
    [InlineData(null)]
    [InlineData(true)]
    public void A_new_or_active_loop_can_be_activated(bool? isActive) =>
        RegistryEditMerge.EnsureNotRetired(isActive, "FIC1");

    [Fact]
    public void Tag_sources_are_kept_for_the_same_role_and_path_when_the_request_has_none()
    {
        var existing = new[] { new CpmTagMapEntry("PV", "a/b/c.pv", "ot-gateway", "45FIC.PV"), new CpmTagMapEntry("SP", "a/b/c.sp", "ot-gateway", "45FIC.SP") };
        var incoming = new[] { new CpmTagMapEntry("pv", "a/b/c.pv"), new CpmTagMapEntry("SP", "a/b/other.sp"), new CpmTagMapEntry("OP", "a/b/c.op", "x", "y") };
        var merged = RegistryEditMerge.MergeTagSources(existing, incoming);
        merged[0].Should().BeEquivalentTo(new CpmTagMapEntry("pv", "a/b/c.pv", "ot-gateway", "45FIC.PV"));
        merged[1].SourceSystem.Should().BeNull();   // a new path is a new signal: nothing to keep
        merged[2].SourceTag.Should().Be("y");       // what the request sends wins
    }

    [Fact]
    public void Engineering_keeps_keys_the_form_does_not_send_but_lets_it_clear_its_own()
    {
        var existing = """{"pvMin":0,"pvMax":100,"opMin":0,"opMax":100,"pvUnit":"kg/h","note":"keep me"}""";
        var incoming = """{"pvMin":5,"pvMax":90}""";
        var m = JsonNode.Parse(RegistryEditMerge.MergeEngineering(existing, incoming)!)!;
        m["note"]!.GetValue<string>().Should().Be("keep me");
        m["pvMin"]!.GetValue<double>().Should().Be(5);
        m["opMin"].Should().BeNull();       // the form manages opMin and sent none: cleared
        m["pvUnit"].Should().BeNull();
        RegistryEditMerge.MergeEngineering(existing, null).Should().BeNull();   // omitted: SQL keeps the stored range
    }

    [Fact]
    public void Monitoring_evidence_is_merged_deeply()
    {
        var existing = """{"enabled":true,"enabled_before_retire":true,"evidence":{"stepTestApproved":true,"firstSeenAt":"2026-01-01","peerLinksConfigured":true}}""";
        var m = JsonNode.Parse(RegistryEditMerge.MergeMonitoring(existing, false, false))!;
        m["enabled"]!.GetValue<bool>().Should().BeFalse();
        m["enabled_before_retire"]!.GetValue<bool>().Should().BeTrue();
        m["evidence"]!["firstSeenAt"]!.GetValue<string>().Should().Be("2026-01-01");
        m["evidence"]!["stepTestApproved"]!.GetValue<bool>().Should().BeFalse();
        m["evidence"]!["peerLinksConfigured"]!.GetValue<bool>().Should().BeFalse();
        m["cplmPipeline"]!.GetValue<string>().Should().Be("cplm-three-stage-system");
    }

    [Fact]
    public void Monitoring_for_a_new_loop_is_the_plain_default()
    {
        var m = JsonNode.Parse(RegistryEditMerge.MergeMonitoring(null, true, true))!;
        m["evidence"]!["stepTestApproved"]!.GetValue<bool>().Should().BeTrue();
    }
}
