// CHG-093 (SME review 2 #10, #11): the Performance headline counts every assessed loop in the scope (not a ranked page),
// states what it left out, and compares error across loops only as a share of the registered PV span.
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetKpiPerformanceTests
{
    private static readonly KpiThresholds T = new();
    private static readonly DateTimeOffset Now = new(2026, 10, 14, 12, 0, 0, TimeSpan.Zero);

    private static KpiLoop L(string? diagnosis, double? goodError = 0.8, double? mae = 1.0, double? span = 100.0,
        double ageS = 600, bool never = false) =>
        FleetKpiClassifier.Classify(new KpiLoopRow
        {
            LoopId = $"L{Guid.NewGuid():N}"[..10], Diagnosis = diagnosis, WindowEnd = never ? null : Now.AddSeconds(-ageS),
            AutoPct = 1.0, SaturationPct = 0.0, G3Status = "PASS", G4Status = "PASS",
            GoodErrorPct = goodError, Mae = mae, PvSpan = span,
        }, T, Now);

    private static JsonElement S(params KpiLoop[] loops) =>
        JsonSerializer.SerializeToElement(FleetKpiPerformance.Summarise(loops));

    [Fact]
    public void Error_is_a_share_of_the_PV_span_and_a_loop_without_a_span_is_excluded_not_mixed_in()
    {
        // 2 m3/h on a 0-200 span = 1 %; 3 degC on a 0-100 span = 3 %; 500 units with no span cannot be compared
        var s = S(L("NO_CALL", mae: 2, span: 200), L("NO_CALL", mae: 3, span: 100), L("NO_CALL", mae: 500, span: null));
        var e = s.GetProperty("errorOfSpan");
        e.GetProperty("medianPct").GetDouble().Should().Be(2.0);
        e.GetProperty("counted").GetInt32().Should().Be(2);
        e.GetProperty("noSpan").GetInt32().Should().Be(1);
        FleetKpiPerformance.ErrorOfSpan(new KpiLoopRow { Mae = 1, PvSpan = 0 }).Should().BeNull("a zero span is not a basis");
    }

    [Fact]
    public void The_basis_is_every_assessed_loop_and_the_exclusions_are_counted()
    {
        var s = S(L("NO_CALL", goodError: 0.9), L("SUSPECTED_OSCILLATION", goodError: 0.5), L("DETECTED_FINAL_ELEMENT_NONLINEARITY", goodError: null),
                  L("INSUFFICIENT_DATA"), L("NO_CALL", ageS: 7200), L(null, never: true));
        s.GetProperty("monitored").GetInt32().Should().Be(6);
        s.GetProperty("assessed").GetInt32().Should().Be(3);
        var x = s.GetProperty("excluded");
        (x.GetProperty("notAssessable").GetInt32(), x.GetProperty("stale").GetInt32(), x.GetProperty("neverEvaluated").GetInt32())
            .Should().Be((1, 1, 1));
        var g = s.GetProperty("goodError");
        g.GetProperty("meanPct").GetDouble().Should().BeApproximately(70.0, 1e-9);
        g.GetProperty("counted").GetInt32().Should().Be(2);
        g.GetProperty("notMeasured").GetInt32().Should().Be(1);
        s.GetProperty("periodic").GetProperty("count").GetInt32().Should().Be(2);
        s.GetProperty("periodic").GetProperty("of").GetInt32().Should().Be(3);
    }

    [Fact]
    public void An_empty_scope_has_no_figures_not_zeros()
    {
        var s = S();
        s.GetProperty("goodError").GetProperty("meanPct").ValueKind.Should().Be(JsonValueKind.Null);
        s.GetProperty("errorOfSpan").GetProperty("medianPct").ValueKind.Should().Be(JsonValueKind.Null);
    }
}
