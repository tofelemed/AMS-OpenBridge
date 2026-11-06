// CPA reference redesign, Task 7: the Performance tiles "Periodic diagnosis" and "Diagnostic capability" each list the loops
// behind them through GET fleet/kpis/loops, with the same predicate the tile count uses (keys `periodic` and `capability`).
using FluentAssertions;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetKpiPerformanceKeysTests
{
    private static readonly KpiThresholds T = new();
    private static readonly DateTimeOffset Now = new(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);

    private static KpiLoop L(string? diagnosis, bool vpExpectedUnmapped = false, double ageS = 600) =>
        FleetKpiClassifier.Classify(new KpiLoopRow
        {
            LoopId = $"L{Guid.NewGuid():N}"[..10], Diagnosis = diagnosis, WindowEnd = Now.AddSeconds(-ageS),
            AutoPct = 1.0, SaturationPct = 0.0, G3Status = "PASS", G4Status = "PASS", VpExpectedUnmapped = vpExpectedUnmapped,
        }, T, Now);

    [Fact]
    public void Periodic_counts_oscillation_and_valve_findings_at_detected_or_stronger()
    {
        var loops = new[]
        {
            L("DETECTED_OSCILLATION"), L("CLASSIFIED_FINAL_ELEMENT_NONLINEARITY"), L("SUSPECTED_OSCILLATION"), L("CONFIRMED_FINAL_ELEMENT_NONLINEARITY"),
            L("CONFIRMED_EXCESSIVE_EFFORT"), L("NO_CALL"), L("INSUFFICIENT_DATA"), L("SUSPECTED_OSCILLATION", ageS: 7200),
        };
        FleetKpiClassifier.Keys.Should().Contain("periodic");
        FleetKpiBar.IsListKey("periodic").Should().BeTrue();
        var listed = loops.Count(l => FleetKpiClassifier.Matches(l, "periodic"));
        listed.Should().Be(4);
        // the tile's own count is the headline's: the list and the number cannot differ
        System.Text.Json.JsonSerializer.SerializeToElement(FleetKpiPerformance.Summarise(loops)).GetProperty("periodic").GetProperty("count").GetInt32().Should().Be(listed);
    }

    [Fact]
    public void Capability_lists_valve_loops_with_vp_expected_but_not_mapped()
    {
        var loops = new[] { L("NO_CALL", vpExpectedUnmapped: true), L("SUSPECTED_OSCILLATION", vpExpectedUnmapped: true), L("NO_CALL"), L(null, vpExpectedUnmapped: true, ageS: 99999) };
        FleetKpiClassifier.Keys.Should().Contain("capability");
        FleetKpiBar.IsListKey("capability").Should().BeTrue();
        loops.Count(l => FleetKpiClassifier.Matches(l, "capability")).Should().Be(3, "the gap is a registry fact, so a stale loop counts too");
    }
}
