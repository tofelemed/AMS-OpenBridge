// CHG-093 (SME review 2 #10, #11): the Performance page's headline figures, computed over EVERY assessed loop in the scope —
// the same classification as the Overview KPIs — never over a ranked page. Each figure states its basis: how many loops it
// counts, and how many were left out and why. Error is compared across loops only as a share of the registered PV span
// (MAE / (pvMax − pvMin)); a loop without a span is counted as excluded, never mixed in engineering units.
namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiPerformance
{
    /// <summary>MAE as % of the registered PV span; null when either is missing or the span is not positive.</summary>
    public static double? ErrorOfSpan(KpiLoopRow r) =>
        r.Mae is { } m && r.PvSpan is > 0 ? 100.0 * m / r.PvSpan.Value : null;

    public static object Summarise(IReadOnlyList<KpiLoop> loops)
    {
        var assessed = loops.Where(l => l.State == KpiState.Assessed).ToList();
        var goodError = assessed.Select(l => l.Row.GoodErrorPct).OfType<double>().ToList();
        var withMae = assessed.Where(l => l.Row.Mae is not null).ToList();
        var errorOfSpan = withMae.Select(l => ErrorOfSpan(l.Row)).OfType<double>().ToList();
        // a periodic diagnosis at any band (detected or stronger) — what the engine reached, not a raw ACF period
        var periodic = assessed.Count(l => l.Family is "OSCILLATION" or "FINAL_ELEMENT_NONLINEARITY");
        return new
        {
            monitored = loops.Count,
            assessed = assessed.Count,
            excluded = new
            {
                notAssessable = loops.Count(l => l.State == KpiState.NotAssessable),
                stale = loops.Count(l => l.State == KpiState.Stale),
                neverEvaluated = loops.Count(l => l.State == KpiState.NeverEvaluated),
            },
            goodError = new
            {
                meanPct = goodError.Count > 0 ? 100.0 * goodError.Average() : (double?)null,
                medianPct = Median(goodError) is { } g ? 100.0 * g : (double?)null,
                counted = goodError.Count,
                notMeasured = assessed.Count - goodError.Count,
            },
            errorOfSpan = new
            {
                medianPct = Median(errorOfSpan),
                counted = errorOfSpan.Count,
                noSpan = withMae.Count - errorOfSpan.Count,
                notMeasured = assessed.Count - withMae.Count,
            },
            periodic = new { count = periodic, of = assessed.Count },
        };
    }

    private static double? Median(List<double> xs)
    {
        if (xs.Count == 0) return null;
        var s = xs.OrderBy(x => x).ToList();
        var mid = s.Count / 2;
        return s.Count % 2 == 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2.0;
    }
}
