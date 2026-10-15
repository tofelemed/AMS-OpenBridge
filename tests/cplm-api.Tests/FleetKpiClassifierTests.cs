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
        double? completeness = 1.0, double? badQ = 0.0, string? g0 = null, bool never = false, double? confidence = 0.9,
        double? manual = 0.0, string? g3 = "PASS", string? g4 = "PASS") => new()
    {
        LoopId = $"L{Guid.NewGuid():N}"[..10], Diagnosis = diagnosis, WindowEnd = never ? null : Now.AddSeconds(-ageS),
        AutoPct = auto, ManualPct = manual, SaturationPct = sat, Completeness = completeness, BadQualityPct = badQ,
        Gate0Reason = g0, Confidence = confidence, G3Status = g3, G4Status = g4,
    };

    [Fact]
    public void The_default_window_is_12h_and_every_rule_names_the_window_it_counts()   // CHG-089
    {
        T.WindowKind.Should().Be("12h");
        var loops = new[] { C(Row("NO_CALL")) };
        FleetKpiClassifier.Figures(loops, T).Should().Contain(f => f.Key == "stale" && f.Rule.Contains("12h"));
        FleetKpiClassifier.Figures(loops, T with { WindowKind = "24h" }).Should().Contain(f => f.Key == "stale" && f.Rule.Contains("24h"));
    }

    [Fact]
    public void Manual_mode_is_half_the_window_or_more_and_auto_mode_keeps_the_95_percent_rule()   // CHG-089
    {
        FleetKpiClassifier.Matches(C(Row("EXCLUDED_MODE", auto: 0.5, manual: 0.50)), "manual-mode").Should().BeTrue("exactly 50 % is manual");
        FleetKpiClassifier.Matches(C(Row("EXCLUDED_MODE", auto: 0.5, manual: 0.4999)), "manual-mode").Should().BeFalse();
        FleetKpiClassifier.Matches(C(Row("NO_CALL", manual: null)), "manual-mode").Should().BeFalse("not measured is not manual");
        FleetKpiClassifier.Matches(C(Row("NO_CALL", ageS: 7200, manual: 1.0)), "manual-mode").Should().BeFalse("an old window is not today's mode");
        C(Row("EXCLUDED_MODE", auto: 0.0, manual: 1.0)).ManualModeMeasured.Should().BeTrue();

        var figures = FleetKpiClassifier.Figures(new[] { C(Row("NO_CALL", manual: 0.0)) }, T);
        figures.Single(f => f.Key == "normal-mode").Label.Should().Be("In auto mode");
        var man = figures.Single(f => f.Key == "manual-mode");
        man.Label.Should().Be("In manual mode");
        man.Rule.Should().Contain("50");
        man.Denominator.Should().Be(1, "loops with a measured manual share");
    }

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
    [InlineData("NO_CALL", 0.9499, KpiOutcome.NoFaultLimited)]
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
    public void A_no_fault_loop_at_an_OP_limit_is_not_performing_acceptably()
    {
        C(Row("NO_CALL", sat: 0.27)).Outcome.Should().Be(KpiOutcome.NoFaultLimited, "a saturated loop has no authority");
        C(Row("NO_CALL", sat: 0.10)).Outcome.Should().Be(KpiOutcome.Acceptable, "exactly 10 % is not more than 10 %");
    }

    [Theory]   // CHG-093 (SME review 2 #12): no fault identified is a diagnosis; acceptable control needs its own criteria
    [InlineData("PASS", "PASS", KpiOutcome.Acceptable, "")]
    [InlineData("PASS", "WARN", KpiOutcome.Acceptable, "")]
    [InlineData("WARN", "PASS", KpiOutcome.NoFaultLimited, "G3_BELOW_FLOOR")]
    [InlineData("NOT_EVALUATED", "PASS", KpiOutcome.NoFaultLimited, "G3_NOT_EVALUATED")]
    [InlineData(null, "PASS", KpiOutcome.NoFaultLimited, "G3_NOT_EVALUATED")]
    [InlineData("PASS", "STRONG", KpiOutcome.NoFaultLimited, "G4_STRONG")]
    public void Performing_acceptably_needs_the_performance_gates_not_only_no_fault(string? g3, string? g4, KpiOutcome outcome, string limit)
    {
        var l = C(Row("INSUFFICIENT_EVIDENCE", g3: g3, g4: g4));
        l.Outcome.Should().Be(outcome);
        if (limit == "") l.LimitedBy.Should().BeEmpty();
        else l.LimitedBy.Should().Equal(limit);
    }

    [Fact]
    public void Every_missed_criterion_is_named()
    {
        C(Row("NO_CALL", auto: 0.5, sat: 0.3, g3: "WARN", g4: "STRONG")).LimitedBy
            .Should().Equal("OUT_OF_MODE", "SATURATED", "G3_BELOW_FLOOR", "G4_STRONG");
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
            Row("EXCLUDED_MODE", auto: 0.1, sat: 0.4, manual: 0.9), Row("NO_CALL"), Row("NO_CALL", auto: 0.8), Row("DETECTED_OSCILLATION"),
            Row("SUSPECTED_OSCILLATION", sat: 0.2), Row("CONFIRMED_FINAL_ELEMENT_NONLINEARITY"), Row("SUSPECTED_EXCESSIVE_EFFORT"),
        };
        var loops = rows.Select(C).ToList();
        int N(string k) => loops.Count(l => FleetKpiClassifier.Matches(l, k));

        (N("assessed") + N("not-assessable") + N("stale") + N("never-evaluated")).Should().Be(loops.Count);
        (N("acceptable") + N("no-fault-limited") + N("finding") + N("symptom")).Should().Be(N("assessed"));
        (N("normal-mode") + N("out-of-mode")).Should().Be(loops.Count(l => l.NormalModeMeasured));

        foreach (var f in FleetKpiClassifier.Figures(loops, T))
            f.Count.Should().Be(N(f.Key), $"the {f.Key} tile counts exactly its drill-down");

        N("acceptable").Should().Be(1);
        N("no-fault-limited").Should().Be(1);
        N("oscillating").Should().Be(1);
        N("saturated").Should().Be(2, "the manual-mode window is saturated too: saturation is measured on any fresh window");
        N("stale").Should().Be(1);
        N("never-evaluated").Should().Be(1);
        N("manual-mode").Should().Be(1, "only the manual-mode window spent half its time in MANUAL");
    }
}
