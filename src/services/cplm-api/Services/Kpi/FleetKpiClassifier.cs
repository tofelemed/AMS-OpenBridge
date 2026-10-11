// KPI Phase 1 — the rules of kpi_calculation_logic/KPI-LOGIC.md (sections 2, 3 and 6), in one pure function. Every Overview
// KPI tile and every drill-down row is produced from Classify(), so the number and its proof cannot drift apart.
namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiClassifier
{
    /// <summary>Drill-down keys, in tile order. "all" lists every monitored loop.</summary>
    public static readonly string[] Keys =
    {
        "all", "acceptable", "finding", "symptom", "no-fault-limited", "oscillating", "valve", "effort",
        "normal-mode", "out-of-mode", "saturated", "not-assessable", "stale", "never-evaluated", "assessed",
    };

    private static readonly Dictionary<string, string> ExcludedReason = new(StringComparer.OrdinalIgnoreCase)
    {
        ["EXCLUDED_MODE"] = "MANUAL_MODE",
        ["EXCLUDED_OPERATING_REGION"] = "OUTSIDE_OPERATING_REGION",
        ["EXCLUDED_INSTRUMENT_HEALTH"] = "INSTRUMENT_HEALTH",
        ["EXCLUDED_DATA_QUALITY"] = "BAD_QUALITY",
        ["EXCLUDED_SENSOR"] = "SENSOR_FAULT",
    };

    public static KpiLoop Classify(KpiLoopRow r, KpiThresholds t, DateTimeOffset now)
    {
        var age = r.WindowEnd is { } we ? (now - we).TotalSeconds : (double?)null;
        var fresh = age is not null && age <= t.FreshSeconds;
        // Mode and saturation are read from the loop's CURRENT window only (fresh) — a week-old AUTO % is not today's.
        var modeMeasured = fresh && r.AutoPct is not null;
        var satMeasured = fresh && r.SaturationPct is not null;
        var inMode = modeMeasured && r.AutoPct!.Value >= t.NormalModeMin;
        var saturated = satMeasured && r.SaturationPct!.Value > t.SaturationMax;

        KpiLoop Make(KpiState s, string? reason = null, KpiOutcome o = KpiOutcome.None, string? band = null, string? family = null) =>
            new(r, s, reason, o, band, family, fresh, modeMeasured, inMode, satMeasured, saturated, age);

        if (r.WindowEnd is null) return Make(KpiState.NeverEvaluated);
        if (!fresh) return Make(KpiState.Stale);

        var d = (r.Diagnosis ?? "").Trim().ToUpperInvariant();
        if (d is "" or "PENDING") return Make(KpiState.NotAssessable, "NOT_YET_JUDGED");
        if (d == "INSUFFICIENT_DATA") return Make(KpiState.NotAssessable, DataReason(r, t));
        if (d.StartsWith("EXCLUDED", StringComparison.Ordinal))
            return Make(KpiState.NotAssessable, ExcludedReason.GetValueOrDefault(d, "EXCLUDED_OTHER"));

        // A verdict. No fault found = NO_CALL (evidence < 35) or INSUFFICIENT_EVIDENCE (no family qualified). Acceptable also
        // needs the loop in its normal mode and NOT at an OP limit: a saturated loop has no authority, whatever its verdict.
        if (d is "NO_CALL" or "INSUFFICIENT_EVIDENCE")
            return Make(KpiState.Assessed, null, inMode && !saturated ? KpiOutcome.Acceptable : KpiOutcome.NoFaultLimited, d);
        var cut = d.IndexOf('_');
        var band = cut > 0 ? d[..cut] : d;
        var family = cut > 0 ? d[(cut + 1)..] : null;
        var outcome = band switch
        {
            "SUSPECTED" or "CONFIRMED" => KpiOutcome.Finding,     // Q2: established findings only
            "DETECTED" or "CLASSIFIED" => KpiOutcome.SymptomOnly,
            _ => KpiOutcome.Unrecognised,
        };
        return Make(KpiState.Assessed, null, outcome, outcome == KpiOutcome.Unrecognised ? null : band, family);
    }

    /// <summary>Why an INSUFFICIENT_DATA window could not be judged: the engine's own G0 reason when it wrote one, else the inputs.</summary>
    private static string DataReason(KpiLoopRow r, KpiThresholds t)
    {
        var g0 = (r.Gate0Reason ?? "").Trim().ToUpperInvariant();
        if (g0.Contains("QUALITY")) return "BAD_QUALITY";
        if (g0.Contains("INCOMPLETE") || g0.Contains("COVERAGE")) return "INCOMPLETE_DATA";
        if (r.BadQualityPct is { } bq && bq >= t.G0BadQualityMax) return "BAD_QUALITY";
        if (r.Completeness is { } c && c < t.G0CompletenessMin) return "INCOMPLETE_DATA";
        return "DATA_QUALIFICATION";
    }

    /// <summary>Whether a classified loop belongs to a drill-down key (the same predicate the tile count uses).</summary>
    public static bool Matches(KpiLoop l, string key, string? reason = null) => key switch
    {
        "all" => true,
        "assessed" => l.State == KpiState.Assessed,
        "acceptable" => l.Outcome == KpiOutcome.Acceptable,
        "finding" => l.Outcome == KpiOutcome.Finding,
        "symptom" => l.Outcome == KpiOutcome.SymptomOnly,
        "no-fault-limited" => l.Outcome == KpiOutcome.NoFaultLimited,
        "oscillating" => l.Outcome == KpiOutcome.Finding && l.Family == "OSCILLATION",
        "valve" => l.Outcome == KpiOutcome.Finding && l.Family == "FINAL_ELEMENT_NONLINEARITY",
        "effort" => l.Outcome == KpiOutcome.Finding && l.Family == "EXCESSIVE_EFFORT",
        "normal-mode" => l.InNormalMode,
        "out-of-mode" => l.NormalModeMeasured && !l.InNormalMode,
        "saturated" => l.Saturated,
        "not-assessable" => l.State == KpiState.NotAssessable && (reason is null || string.Equals(l.Reason, reason, StringComparison.OrdinalIgnoreCase)),
        "stale" => l.State == KpiState.Stale,
        "never-evaluated" => l.State == KpiState.NeverEvaluated,
        _ => false,
    };

    /// <summary>The Overview figures, each counted with Matches() over the same classified loops.</summary>
    public static IReadOnlyList<KpiFigure> Figures(IReadOnlyList<KpiLoop> loops, KpiThresholds t)
    {
        int Count(string key) => loops.Count(l => Matches(l, key));
        var monitored = loops.Count;
        var assessed = Count("assessed");
        var modeMeasured = loops.Count(l => l.NormalModeMeasured);
        var satMeasured = loops.Count(l => l.SaturationMeasured);
        var fresh = $"newest {t.WindowKind} result ≤ {t.FreshSeconds / 60} min old";
        return new[]
        {
            new KpiFigure("acceptable", "Performing acceptably", Count("acceptable"), monitored, "monitored loops",
                $"No fault found (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ {t.NormalModeMin:P0}, not at an OP limit > {t.SaturationMax:P0}, {fresh}"),
            new KpiFigure("normal-mode", "In normal mode", Count("normal-mode"), modeMeasured, "loops with a measured mode",
                $"AUTO / CASCADE ≥ {t.NormalModeMin:P0} of the window (> {1 - t.NormalModeMin:P0} out of design mode = out of mode), {fresh}"),
            new KpiFigure("oscillating", "Oscillating", Count("oscillating"), assessed, "assessed loops",
                $"Suspected or confirmed oscillation (evidence ≥ 75), {fresh}"),
            new KpiFigure("valve", "Suspected valve problem", Count("valve"), assessed, "assessed loops",
                $"Suspected or confirmed final-element nonlinearity (stiction / backlash), {fresh}"),
            new KpiFigure("effort", "Excessive actuator effort", Count("effort"), assessed, "assessed loops",
                $"Suspected or confirmed excessive effort (OP travel / reversals), {fresh}"),
            new KpiFigure("saturated", "Saturated / at limit", Count("saturated"), satMeasured, "loops with a measured OP",
                $"OP fully open or closed > {t.SaturationMax:P0} of the window, {fresh}"),
            new KpiFigure("not-assessable", "Not assessable", Count("not-assessable"), monitored, "monitored loops",
                $"Fresh window could not be judged: incomplete data (< {t.G0CompletenessMin:P0}), bad quality, manual mode, outside region or instrument fault"),
            new KpiFigure("stale", "Stale", Count("stale"), monitored, "monitored loops",
                $"Newest {t.WindowKind} result older than {t.FreshSeconds / 60} min — the pipeline or feed stopped producing"),
            new KpiFigure("never-evaluated", "Never evaluated", Count("never-evaluated"), monitored, "monitored loops",
                $"No {t.WindowKind} result yet — onboarding or mapping gap"),
        };
    }
}
