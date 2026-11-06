// CHG-127: the Overview bar, "every monitored loop, one state each". The KPI cards may overlap (an oscillating loop can also be
// saturated); the bar may not, so each loop counts once, in the first state that applies. The cards keep their own counts and
// their own rules. Read-time only: nothing here is stored, so RuleVersion and the daily table are untouched.
namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiBar
{
    /// <summary>Bar key, the card whose measure its list shows, label, rule; in the order the bar draws them.</summary>
    private static readonly (string Key, string RowKey, string Label, string Rule)[] States =
    {
        ("bar-acceptable", "acceptable", "Performing", "No fault identified, in normal mode, not at an OP limit, and meeting the performance criteria"),
        ("bar-oscillating", "oscillating", "Oscillating", "Suspected or confirmed oscillation"),
        ("bar-valve", "valve", "Valve problem", "Suspected or confirmed final-element nonlinearity (stiction / backlash)"),
        ("bar-effort", "effort", "Excessive effort", "Suspected or confirmed excessive actuator effort"),
        ("bar-saturated", "saturated", "Saturated", "No finding and not in manual; OP at a limit for most of the window"),
        ("bar-manual", "manual-mode", "Manual", "No finding; in MANUAL for at least half of the window"),
        ("bar-not-assessable", "not-assessable", "Not assessable", "The fresh window could not be judged, and the loop is not in manual or at a limit"),
        ("bar-stale", "stale", "Stale", "The newest result is too old to count"),
        ("bar-never-evaluated", "never-evaluated", "Never evaluated", "No result yet"),
        ("bar-review", "symptom", "Needs review", "A weak symptom, or no fault but a performance criterion is not met"),
    };

    /// <summary>The one state of a loop. Order matters: age first, then findings, then the two operating conditions.</summary>
    public static string StateOf(KpiLoop l)
    {
        if (l.State == KpiState.NeverEvaluated) return "bar-never-evaluated";
        if (l.State == KpiState.Stale) return "bar-stale";
        if (l.Outcome == KpiOutcome.Finding)
        {
            return l.Family switch
            {
                "OSCILLATION" => "bar-oscillating",
                "FINAL_ELEMENT_NONLINEARITY" => "bar-valve",
                "EXCESSIVE_EFFORT" => "bar-effort",
                _ => "bar-review",
            };
        }
        // Before Not assessable: the engine excludes a manual loop from judgement, so that is where these loops would otherwise sit
        if (l.InManualMode) return "bar-manual";
        if (l.Saturated) return "bar-saturated";
        if (l.State == KpiState.NotAssessable) return "bar-not-assessable";
        return l.Outcome == KpiOutcome.Acceptable ? "bar-acceptable" : "bar-review";
    }

    public static IReadOnlyList<KpiFigure> Figures(IReadOnlyList<KpiLoop> loops, KpiThresholds t)
    {
        var counts = loops.GroupBy(StateOf).ToDictionary(g => g.Key, g => g.Count());
        return States.Select(s => new KpiFigure(s.Key, s.Label, counts.GetValueOrDefault(s.Key), loops.Count, "monitored loops", s.Rule)).ToList();
    }

    /// <summary>A key GET loops accepts: every card and drill-down key, and every bar state.</summary>
    public static bool IsListKey(string key) => FleetKpiClassifier.Keys.Contains(key) || States.Any(s => s.Key == key);

    /// <summary>The key a bar list orders and explains its rows by: the card it comes from.</summary>
    public static string RowKey(string key) => States.FirstOrDefault(s => s.Key == key).RowKey ?? key;

    /// <summary>The same for one row: Needs review holds two kinds of loop, and each is explained by its own measure.</summary>
    public static string RowKeyFor(string key, KpiLoop l) =>
        key == "bar-review" && l.Outcome == KpiOutcome.NoFaultLimited ? "no-fault-limited" : RowKey(key);
}
