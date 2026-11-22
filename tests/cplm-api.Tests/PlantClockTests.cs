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

    // CHG-106: a plant on 06:00 / 18:00 shifts. Iran 06:00 = 02:30Z. A day is named by the date it starts on.
    [Fact]
    public void A_0600_plant_day_runs_from_0600_to_0600_and_is_named_by_its_start_date()
    {
        var c = PlantClock.Parse("IR").WithDayStart("06:00");
        var d22 = new DateOnly(2026, 11, 22);
        c.DayStart(d22).Should().Be(DateTimeOffset.Parse("2026-11-22T02:30:00Z"));
        c.DayEnd(d22).Should().Be(DateTimeOffset.Parse("2026-11-23T02:30:00Z"));
        c.DayOf(DateTimeOffset.Parse("2026-11-22T20:30:00Z")).Should().Be(d22, "local midnight still belongs to the day that started at 06:00");
        c.DayOf(DateTimeOffset.Parse("2026-11-23T02:29:59Z")).Should().Be(d22);
        c.DayOf(DateTimeOffset.Parse("2026-11-23T02:30:00Z")).Should().Be(d22.AddDays(1));
        c.DayEndingAt(DateTimeOffset.Parse("2026-11-23T02:30:00Z")).Should().Be(d22);
        c.DayEndingAt(DateTimeOffset.Parse("2026-11-22T20:30:00Z")).Should().BeNull("midnight is no longer a day end");
    }

    [Fact]
    public void The_day_start_comes_from_configuration_and_defaults_to_midnight()
    {
        PlantClock.From(new ConfigurationBuilder().Build()).DayStartText.Should().Be("00:00");
        var c = PlantClock.From(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [PlantClock.ConfigKey] = "IR",
            [PlantClock.DayStartKey] = "06:00",
        }).Build());
        c.DayStartTime.Should().Be(new TimeOnly(6, 0));
        c.Describe(DateTimeOffset.Parse("2026-11-22T00:00:00Z")).Should().BeEquivalentTo(
            new { setting = "IR", zone = "Asia/Tehran", utcOffset = "+03:30", dayStart = "06:00" });
        PlantClock.Parse("UTC").WithDayStart("  ").DayEnd(Day).Should().Be(DateTimeOffset.Parse("2026-11-04T00:00:00Z"));
    }

    [Theory]
    [InlineData("6")]
    [InlineData("06:10")]
    [InlineData("24:00")]
    [InlineData("06:60")]
    [InlineData("6am")]
    public void A_bad_day_start_fails_loudly(string start) =>
        FluentActions.Invoking(() => PlantClock.Parse("IR").WithDayStart(start)).Should().Throw<ArgumentException>().WithMessage("*PlantDayStart*");
}
