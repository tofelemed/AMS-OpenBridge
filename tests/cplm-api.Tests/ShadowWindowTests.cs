// CHG-222 (owner, 23 Nov): the shadow replay evaluates 24 h tumbling windows at an offset; the plan ends the run on the loop's
// newest LIVE 24 h window end and covers whole days, so every shadow window ends exactly where a LIVE window ends.
using FluentAssertions;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ShadowWindowTests
{
    private const long Hour = 3_600_000L;
    private static readonly DateTimeOffset Now = new(2026, 11, 23, 6, 53, 20, TimeSpan.Zero);

    [Fact]
    public void The_run_ends_on_the_newest_live_end()
    {
        var newest = new DateTimeOffset(2026, 11, 23, 6, 0, 0, TimeSpan.Zero);
        var p = ShadowWindow.Plan(newest, Now, 2);
        p.ToMs.Should().Be(newest.ToUnixTimeMilliseconds());
        p.FromMs.Should().Be(newest.AddDays(-1).ToUnixTimeMilliseconds());
        p.Days.Should().Be(1);
        p.OffsetMs.Should().Be(6 * Hour);
    }

    [Fact]
    public void Hours_round_up_to_whole_days_capped_at_seven()
    {
        var newest = new DateTimeOffset(2026, 11, 23, 6, 0, 0, TimeSpan.Zero);
        ShadowWindow.Plan(newest, Now, 25).Days.Should().Be(2);
        ShadowWindow.Plan(newest, Now, 500).Days.Should().Be(7);
        ShadowWindow.Plan(newest, Now, 0).Days.Should().Be(1);
    }

    [Fact]
    public void Without_a_live_end_now_is_floored_to_the_quarter_hour()
    {
        var p = ShadowWindow.Plan(null, Now, 24);
        p.ToMs.Should().Be(new DateTimeOffset(2026, 11, 23, 6, 45, 0, TimeSpan.Zero).ToUnixTimeMilliseconds());
        p.OffsetMs.Should().Be(6 * Hour + 45 * 60_000L);
    }

    [Fact]
    public void The_offset_is_always_inside_a_day()
    {
        ShadowWindow.Plan(new DateTimeOffset(2026, 11, 23, 0, 0, 0, TimeSpan.Zero), Now, 24).OffsetMs.Should().Be(0);
        ShadowWindow.Plan(new DateTimeOffset(2026, 11, 22, 23, 45, 0, TimeSpan.Zero), Now, 24).OffsetMs.Should().Be(23 * Hour + 45 * 60_000L);
    }
}
