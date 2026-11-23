// KPI Phase 1 — the drill-down row: for each loop behind a KPI, the value that decided it next to its threshold, the window it
// was judged on and the inputs a reviewer needs to reproduce it (kpi_calculation_logic/KPI-LOGIC.md section 3.2, "Drill-down").
namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiRows
{
    /// <summary>A FleetKpiSql.Rows row. CHG-226: the window values come from the refill fallback (f_*) when FleetKpiSql found
    /// one, else from the newest row (n_*); WindowEnd is always the newest row's, so freshness is judged by it.</summary>
    public static KpiLoopRow FromDb(dynamic row)
    {
        var r = (IDictionary<string, object?>)row;
        static double? D(object? v) => v is null or DBNull ? null : Convert.ToDouble(v);
        static string? S(object? v) => v as string;
        object? V(string col) => r.TryGetValue(col, out var v) && v is not DBNull ? v : null;
        var lastStored = V("f_window_end") is not null;
        var p = lastStored ? "f_" : "n_";
        object? W(string col) => V(p + col);
        return new KpiLoopRow
        {
            LoopId = (string)V("loop_id")!, DisplayName = S(V("display_name")), Site = S(V("site")), Area = S(V("area")),
            Unit = S(V("unit")), LoopType = S(V("loop_type")), Criticality = S(V("criticality")),
            WindowEnd = Data.RefillSql.Utc(V("n_window_end")), Diagnosis = S(W("diagnosis")), Confidence = D(W("confidence")),
            AutoPct = D(W("auto_pct")), ManualPct = D(W("manual_pct")), SaturationPct = D(W("saturation_pct")),
            LimitSource = S(W("limit_source")), SatLimitDwellS = D(W("sat_limit_dwell_s")), Completeness = D(W("completeness")),
            BadQualityPct = D(W("bad_quality_pct")), SampleCount = D(W("sample_count")), ExpectedSampleCount = D(W("expected_sample_count")),
            MaxGapS = D(W("max_gap_s")), Gate0Reason = S(W("gate0_reason")), PeriodStatus = S(W("period_status")),
            ValidatedPeriodS = D(W("validated_period_s")), AcfRegularity = D(W("acf_regularity")), EffortRatio = D(W("effort_ratio")),
            TravelPerDay = D(W("travel_per_day")), ReversalsPerHour = D(W("reversals_per_hour")), G14State = S(W("g14_state")),
            LastVerdictWindowEnd = Data.RefillSql.Utc(V("v_window_end")), LastVerdictDiagnosis = S(V("v_diagnosis")),
            G3Status = S(W("g3_status")), G4Status = S(W("g4_status")), GoodErrorPct = D(W("good_error_pct")),
            Mae = D(W("mae")), PvSpan = D(V("pv_span")), VpExpectedUnmapped = V("vp_expected_unmapped") is true,
            LastStored = lastStored,
            ResultAt = Data.RefillSql.Utc(W("window_end")),
            UpdatingSince = V("n_refilling") is true ? Data.RefillSql.Utc(V("n_coverage_from")) : null,
        };
    }

    /// <summary>Worst first for the KPI's own measure, then by loop id (stable paging).</summary>
    public static IEnumerable<KpiLoop> Order(IEnumerable<KpiLoop> loops, string kpi) => kpi switch
    {
        "normal-mode" or "out-of-mode" or "acceptable" or "no-fault-limited"
            => loops.OrderBy(l => l.Row.AutoPct ?? double.MaxValue).ThenBy(l => l.Row.LoopId),
        "saturated" => loops.OrderByDescending(l => l.Row.SaturationPct ?? -1).ThenBy(l => l.Row.LoopId),
        "manual-mode" => loops.OrderByDescending(l => l.Row.ManualPct ?? -1).ThenBy(l => l.Row.LoopId),   // CHG-089
        "oscillating" or "valve" or "effort" or "finding" or "symptom" or "periodic"
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
            "normal-mode" or "out-of-mode" or "acceptable" or "no-fault-limited"
                => Pct("Time in AUTO / CASCADE", r.AutoPct, t.NormalModeMin, ">="),
            "saturated" => Pct("Time with OP fully open or closed", r.SaturationPct, t.SaturationMax, ">"),
            "manual-mode" => Pct("Time in MANUAL", r.ManualPct, t.ManualModeMin, ">="),                         // CHG-089
            "oscillating" or "valve" or "effort" or "finding" or "symptom" or "periodic"
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
            loopType = r.LoopType, criticality = r.Criticality, rowKey = kpi,
            state = l.State.ToString(), reason = l.Reason, outcome = l.Outcome.ToString(),
            diagnosis = r.Diagnosis, band = l.Band, family = l.Family,
            // an evidence score only with a verdict (an INSUFFICIENT_DATA row carries confidence 0, which is not a score)
            evidenceScore = verdict && r.Confidence is { } c ? Math.Round(c * 100) : (double?)null,
            windowKind = t.WindowKind, windowEnd = r.WindowEnd, ageSeconds = l.AgeSeconds is { } a ? Math.Round(a) : (double?)null,
            deciding = Deciding(l, kpi, t),
            limitedBy = l.LimitedBy ?? Array.Empty<string>(),
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
                g3Status = r.G3Status, g4Status = r.G4Status, goodErrorPct = r.GoodErrorPct,
                errorPctOfSpan = FleetKpiPerformance.ErrorOfSpan(r),
            },
            lastVerdict = r.LastVerdictDiagnosis is null ? null : new { diagnosis = r.LastVerdictDiagnosis, windowEnd = r.LastVerdictWindowEnd },
            // CHG-226: the loop shows its last stored result while the engine refills after a restart (windowEnd / ageSeconds
            // stay the newest row: freshness); a day stored before rule v2 has no resultAt, its result was the newest row
            lastStored = r.LastStored,
            resultAt = r.ResultAt ?? r.WindowEnd,
            updatingSince = r.UpdatingSince,
        };
    }
}
