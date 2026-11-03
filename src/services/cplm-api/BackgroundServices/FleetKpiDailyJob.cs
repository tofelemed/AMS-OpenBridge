using Npgsql;
using Traverse.CplmApi.Services.Kpi;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// CHG-102 Phase 6 - once per Cpm:KpiDaily:IntervalMinutes (60) the ended plant days (UTC) that are missing from
/// analytics.cplm_kpi_daily, or stored under an older FleetKpiClassifier.RuleVersion while their gate results are still
/// kept, are classified exactly as GET fleet/kpis/loops?asOf=&lt;day end&gt; does and stored; rows older than retention_policy
/// KPI_DAILY (1095 d) are deleted. A day is taken Cpm:KpiDaily:SettleMinutes (60) after its end, so the 00:00 boundary
/// windows have arrived. The first pass backfills every day inside the gate-result retention (14 d). Registered with the
/// consumers (Cplm:ConsumersEnabled): one writer. A second instance is harmless (each day is replaced in one transaction).
/// Cpm:KpiDaily:Enabled=false turns it off; the tables missing (cpm-18 not applied) is logged and retried next pass.
/// </summary>
public sealed class FleetKpiDailyJob : BackgroundService
{
    private readonly NpgsqlDataSource _db;
    private readonly IConfiguration _config;
    private readonly ILogger<FleetKpiDailyJob> _logger;

    public FleetKpiDailyJob([FromKeyedServices("cplm")] NpgsqlDataSource db, IConfiguration config, ILogger<FleetKpiDailyJob> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!_config.GetValue("Cpm:KpiDaily:Enabled", true)) { _logger.LogInformation("KPI daily disabled by Cpm:KpiDaily:Enabled"); return; }
        var interval = TimeSpan.FromMinutes(Math.Max(5, _config.GetValue("Cpm:KpiDaily:IntervalMinutes", 60)));
        var settle = TimeSpan.FromMinutes(Math.Max(0, _config.GetValue("Cpm:KpiDaily:SettleMinutes", 60)));
        var t = FleetKpiSnapshot.Thresholds(_config);
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var r = await FleetKpiDaily.RunOnceAsync(_db, t, DateTimeOffset.UtcNow, settle, _logger, stoppingToken);
                if (r.TableMissing)
                    _logger.LogWarning("KPI daily: analytics.cplm_kpi_daily_run does not exist (apply scripts/cpm-18-kpi-daily.sql); will retry in {Interval}", interval);
                else if (r.Computed + r.Recomputed + r.Pruned > 0)
                    _logger.LogInformation("KPI daily: {Computed} day-window(s) stored, {Recomputed} recomputed for rule v{Rule}, {Pruned} row(s) past retention deleted",
                        r.Computed, r.Recomputed, FleetKpiClassifier.RuleVersion, r.Pruned);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { _logger.LogWarning(ex, "KPI daily pass failed; will retry in {Interval}", interval); }
            try { await Task.Delay(interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }
}
