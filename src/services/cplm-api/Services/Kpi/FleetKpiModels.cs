// KPI Phase 1 — the shapes behind the Overview KPIs (kpi_calculation_logic/KPI-LOGIC.md). One loop → one KpiLoop; every tile
// count is a count of KpiLoop flags and every drill-down row is the same KpiLoop, so a count always equals its list.
namespace Traverse.CplmApi.Services.Kpi;

/// <summary>The thresholds of KPI-LOGIC.md section 6 (configurable: Cpm:Kpi:*; recorded in prod_decision.md).</summary>
public sealed record KpiThresholds(
    int FreshSeconds = 3600,             // Q1: four missed 15-min evaluations
    double NormalModeMin = 0.95,         // Q4a: > 5 % out of design mode = out of mode (Emerson; Bayer / PlantTriage)
    double SaturationMax = 0.10,         // Q4b: fully open / closed > 10 % of the time (Bayer / PlantTriage)
    double G0CompletenessMin = 0.95,     // engine G0 default coverage minimum (reason text only)
    double G0BadQualityMax = 0.50,       // engine G0 default bad-quality maximum (reason text only)
    string WindowKind = "24h");

/// <summary>One registry loop with its newest LIVE row (n_*) and its newest real verdict (v_*), as FleetKpiSql reads it.</summary>
public sealed record KpiLoopRow
{
    public string LoopId { get; init; } = "";
    public string? DisplayName { get; init; }
    public string? Site { get; init; }
    public string? Area { get; init; }
    public string? Unit { get; init; }
    public string? LoopType { get; init; }
    public string? Criticality { get; init; }
    public DateTimeOffset? WindowEnd { get; init; }
    public string? Diagnosis { get; init; }
    public double? Confidence { get; init; }
    public double? AutoPct { get; init; }
    public double? ManualPct { get; init; }
    public double? SaturationPct { get; init; }
    public string? LimitSource { get; init; }
    public double? SatLimitDwellS { get; init; }
    public double? Completeness { get; init; }
    public double? BadQualityPct { get; init; }
    public double? SampleCount { get; init; }
    public double? ExpectedSampleCount { get; init; }
    public double? MaxGapS { get; init; }
    public string? Gate0Reason { get; init; }
    public string? PeriodStatus { get; init; }
    public double? ValidatedPeriodS { get; init; }
    public double? AcfRegularity { get; init; }
    public double? EffortRatio { get; init; }
    public double? TravelPerDay { get; init; }
    public double? ReversalsPerHour { get; init; }
    public string? G14State { get; init; }
    public DateTimeOffset? LastVerdictWindowEnd { get; init; }
    public string? LastVerdictDiagnosis { get; init; }
}

/// <summary>Where a loop stands now — exactly one per monitored loop (they sum to the monitored count).</summary>
public enum KpiState { Assessed, NotAssessable, Stale, NeverEvaluated }

/// <summary>What an assessed verdict says — exactly one per assessed loop.</summary>
public enum KpiOutcome { None, Acceptable, NoFaultOutOfMode, Finding, SymptomOnly, Unrecognised }

/// <summary>The classification of one loop, with every flag a tile counts.</summary>
public sealed record KpiLoop(
    KpiLoopRow Row,
    KpiState State,
    string? Reason,             // NotAssessable: INCOMPLETE_DATA / BAD_QUALITY / DATA_QUALIFICATION / MANUAL_MODE / … ; Stale: none
    KpiOutcome Outcome,
    string? Band,               // NO_CALL / INSUFFICIENT_EVIDENCE / DETECTED / CLASSIFIED / SUSPECTED / CONFIRMED
    string? Family,             // OSCILLATION / FINAL_ELEMENT_NONLINEARITY / EXCESSIVE_EFFORT
    bool Fresh,
    bool NormalModeMeasured,
    bool InNormalMode,
    bool SaturationMeasured,
    bool Saturated,
    double? AgeSeconds);

/// <summary>A KPI as the Overview shows it: count over a stated denominator, with its rule.</summary>
public sealed record KpiFigure(string Key, string Label, int Count, int Denominator, string DenominatorLabel, string Rule);
