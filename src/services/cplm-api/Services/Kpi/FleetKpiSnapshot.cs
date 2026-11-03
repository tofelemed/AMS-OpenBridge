// KPI Phase 1 / CHG-102 Phase 6: the ONE code path that turns the gate results into classified loops "as of" an instant.
// GET fleet/kpis, GET fleet/kpis/loops(?asOf), GET fleet/kpis/trend and the daily job (FleetKpiDailyJob) all call it, so a
// stored day is exactly what loops?asOf=<day end> returned live for the same day.
using Dapper;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Traverse.CplmApi.Data;

namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiSnapshot
{
    /// <summary>The thresholds of KPI-LOGIC.md section 6 from Cpm:Kpi:* (defaults = <see cref="KpiThresholds"/>).</summary>
    public static KpiThresholds Thresholds(IConfiguration config)
    {
        var d = new KpiThresholds();
        return new KpiThresholds(
            config.GetValue("Cpm:Kpi:FreshSeconds", d.FreshSeconds),
            config.GetValue("Cpm:Kpi:NormalModeMin", d.NormalModeMin),
            config.GetValue("Cpm:Kpi:SaturationMax", d.SaturationMax),
            config.GetValue("Cpm:Kpi:G0CompletenessMin", d.G0CompletenessMin),
            config.GetValue("Cpm:Kpi:G0BadQualityMax", d.G0BadQualityMax),
            config.GetValue("Cpm:Kpi:WindowKind", d.WindowKind) ?? d.WindowKind,
            config.GetValue("Cpm:Kpi:ManualModeMin", d.ManualModeMin));
    }

    /// <summary>Every monitored loop in scope, classified with the rows that existed at <paramref name="asOf"/>.</summary>
    public static async Task<IReadOnlyList<KpiLoop>> ClassifyAsync(NpgsqlDataSource db, KpiThresholds t,
        string? site, string? area, string? unit, DateTimeOffset asOf, CancellationToken ct)
    {
        var at = asOf.ToUniversalTime();
        await using var conn = await db.OpenConnectionAsync(ct);
        var raw = await conn.QueryAsync(new CommandDefinition(FleetKpiSql.Rows,
            new { site, area, unit, windowKind = t.WindowKind, asOf = at }, cancellationToken: ct));
        return raw.Select(r => FleetKpiClassifier.Classify((KpiLoopRow)FleetKpiRows.FromDb(r), t, at)).ToList();
    }
}
