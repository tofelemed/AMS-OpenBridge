// CHG-139: an older window (read from the IoTDB verdict history, beyond the 14 d of Postgres rows) is served as a
// summary. The Historical page lists four values per window, so the summary keeps exactly those four metrics:
// good_error_pct, auto_pct, mae and saturation_pct. A value the window never stored stays absent, never 0.
using System.Dynamic;
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class GateMatrixSummaryTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private static dynamic Row(string payload)
    {
        dynamic r = new ExpandoObject();
        r.loop_id = "TIC20803";
        r.window_kind = "12h";
        r.window_start = new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc);
        r.window_end = new DateTime(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);
        r.sample_count = 8640;
        r.diagnosis = "NO_FAULT";
        r.severity = "NONE";
        r.confidence = 0.2;
        r.payload = payload;
        r.created_at = new DateTime(2026, 9, 15, 12, 15, 0, DateTimeKind.Utc);
        return r;
    }

    private static JsonElement Serve(string payload) =>
        JsonSerializer.SerializeToElement((Dictionary<string, object?>)GateMatrixProjection.Summary(Row(payload)), Web);

    [Fact]
    public void Summary_keeps_the_four_window_metrics()
    {
        var m = Serve("""{ "gates": { "G0": "PASS" }, "good_error_pct": 0.91, "auto_pct": 1.0, "mae": 0.42, "saturation_pct": 0.03, "iae": 12.5, "stiction_family_score": 0.4 }""")
            .GetProperty("metrics");

        m.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(new[] { "good_error_pct", "auto_pct", "mae", "saturation_pct" },
            because: "the summary stays small: the four values the window list shows, not the whole metric block");
        m.GetProperty("good_error_pct").GetDouble().Should().Be(0.91);
        m.GetProperty("auto_pct").GetDouble().Should().Be(1.0);
        m.GetProperty("mae").GetDouble().Should().Be(0.42);
        m.GetProperty("saturation_pct").GetDouble().Should().Be(0.03);
    }

    [Fact]
    public void A_metric_the_window_never_stored_is_absent_not_zero()
    {
        var m = Serve("""{ "gates": { "G0": "PASS" }, "good_error_pct": 0.5 }""").GetProperty("metrics");

        m.EnumerateObject().Select(p => p.Name).Should().Equal("good_error_pct");
        m.TryGetProperty("mae", out _).Should().BeFalse();
    }

    [Fact]
    public void Historian_summaries_carry_the_same_four_metrics()
    {
        // The IoTDB tier builds its summary through the same projection, so a window older than 14 days keeps its values.
        var row = new Traverse.CplmApi.Services.IotDbRow(1_789_000_000_000, new Dictionary<string, object?>
        {
            ["diagnosis"] = "NO_FAULT", ["good_error_pct"] = 0.7, ["mae"] = 1.5, ["auto_pct"] = 0.9, ["iae"] = 3.0,
        });
        var s = JsonSerializer.SerializeToElement(KpiHistorianRows.GateSummary(row, "TIC20803", "12h"), Web);
        var m = s.GetProperty("metrics");
        m.GetProperty("good_error_pct").GetDouble().Should().Be(0.7);
        m.GetProperty("mae").GetDouble().Should().Be(1.5);
        m.GetProperty("auto_pct").GetDouble().Should().Be(0.9);
        m.TryGetProperty("saturation_pct", out _).Should().BeFalse("it was not stored for that window");
        m.TryGetProperty("iae", out _).Should().BeFalse();
    }
}
