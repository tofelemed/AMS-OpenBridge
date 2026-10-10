// KPI Phase 1 — the drill-down row: for each loop behind a KPI, the value that decided it next to its threshold, the window it
// was judged on and the inputs a reviewer needs to reproduce it (kpi_calculation_logic/KPI-LOGIC.md section 3.2, "Drill-down").
namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiRows
{
    public static KpiLoopRow FromDb(dynamic r)
    {
        static double? D(object? v) => v is null or DBNull ? null : Convert.ToDouble(v);
        static DateTimeOffset? T(object? v) => v switch
        {
            DateTimeOffset o => o,
            DateTime t => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)),
            _ => null,
        };
        return new KpiLoopRow
        {
            LoopId = (string)r.loop_id, DisplayName = (string?)r.display_name, Site = (string?)r.site, Area = (string?)r.area,
            Unit = (string?)r.unit, LoopType = (string?)r.loop_type, Criticality = (string?)r.criticality,
            WindowEnd = T(r.n_window_end), Diagnosis = (string?)r.n_diagnosis, Confidence = D(r.n_confidence),
            AutoPct = D(r.auto_pct), ManualPct = D(r.manual_pct), SaturationPct = D(r.saturation_pct),
            LimitSource = (string?)r.limit_source, SatLimitDwellS = D(r.sat_limit_dwell_s), Completeness = D(r.completeness),
            BadQualityPct = D(r.bad_quality_pct), SampleCount = D(r.sample_count), ExpectedSampleCount = D(r.expected_sample_count),
            MaxGapS = D(r.max_gap_s), Gate0Reason = (string?)r.gate0_reason, PeriodStatus = (string?)r.period_status,
            ValidatedPeriodS = D(r.validated_period_s), AcfRegularity = D(r.acf_regularity), EffortRatio = D(r.effort_ratio),
            TravelPerDay = D(r.travel_per_day), ReversalsPerHour = D(r.reversals_per_hour), G14State = (string?)r.g14_state,
            LastVerdictWindowEnd = T(r.v_window_end), LastVerdictDiagnosis = (string?)r.v_diagnosis,
        };
    }

    /// <summary>Worst first for the KPI's own measure, then by loop id (stable paging).</summary>
    public static IEnumerable<KpiLoop> Order(IEnumerable<KpiLoop> loops, string kpi) => kpi switch
    {
        "normal-mode" or "out-of-mode" or "acceptable" or "no-fault-out-of-mode"
            => loops.OrderBy(l => l.Row.AutoPct ?? double.MaxValue).ThenBy(l => l.Row.LoopId),
        "saturated" => loops.OrderByDescending(l => l.Row.SaturationPct ?? -1).ThenBy(l => l.Row.LoopId),
        "oscillating" or "valve" or "effort" or "finding" or "symptom"
            => loops.OrderByDescending(l => l.Row.Confidence ?? -1).ThenBy(l => l.Row.LoopId),
        "not-assessable" => loops.OrderBy(l => l.Row.Completeness ?? double.MaxValue).ThenBy(l => l.Row.LoopId),
        "stale" => loops.OrderByDescending(l => l.AgeSeconds ?? 0).ThenBy(l => l.Row.LoopId),
        _ => loops.OrderBy(l => l.Row.LoopId),
    };

    /// <summary>The value that put this loop in this KPI, as {label, value, threshold, unit, comparator, measured}.</summary>
    public static object Deciding(KpiLoop l, string kpi, KpiThresholds t)
    {
        var r = l.Row;
        object Pct(string label, double? v, double threshold, string cmp) =>
            new { label, value = v, threshold, unit = "fraction", comparator = cmp, measured = v is not null };
        return kpi switch
        {
            "normal-mode" or "out-of-mode" or "acceptable" or "no-fault-out-of-mode"
                => Pct("Time in AUTO / CASCADE", r.AutoPct, t.NormalModeMin, ">="),
            "saturated" => Pct("Time with OP fully open or closed", r.SaturationPct, t.SaturationMax, ">"),
            "oscillating" or "valve" or "effort" or "finding" or "symptom"
                => new { label = "Evidence score", value = r.Confidence is { } c ? Math.Round(c * 100) : (double?)null,
                         threshold = 75.0, unit = "score", comparator = ">=", measured = r.Confidence is not null },
            "not-assessable" when l.Reason is "INCOMPLETE_DATA" or "DATA_QUALIFICATION"
                => Pct("Sample completeness", r.Completeness, t.G0CompletenessMin, "<"),
            "not-assessable" when l.Reason == "BAD_QUALITY" => Pct("Bad-quality samples", r.BadQualityPct, t.G0BadQualityMax, ">="),
            "not-assessable" when l.Reason == "MANUAL_MODE" => Pct("Time in AUTO / CASCADE", r.AutoPct, t.NormalModeMin, "<"),
            "stale" => new { label = "Age of the newest result", value = l.AgeSeconds, threshold = (double)t.FreshSeconds,
                             unit = "seconds", comparator = ">", measured = l.AgeSeconds is not null },
            _ => new { label = "State", value = (double?)null, threshold = (double?)null, unit = "", comparator = "", measured = false },
        };
    }

    public static object Row(KpiLoop l, string kpi, KpiThresholds t)
    {
        var r = l.Row;
        var verdict = l.State == KpiState.Assessed;
        return new
        {
            loopId = r.LoopId, displayName = r.DisplayName, site = r.Site, area = r.Area, unit = r.Unit,
            loopType = r.LoopType, criticality = r.Criticality,
            state = l.State.ToString(), reason = l.Reason, outcome = l.Outcome.ToString(),
            diagnosis = r.Diagnosis, band = l.Band, family = l.Family,
            // an evidence score only with a verdict (an INSUFFICIENT_DATA row carries confidence 0, which is not a score)
            evidenceScore = verdict && r.Confidence is { } c ? Math.Round(c * 100) : (double?)null,
            windowKind = t.WindowKind, windowEnd = r.WindowEnd, ageSeconds = l.AgeSeconds is { } a ? Math.Round(a) : (double?)null,
            deciding = Deciding(l, kpi, t),
            inputs = new
            {
                autoPct = r.AutoPct, manualPct = r.ManualPct, saturationPct = r.SaturationPct, limitSource = r.LimitSource,
                satLimitDwellS = r.SatLimitDwellS, completeness = r.Completeness, badQualityPct = r.BadQualityPct,
                sampleCount = r.SampleCount, expectedSampleCount = r.ExpectedSampleCount, maxGapS = r.MaxGapS,
                gate0Reason = r.Gate0Reason,
                // CHG-053 rule: a period of 0 with NO_VALID_CYCLE is "not measured", never 0 s
                periodS = r.ValidatedPeriodS is > 0 ? r.ValidatedPeriodS : null, periodStatus = r.PeriodStatus,
                acfRegularity = r.AcfRegularity, effortRatio = r.EffortRatio, travelPerDay = r.TravelPerDay,
                reversalsPerHour = r.ReversalsPerHour, g14State = r.G14State,
            },
            lastVerdict = r.LastVerdictDiagnosis is null ? null : new { diagnosis = r.LastVerdictDiagnosis, windowEnd = r.LastVerdictWindowEnd },
        };
    }
}
