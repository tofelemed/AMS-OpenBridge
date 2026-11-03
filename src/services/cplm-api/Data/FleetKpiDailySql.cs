// CHG-102 Phase 6: the statements behind analytics.cplm_kpi_daily (one row per plant day, fused window and monitored loop:
// the classification GET fleet/kpis/loops?asOf=<day end> returned, with the values behind it) and its run ledger
// analytics.cplm_kpi_daily_run (one row per day and window: "this day is stored", even when no loop was monitored).
// DDL: scripts/cpm-18-kpi-daily.sql (plant), database/scripts/66_cplm_kpi_daily.sql (lab), migration/schema/03 (fresh).
namespace Traverse.CplmApi.Data;

public static class FleetKpiDailySql
{
    /// <summary>Retention row: days of daily KPI history kept (3 years; NULL = forever).</summary>
    public const string RetentionClass = "KPI_DAILY";
    public const int DefaultRetentionDays = 1095;

    public const string Runs = """
        SELECT day::text AS Day, window_kind AS WindowKind, as_of AS AsOf, rule_version AS RuleVersion, loops AS Loops
        FROM analytics.cplm_kpi_daily_run
        WHERE day >= @from::date AND day <= @to::date
        ORDER BY day, window_kind
        """;

    /// <summary>The stored day whose classification instant is exactly @asOf (the day end it was stored with).</summary>
    public const string RunAt = """
        SELECT day::text AS Day, window_kind AS WindowKind, as_of AS AsOf, rule_version AS RuleVersion, loops AS Loops, thresholds::text AS Thresholds
        FROM analytics.cplm_kpi_daily_run
        WHERE as_of = @asOf AND window_kind = @windowKind
        ORDER BY day DESC
        LIMIT 1
        """;

    public const string DeleteDay = "DELETE FROM analytics.cplm_kpi_daily WHERE day = @day::date AND window_kind = @windowKind";

    /// <summary>One loop's row (executed once per loop inside the day's transaction, after DeleteDay).</summary>
    public const string InsertRow = """
        INSERT INTO analytics.cplm_kpi_daily (day, window_kind, loop_id, as_of, site, area, unit, state, reason, outcome, band,
            family, diagnosis, window_end, age_seconds, fresh, normal_mode_measured, in_normal_mode, saturation_measured,
            saturated, manual_mode_measured, in_manual_mode, limited_by, inputs, rule_version, computed_at)
        VALUES (@day::date, @windowKind, @loopId, @asOf, @site, @area, @unit, @state, @reason, @outcome, @band,
            @family, @diagnosis, @windowEnd, @ageSeconds, @fresh, @normalModeMeasured, @inNormalMode, @saturationMeasured,
            @saturated, @manualModeMeasured, @inManualMode, @limitedBy, @inputs::jsonb, @ruleVersion, @computedAt)
        """;

    public const string UpsertRun = """
        INSERT INTO analytics.cplm_kpi_daily_run (day, window_kind, as_of, rule_version, loops, thresholds, computed_at)
        VALUES (@day::date, @windowKind, @asOf, @ruleVersion, @loops, @thresholds::jsonb, @computedAt)
        ON CONFLICT (day, window_kind) DO UPDATE SET as_of = EXCLUDED.as_of, rule_version = EXCLUDED.rule_version,
            loops = EXCLUDED.loops, thresholds = EXCLUDED.thresholds, computed_at = EXCLUDED.computed_at
        """;

    private const string Scope = """
          AND (@site::text IS NULL OR d.site = @site)
          AND (@area::text IS NULL OR d.area = @area)
          AND (@unit::text IS NULL OR d.unit = @unit)
        """;

    /// <summary>The classification columns only (no inputs): enough for FleetKpiClassifier.Figures over many days.</summary>
    public const string Flags = """
        SELECT d.day::text AS Day, d.loop_id AS LoopId, d.state, d.reason, d.outcome, d.band, d.family, d.age_seconds AS AgeSeconds,
               d.fresh, d.normal_mode_measured AS NormalModeMeasured, d.in_normal_mode AS InNormalMode,
               d.saturation_measured AS SaturationMeasured, d.saturated, d.manual_mode_measured AS ManualModeMeasured,
               d.in_manual_mode AS InManualMode
        FROM analytics.cplm_kpi_daily d
        WHERE d.window_kind = @windowKind AND d.day >= @from::date AND d.day <= @to::date
        """ + Scope;

    /// <summary>One stored day in full: the drill-down rows (inputs = the KpiLoopRow the classifier saw).</summary>
    public const string Day = """
        SELECT d.day::text AS Day, d.loop_id AS LoopId, d.state, d.reason, d.outcome, d.band, d.family, d.age_seconds AS AgeSeconds,
               d.fresh, d.normal_mode_measured AS NormalModeMeasured, d.in_normal_mode AS InNormalMode,
               d.saturation_measured AS SaturationMeasured, d.saturated, d.manual_mode_measured AS ManualModeMeasured,
               d.in_manual_mode AS InManualMode, d.limited_by AS LimitedBy, d.inputs::text AS Inputs
        FROM analytics.cplm_kpi_daily d
        WHERE d.window_kind = @windowKind AND d.day = @day::date
        """ + Scope + "\nORDER BY d.loop_id";

    public const string RetentionDays = "SELECT days FROM analytics.retention_policy WHERE record_class = @c";

    public const string Prune = """
        WITH r AS (DELETE FROM analytics.cplm_kpi_daily WHERE day < @before::date RETURNING 1),
             n AS (DELETE FROM analytics.cplm_kpi_daily_run WHERE day < @before::date RETURNING 1)
        SELECT (SELECT count(*) FROM r)::int
        """;
}
