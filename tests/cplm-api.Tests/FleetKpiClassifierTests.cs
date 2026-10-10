// KPI Phase 1 — the rules of kpi_calculation_logic/KPI-LOGIC.md, edge by edge, and the reconciliation that makes a tile
// provable: states sum to the monitored loops, outcomes sum to the assessed loops, every figure counts what its list shows.
using FluentAssertions;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetKpiClassifierTests
{
    private static readonly KpiThresholds T = new();
    private static readonly DateTimeOffset Now = new(2026, 10, 10, 12, 0, 0, TimeSpan.Zero);

    private static KpiLoopRow Row(string? diagnosis, double ageS = 600, double? auto = 1.0, double? sat = 0.0,
        double? completeness = 1.0, double? badQ = 0.0, string? g0 = null, bool never = false, double? confidence = 0.9) => new()
    {
        LoopId = $"L{Guid.NewGuid():N}"[..10], Diagnosis = diagnosis, WindowEnd = never ? null : Now.AddSeconds(-ageS),
        AutoPct = auto, SaturationPct = sat, Completeness = completeness, BadQualityPct = badQ, Gate0Reason = g0, Confidence = confidence,
    };

    private static KpiLoop C(KpiLoopRow r) => FleetKpiClassifier.Classify(r, T, Now);

    [Fact]
    public void Never_and_stale_come_from_the_newest_row_age()
    {
        C(Row(null, never: true)).State.Should().Be(KpiState.NeverEvaluated);
        C(Row("NO_CALL", ageS: 3600)).State.Should().Be(KpiState.Assessed, "exactly the freshness limit is still fresh");
        var stale = C(Row("NO_CALL", ageS: 3601));
        stale.State.Should().Be(KpiState.Stale);
        stale.NormalModeMeasured.Should().BeFalse("an old window's AUTO % is not today's");
    }

    [Theory]
    [InlineData(0.66, 0.0, null, "INCOMPLETE_DATA")]
    [InlineData(1.0, 0.6, null, "BAD_QUALITY")]
    [InlineData(1.0, 0.0, "QUALITY_UNKNOWN", "BAD_QUALITY")]
    [InlineData(1.0, 0.0, "INCOMPLETE", "INCOMPLETE_DATA")]
    [InlineData(1.0, 0.0, null, "DATA_QUALIFICATION")]
    public void Insufficient_data_names_its_reason(double completeness, double badQ, string? g0, string reason)
    {
        var l = C(Row("INSUFFICIENT_DATA", completeness: completeness, badQ: badQ, g0: g0, auto: null));
        l.State.Should().Be(KpiState.NotAssessable);
        l.Reason.Should().Be(reason);
    }

    [Theory]
    [InlineData("EXCLUDED_MODE", "MANUAL_MODE")]
    [InlineData("EXCLUDED_OPERATING_REGION", "OUTSIDE_OPERATING_REGION")]
    [InlineData("EXCLUDED_INSTRUMENT_HEALTH", "INSTRUMENT_HEALTH")]
    [InlineData("PENDING", "NOT_YET_JUDGED")]
    public void Excluded_windows_are_not_assessable_with_their_reason(string diagnosis, string reason)
    {
        var l = C(Row(diagnosis, auto: 0.2));
        l.State.Should().Be(KpiState.NotAssessable);
        l.Reason.Should().Be(reason);
    }

    [Theory]
    [InlineData("NO_CALL", 0.95, KpiOutcome.Acceptable)]                   // exactly 95 % is in normal mode
    [InlineData("INSUFFICIENT_EVIDENCE", 1.0, KpiOutcome.Acceptable)]
    [InlineData("NO_CALL", 0.9499, KpiOutcome.NoFaultOutOfMode)]
    [InlineData("DETECTED_OSCILLATION", 1.0, KpiOutcome.SymptomOnly)]
    [InlineData("CLASSIFIED_FINAL_ELEMENT_NONLINEARITY", 1.0, KpiOutcome.SymptomOnly)]
    [InlineData("SUSPECTED_OSCILLATION", 1.0, KpiOutcome.Finding)]
    [InlineData("CONFIRMED_EXCESSIVE_EFFORT", 1.0, KpiOutcome.Finding)]
    [InlineData("SOMETHING_NEW", 1.0, KpiOutcome.Unrecognised)]
    public void A_verdict_has_exactly_one_outcome(string diagnosis, double auto, KpiOutcome outcome)
    {
        var l = C(Row(diagnosis, auto: auto));
        l.State.Should().Be(KpiState.Assessed);
        l.Outcome.Should().Be(outcome);
    }

    [Fact]
    public void Condition_kpis_follow_the_family_and_the_thresholds()
    {
        FleetKpiClassifier.Matches(C(Row("SUSPECTED_OSCILLATION")), "oscillating").Should().BeTrue();
        FleetKpiClassifier.Matches(C(Row("DETECTED_OSCILLATION")), "oscillating").Should().BeFalse("a symptom is not a finding (Q2)");
        FleetKpiClassifier.Matches(C(Row("SUSPECTED_FINAL_ELEMENT_NONLINEARITY")), "valve").Should().BeTrue();
        FleetKpiClassifier.Matches(C(Row("CONFIRMED_EXCESSIVE_EFFORT")), "effort").Should().BeTrue();
        C(Row("NO_CALL", sat: 0.10)).Saturated.Should().BeFalse("exactly 10 % is not more than 10 %");
        C(Row("NO_CALL", sat: 0.1001)).Saturated.Should().BeTrue();
        C(Row("EXCLUDED_MODE", auto: 0.2)).NormalModeMeasured.Should().BeTrue("a manual-mode window still measured its mode");
        C(Row("INSUFFICIENT_DATA", auto: null)).NormalModeMeasured.Should().BeFalse("not measured is not 0 %");
    }

    [Fact]
    public void Every_number_reconciles_with_its_list()
    {
        var rows = new[]
        {
            Row(null, never: true), Row("NO_CALL", ageS: 7200), Row("INSUFFICIENT_DATA", completeness: 0.5, auto: null),
            Row("EXCLUDED_MODE", auto: 0.1, sat: 0.4), Row("NO_CALL"), Row("NO_CALL", auto: 0.8), Row("DETECTED_OSCILLATION"),
            Row("SUSPECTED_OSCILLATION", sat: 0.2), Row("CONFIRMED_FINAL_ELEMENT_NONLINEARITY"), Row("SUSPECTED_EXCESSIVE_EFFORT"),
        };
        var loops = rows.Select(C).ToList();
        int N(string k) => loops.Count(l => FleetKpiClassifier.Matches(l, k));

        (N("assessed") + N("not-assessable") + N("stale") + N("never-evaluated")).Should().Be(loops.Count);
        (N("acceptable") + N("no-fault-out-of-mode") + N("finding") + N("symptom")).Should().Be(N("assessed"));
        (N("normal-mode") + N("out-of-mode")).Should().Be(loops.Count(l => l.NormalModeMeasured));

        foreach (var f in FleetKpiClassifier.Figures(loops, T))
            f.Count.Should().Be(N(f.Key), $"the {f.Key} tile counts exactly its drill-down");

        N("acceptable").Should().Be(1);
        N("oscillating").Should().Be(1);
        N("saturated").Should().Be(2, "the manual-mode window is saturated too: saturation is measured on any fresh window");
        N("stale").Should().Be(1);
        N("never-evaluated").Should().Be(1);
    }
}
