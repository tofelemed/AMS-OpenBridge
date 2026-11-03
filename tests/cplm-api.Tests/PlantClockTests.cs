// CHG-102: the plant day setting (Cpm:PlantTimeZone): local | UTC | IR | IANA id | +HH:MM; a bad value fails startup.
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class PlantClockTests
{
    private static readonly DateOnly Day = new(2026, 11, 3);

    [Theory]
    [InlineData("UTC", "2026-11-04T00:00:00Z")]
    [InlineData("IR", "2026-11-03T20:30:00Z")]
    [InlineData("ir", "2026-11-03T20:30:00Z")]
    [InlineData("Asia/Tehran", "2026-11-03T20:30:00Z")]
    [InlineData("+03:30", "2026-11-03T20:30:00Z")]
    [InlineData("UTC-05:00", "2026-11-04T05:00:00Z")]
    [InlineData("Europe/Berlin", "2026-11-03T23:00:00Z")]
    public void A_plant_day_ends_at_the_next_local_midnight(string setting, string end) =>
        PlantClock.Parse(setting).DayEnd(Day).Should().Be(DateTimeOffset.Parse(end));

    [Fact]
    public void Iran_day_boundaries_and_lookups()
    {
        var ir = PlantClock.Parse("IR");
        ir.ZoneId.Should().Be("Asia/Tehran");
        ir.DayOf(DateTimeOffset.Parse("2026-11-03T20:29:59Z")).Should().Be(Day);
        ir.DayOf(DateTimeOffset.Parse("2026-11-03T20:30:00Z")).Should().Be(Day.AddDays(1));
        ir.DayEndingAt(DateTimeOffset.Parse("2026-11-03T20:30:00Z")).Should().Be(Day);
        ir.DayEndingAt(DateTimeOffset.Parse("2026-11-04T00:00:00Z")).Should().BeNull("UTC midnight is not an Iran day end");
        ir.OffsetNow(DateTimeOffset.Parse("2026-07-01T00:00:00Z")).Should().Be("+03:30", "no DST since 2022");
        PlantClock.Utc.DayEndingAt(DateTimeOffset.Parse("2026-11-04T00:00:00Z")).Should().Be(Day);
    }

    [Fact]
    public void A_DST_zone_has_23_and_25_hour_days()
    {
        var berlin = PlantClock.Parse("Europe/Berlin");
        (berlin.DayEnd(new DateOnly(2026, 3, 29)) - berlin.DayStart(new DateOnly(2026, 3, 29))).Should().Be(TimeSpan.FromHours(23));
        (berlin.DayEnd(new DateOnly(2026, 10, 25)) - berlin.DayStart(new DateOnly(2026, 10, 25))).Should().Be(TimeSpan.FromHours(25));
    }

    [Fact]
    public void Local_is_the_default_and_follows_the_process_zone()
    {
        var c = PlantClock.From(new ConfigurationBuilder().Build());
        c.Setting.Should().Be("local");
        c.Zone.Should().Be(TimeZoneInfo.Local);
    }

    [Theory]
    [InlineData("Etc/UTC")]
    [InlineData("GMT")]
    public void A_UTC_alias_reads_as_plain_UTC_for_local(string id) =>
        PlantClock.Parse(id).DayEnd(Day).Should().Be(DateTimeOffset.Parse("2026-11-04T00:00:00Z"));

    [Theory]
    [InlineData("Mars/Olympus")]
    [InlineData("+15:00")]
    public void An_unknown_zone_fails_loudly(string setting) =>
        FluentActions.Invoking(() => PlantClock.Parse(setting)).Should().Throw<ArgumentException>().WithMessage("*PlantTimeZone*");
}
