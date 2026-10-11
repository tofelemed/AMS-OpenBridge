// CHG-090 — the IoTDB warm-up must stay cheap at plant scale. At Marun its old query, SELECT count(*) FROM root.**, touched
// every series (141 loops x all measurements); IoTDB estimated it at 324 MB with 193 MB free and refused it, and because the
// slow 60 s rhythm only started after a FIRST success, it retried every 5 s for ever (11-12 MemoryNotEnough warnings a
// minute, 2026-10-11). Pure helpers, no IoTDB needed.
using System.Text.Json;
using AMS.HistorianBff;
using FluentAssertions;
using Xunit;

namespace AMS.HistorianBff.Tests;

public sealed class IoTDbWarmupTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void The_warmup_reads_one_device_never_the_whole_database()
    {
        var sql = IoTDbWarmupService.WarmupSql("root.site1.cpm.FIC10302", 1_000_000_000L);
        sql.Should().Be("SELECT count(*) FROM root.site1.cpm.FIC10302 GROUP BY ([999700000,1000000000), 300000ms)");
        sql.Should().NotContain("**");
    }

    [Fact]
    public void One_device_is_read_from_the_SHOW_DEVICES_answer()
    {
        // IoTDB REST v2: column-major values, one array per column
        var answer = J("""{"column_names":["Device","IsAligned","Template","TTL(ms)"],"values":[["root.site1.cpm.FIC10302"],["false"],["null"],["INF"]]}""");
        IoTDbWarmupService.FirstDevice(answer).Should().Be("root.site1.cpm.FIC10302");
        // expressions instead of column_names (older servers) - still the first column
        IoTDbWarmupService.FirstDevice(J("""{"expressions":["Device"],"values":[["root.site1.cpm.TIC10608"]]}""")).Should().Be("root.site1.cpm.TIC10608");
    }

    [Fact]
    public void No_device_or_an_unsafe_path_yields_none()
    {
        IoTDbWarmupService.FirstDevice(J("""{"column_names":["Device"],"values":[[]]}""")).Should().BeNull("an empty database has no device yet");
        IoTDbWarmupService.FirstDevice(J("""{"column_names":["Device"],"values":[["root.a; drop"]]}""")).Should().BeNull("only a plain path reaches SQL");
        IoTDbWarmupService.FirstDevice(J("""{"code":200}""")).Should().BeNull();
    }

    [Fact]
    public void Fast_retries_only_in_the_first_minute_then_the_normal_rhythm_whatever_the_outcome()
    {
        var start = new DateTimeOffset(2026, 10, 12, 0, 0, 0, TimeSpan.Zero);
        IoTDbWarmupService.NextDelay(ok: false, start, start.AddSeconds(10)).Should().Be(TimeSpan.FromSeconds(5), "IoTDB may still be starting");
        IoTDbWarmupService.NextDelay(ok: false, start, start.AddSeconds(61)).Should().Be(TimeSpan.FromSeconds(60), "never every 5 s for ever");
        IoTDbWarmupService.NextDelay(ok: true, start, start.AddSeconds(10)).Should().Be(TimeSpan.FromSeconds(60));
        IoTDbWarmupService.NextDelay(ok: true, start, start.AddHours(5)).Should().Be(TimeSpan.FromSeconds(60));
    }

    [Fact]
    public void A_failure_is_reported_at_most_once_an_hour()
    {
        var t0 = new DateTimeOffset(2026, 10, 12, 0, 0, 0, TimeSpan.Zero);
        IoTDbWarmupService.ShouldWarn(null, t0).Should().BeTrue("the first failure is reported");
        IoTDbWarmupService.ShouldWarn(t0, t0.AddMinutes(59)).Should().BeFalse();
        IoTDbWarmupService.ShouldWarn(t0, t0.AddMinutes(60)).Should().BeTrue();
    }
}
