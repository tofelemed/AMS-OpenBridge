// CHG-127: the Overview bar. A loop can count on more than one KPI card; on the bar it counts once, in the first state that
// applies, so the segments sum to the monitored loops and each segment's list is exactly its count.
using FluentAssertions;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetKpiBarTests
{
    private static readonly KpiThresholds T = new();
    private static readonly DateTimeOffset Now = new(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);

    private static KpiLoopRow Row(string? diagnosis, double ageS = 600, double? auto = 1.0, double? sat = 0.0,
        double? manual = 0.0, string? g3 = "PASS", string? g4 = "PASS", bool never = false) => new()
    {
        LoopId = $"L{Guid.NewGuid():N}"[..10], Diagnosis = diagnosis, WindowEnd = never ? null : Now.AddSeconds(-ageS),
        AutoPct = auto, ManualPct = manual, SaturationPct = sat, Completeness = 1.0, BadQualityPct = 0.0, Confidence = 0.9,
        G3Status = g3, G4Status = g4,
    };

    private static KpiLoop C(KpiLoopRow r) => FleetKpiClassifier.Classify(r, T, Now);
    private static string Bar(KpiLoopRow r) => FleetKpiBar.StateOf(C(r));

    [Theory]
    [InlineData("NO_CALL", "bar-acceptable")]
    [InlineData("CONFIRMED_OSCILLATION", "bar-oscillating")]
    [InlineData("SUSPECTED_OSCILLATION", "bar-oscillating")]
    [InlineData("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", "bar-valve")]
    [InlineData("CONFIRMED_EXCESSIVE_EFFORT", "bar-effort")]
    [InlineData("DETECTED_OSCILLATION", "bar-review")]
    [InlineData("CLASSIFIED_OSCILLATION", "bar-review")]
    [InlineData("SOMETHING_NEW", "bar-review")]
    [InlineData("SUSPECTED_NEW_FAMILY", "bar-review")]
    [InlineData("INSUFFICIENT_DATA", "bar-not-assessable")]
    [InlineData("PENDING", "bar-not-assessable")]
    public void A_fresh_verdict_lands_in_its_state(string diagnosis, string expected) => Bar(Row(diagnosis)).Should().Be(expected);

    [Fact]
    public void Age_decides_first_so_an_old_result_never_counts_as_a_finding()
    {
        Bar(Row("CONFIRMED_OSCILLATION", never: true)).Should().Be("bar-never-evaluated");
        Bar(Row("CONFIRMED_OSCILLATION", ageS: 7200)).Should().Be("bar-stale");
        Bar(Row("NO_CALL", ageS: 7200, manual: 1.0, sat: 1.0)).Should().Be("bar-stale", "mode and limit are not read from an old window");
    }

    [Fact]
    public void A_finding_wins_over_mode_and_limit()
    {
        Bar(Row("CONFIRMED_OSCILLATION", sat: 1.0)).Should().Be("bar-oscillating");
        Bar(Row("CONFIRMED_OSCILLATION", auto: 0.0, manual: 1.0)).Should().Be("bar-oscillating");
    }

    [Fact]
    public void Manual_comes_before_not_assessable_because_the_engine_excludes_manual_loops()
    {
        Bar(Row("EXCLUDED_MODE", auto: 0.0, manual: 1.0)).Should().Be("bar-manual");
        Bar(Row("EXCLUDED_MODE", auto: 0.5, manual: 0.4)).Should().Be("bar-not-assessable", "under half the window is not a manual loop");
        Bar(Row("NO_CALL", auto: 0.0, manual: 1.0, sat: 1.0)).Should().Be("bar-manual", "manual comes before saturated");
    }

    [Fact]
    public void Saturated_comes_before_not_assessable_and_after_manual()
    {
        Bar(Row("NO_CALL", sat: 0.9)).Should().Be("bar-saturated");
        Bar(Row("INSUFFICIENT_DATA", sat: 0.9)).Should().Be("bar-saturated");
    }

    [Theory]
    [InlineData(0.5, 0.2, "PASS", "PASS")]     // out of mode, not manual
    [InlineData(1.0, 0.0, "WARN", "PASS")]     // below the good-error floor
    [InlineData(1.0, 0.0, "FAIL", "PASS")]
    [InlineData(1.0, 0.0, null, "PASS")]       // G3 not evaluated is not a pass
    [InlineData(1.0, 0.0, "PASS", "STRONG")]   // strong actuator activity
    public void No_fault_but_a_performance_limit_is_never_shown_as_performing(double auto, double manual, string? g3, string g4) =>
        Bar(Row("NO_CALL", auto: auto, manual: manual, g3: g3, g4: g4)).Should().Be("bar-review");

    private static IReadOnlyList<KpiLoop> Mixed() => new[]
    {
        Row("NO_CALL"), Row("NO_CALL"), Row("INSUFFICIENT_EVIDENCE"),
        Row("CONFIRMED_OSCILLATION"), Row("SUSPECTED_OSCILLATION", sat: 1.0), Row("SUSPECTED_FINAL_ELEMENT_NONLINEARITY"),
        Row("CONFIRMED_EXCESSIVE_EFFORT"), Row("DETECTED_OSCILLATION"), Row("NO_CALL", sat: 0.9),
        Row("EXCLUDED_MODE", auto: 0.0, manual: 1.0), Row("EXCLUDED_MODE", auto: 0.5, manual: 0.4), Row("INSUFFICIENT_DATA"),
        Row("NO_CALL", ageS: 7200), Row("CONFIRMED_OSCILLATION", ageS: 9000), Row("NO_CALL", never: true),
    }.Select(C).ToList();

    [Fact]
    public void Every_loop_is_in_exactly_one_state_and_the_states_sum_to_the_monitored_loops()
    {
        var loops = Mixed();
        var bar = FleetKpiBar.Figures(loops, T);
        bar.Sum(f => f.Count).Should().Be(loops.Count);
        foreach (var l in loops)
            bar.Count(f => FleetKpiClassifier.Matches(l, f.Key)).Should().Be(1, $"{l.Row.Diagnosis} belongs to one state");
    }

    [Fact]
    public void A_segment_counts_exactly_the_loops_its_list_shows()
    {
        var loops = Mixed();
        foreach (var f in FleetKpiBar.Figures(loops, T))
        {
            loops.Count(l => FleetKpiClassifier.Matches(l, f.Key)).Should().Be(f.Count, f.Key);
            f.Denominator.Should().Be(loops.Count);
            f.Rule.Should().NotBeNullOrWhiteSpace();
        }
    }

    [Fact]
    public void The_cards_keep_their_own_counts_because_the_bar_changes_none_of_them()
    {
        var loops = Mixed();
        var cards = FleetKpiClassifier.Figures(loops, T).ToDictionary(f => f.Key, f => f.Count);
        cards["oscillating"].Should().Be(2, "a saturated oscillating loop still counts on Oscillating");
        cards["saturated"].Should().Be(2, "and on Saturated");
        cards["not-assessable"].Should().Be(3, "the excluded manual loop still counts on Not assessable");
        FleetKpiBar.Figures(loops, T).Single(f => f.Key == "bar-saturated").Count.Should().Be(1, "on the bar it counts once");
    }

    [Fact]
    public void The_states_keep_the_owners_order_and_labels_and_are_listable()
    {
        FleetKpiBar.Figures(Array.Empty<KpiLoop>(), T).Select(f => f.Label).Should().Equal(
            "Performing", "Oscillating", "Valve problem", "Excessive effort", "Saturated", "Manual",
            "Not assessable", "Stale", "Never evaluated", "Needs review");
        foreach (var f in FleetKpiBar.Figures(Array.Empty<KpiLoop>(), T))
            FleetKpiBar.IsListKey(f.Key).Should().BeTrue(f.Key);
        FleetKpiBar.IsListKey("oscillating").Should().BeTrue("the existing keys stay listable");
        FleetKpiBar.IsListKey("bar-nonsense").Should().BeFalse();
        FleetKpiClassifier.Keys.Should().NotContain(k => k.StartsWith("bar-"), "the daily table stores the card keys only");
    }

    [Theory]
    [InlineData("bar-manual", "manual-mode")]
    [InlineData("bar-saturated", "saturated")]
    [InlineData("bar-review", "symptom")]
    [InlineData("bar-oscillating", "oscillating")]
    [InlineData("stale", "stale")]
    public void A_bar_list_shows_the_measure_of_the_card_it_comes_from(string key, string rowKey) =>
        FleetKpiBar.RowKey(key).Should().Be(rowKey);

    [Fact]
    public void Needs_review_explains_each_loop_by_its_own_measure()
    {
        FleetKpiBar.RowKeyFor("bar-review", C(Row("DETECTED_OSCILLATION"))).Should().Be("symptom");
        FleetKpiBar.RowKeyFor("bar-review", C(Row("NO_CALL", g3: "WARN"))).Should().Be("no-fault-limited");
        FleetKpiBar.RowKeyFor("bar-stale", C(Row("NO_CALL", ageS: 7200))).Should().Be("stale");
    }
}
