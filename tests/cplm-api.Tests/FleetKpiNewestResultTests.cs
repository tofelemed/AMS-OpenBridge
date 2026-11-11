// CHG-170 (owner answer 2) - GET fleet/kpis gains `newestResultAt`: the newest result of the window kind across the monitored
// loops in scope (each loop's newest LIVE row of any diagnosis, the row the Overview's Stale KPI judges). Overview, Performance
// and Pipeline Health read this one time with the Overview's rule (Stale once it is older than basis.freshSeconds), so the three
// pages agree. Additive: the existing fields are unchanged.
using FluentAssertions;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetKpiNewestResultTests
{
    private static readonly KpiThresholds T = new();
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 12, 0, 0, TimeSpan.Zero);

    private static KpiLoop Loop(string? diagnosis, double? ageS, DateTimeOffset? lastVerdict = null) =>
        FleetKpiClassifier.Classify(new KpiLoopRow
        {
            LoopId = $"L{Guid.NewGuid():N}"[..10], Diagnosis = diagnosis, WindowEnd = ageS is { } a ? Now.AddSeconds(-a) : null,
            AutoPct = 1.0, SaturationPct = 0.0, G3Status = "PASS", G4Status = "PASS", LastVerdictWindowEnd = lastVerdict,
        }, T, Now);

    [Fact]
    public void Is_the_newest_result_of_any_kind_across_the_loops()
    {
        var loops = new[]
        {
            Loop("NO_CALL", ageS: 96 * 3600),
            Loop("INSUFFICIENT_DATA", ageS: 20 * 60, lastVerdict: Now.AddHours(-108)),   // a result, though not a verdict
            Loop(null, ageS: null),                                                      // never evaluated
        };

        FleetKpiClassifier.NewestResultAt(loops).Should().Be(Now.AddMinutes(-20));
    }

    [Fact]
    public void Is_null_when_no_loop_has_a_result()
    {
        FleetKpiClassifier.NewestResultAt(new[] { Loop(null, ageS: null) }).Should().BeNull();
        FleetKpiClassifier.NewestResultAt(Array.Empty<KpiLoop>()).Should().BeNull();
    }

    [Fact]
    public void Agrees_with_the_stale_kpi_every_loop_is_stale_exactly_when_the_newest_result_is_older_than_fresh_seconds()
    {
        var old = new[] { Loop("NO_CALL", ageS: T.FreshSeconds + 60), Loop("NO_CALL", ageS: 5 * 3600) };
        var newest = FleetKpiClassifier.NewestResultAt(old)!.Value;
        (Now - newest).TotalSeconds.Should().BeGreaterThan(T.FreshSeconds);
        old.Should().OnlyContain(l => FleetKpiClassifier.Matches(l, "stale", null));

        var fresh = old.Append(Loop("NO_CALL", ageS: 600)).ToArray();
        (Now - FleetKpiClassifier.NewestResultAt(fresh)!.Value).TotalSeconds.Should().BeLessOrEqualTo(T.FreshSeconds);
        fresh.Count(l => FleetKpiClassifier.Matches(l, "stale", null)).Should().Be(2);
    }
}
