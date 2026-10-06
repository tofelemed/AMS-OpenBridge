using FluentAssertions;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Services;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class LoopSourceConflictTests
{
    private static DataSourceRow Row(string name, string url, string[] topics, int ageMin = 0,
        bool active = true, string? clientId = null, string profile = "MQTT_LOOP_SAMPLES", Guid? id = null)
    {
        var pc = new ProfileConfig { Mqtt = new MqttConfig { Topics = topics.ToList(), ClientId = clientId } };
        return new DataSourceRow
        {
            ConfigId = id ?? Guid.NewGuid(), Name = name, ConnectionUrl = url, ProfileType = profile,
            IsActive = active, ProfileConfig = pc.ToJson(),
            CreatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc).AddMinutes(ageMin),
        };
    }

    [Theory]
    [InlineData("a/b/c", "a/b/c", true)]
    [InlineData("a/+/c", "a/b/c", true)]
    [InlineData("a/+/c", "a/b/d", false)]
    [InlineData("a/#", "a/b/c", true)]
    [InlineData("a/#", "b/#", false)]
    [InlineData("a/b", "a/b/c", false)]
    [InlineData("a/#", "a", true)]
    [InlineData("plant/+/+/loops/#", "lab/ot/loops/#", false)]
    [InlineData("plant/+/+/loops/#", "plant/hdpe/u1/loops/pid1/PV", true)]
    public void FilterOverlap_Matrix(string a, string b, bool expected)
    {
        LoopSourceConflicts.FiltersOverlap(a, b).Should().Be(expected);
        LoopSourceConflicts.FiltersOverlap(b, a).Should().Be(expected);
    }

    [Theory]
    [InlineData("mqtt://Broker:1883", "mqtt://broker", true)]
    [InlineData("mqtts://broker", "mqtts://broker:8883", true)]
    [InlineData("mqtt://broker", "mqtts://broker", false)]
    [InlineData("mqtt://broker:1884", "mqtt://broker", false)]
    public void PortNormalization(string a, string b, bool same) =>
        (LoopSourceConflicts.NormalizeEndpoint(a) == LoopSourceConflicts.NormalizeEndpoint(b)).Should().Be(same);

    [Fact]
    public void OverlappingTopicsOnSameBroker_Conflict()
    {
        var a = Row("A", "mqtt://b:1883", new[] { "x/#" });
        var c = Row("C", "mqtt://B", new[] { "x/y" });
        LoopSourceConflicts.FindConflict(c, new[] { a }).Should().BeSameAs(a);
    }

    [Fact]
    public void DifferentBroker_NoConflict()
    {
        var a = Row("A", "mqtt://b1", new[] { "x/#" });
        LoopSourceConflicts.FindConflict(Row("C", "mqtt://b2", new[] { "x/#" }), new[] { a }).Should().BeNull();
    }

    [Fact]
    public void ClientIdClash_ConflictsEvenWithDisjointTopics()
    {
        var a = Row("A", "mqtt://b", new[] { "x/#" }, clientId: "same");
        var c = Row("C", "mqtt://b", new[] { "y/#" }, clientId: "same");
        LoopSourceConflicts.FindConflict(c, new[] { a }).Should().BeSameAs(a);
    }

    [Fact]
    public void SelfAndInactiveAndOtherProfiles_Ignored()
    {
        var a = Row("A", "mqtt://b", new[] { "x/#" });
        LoopSourceConflicts.FindConflict(a, new[] { a }).Should().BeNull();
        var off = Row("Off", "mqtt://b", new[] { "x/#" }, active: false);
        LoopSourceConflicts.FindConflict(Row("C", "mqtt://b", new[] { "x/#" }), new[] { off }).Should().BeNull();
        var health = Row("H", "mqtt://b", new[] { "x/#" }, profile: "INSTRUMENTAL_HEALTH");
        LoopSourceConflicts.FindConflict(Row("C", "mqtt://b", new[] { "x/#" }), new[] { health }).Should().BeNull();
    }

    [Fact]
    public void OldestWins_AndLoserFreedWhenWinnerDeactivated()
    {
        var oldest = Row("Old", "mqtt://b", new[] { "x/#" }, ageMin: 0);
        var mid = Row("Mid", "mqtt://b", new[] { "x/1" }, ageMin: 5);
        var newest = Row("New", "mqtt://b", new[] { "x/2" }, ageMin: 9);
        var losers = LoopSourceConflicts.ResolveLosers(new[] { newest, mid, oldest });
        losers.Keys.Should().BeEquivalentTo(new[] { mid.ConfigId, newest.ConfigId });
        losers[mid.ConfigId].Should().BeSameAs(oldest);

        oldest.IsActive = false;
        var after = LoopSourceConflicts.ResolveLosers(new[] { newest, mid, oldest });
        after.Should().BeEmpty(); // mid (x/1) and new (x/2) are disjoint
    }

    [Fact]
    public void SameCreatedAt_TieBrokenByConfigId()
    {
        var lo = Row("Lo", "mqtt://b", new[] { "x/#" }, id: Guid.Parse("00000000-0000-0000-0000-000000000001"));
        var hi = Row("Hi", "mqtt://b", new[] { "x/#" }, id: Guid.Parse("00000000-0000-0000-0000-000000000002"));
        LoopSourceConflicts.ResolveLosers(new[] { hi, lo }).Keys.Should().BeEquivalentTo(new[] { hi.ConfigId });
    }

    [Fact]
    public void SameBrokerDisjointFilters_IsWarningPairNotConflict()
    {
        var a = Row("Diag", "mqtt://b", new[] { "diag/#" });
        var c = Row("PID", "mqtt://b", new[] { "pid/#" });
        LoopSourceConflicts.ResolveLosers(new[] { a, c }).Should().BeEmpty();
        LoopSourceConflicts.SameEndpointPairs(new[] { a, c }).Should().HaveCount(1);
    }

    [Fact]
    public void FeedChanged_IgnoresRename_DetectsTopicChange()
    {
        var a = Row("A", "mqtt://b", new[] { "x/#" });
        var renamed = Row("Renamed", "mqtt://b", new[] { "x/#" }, id: a.ConfigId);
        LoopSourceConflicts.FeedChanged(a, renamed).Should().BeFalse();
        var moved = Row("A", "mqtt://b", new[] { "y/#" }, id: a.ConfigId);
        LoopSourceConflicts.FeedChanged(a, moved).Should().BeTrue();
    }
}
