using Asp.Versioning;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace AMS.Api.Controllers.V1;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/analytics")]
[Produces("application/json")]
public sealed class AnalyticsController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;

    public AnalyticsController(NpgsqlDataSource dataSource) => _dataSource = dataSource;

    /// <summary>ISA-18.2 KPI aggregates for the Analytics dashboard.</summary>
    [HttpGet("kpi")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> GetKpi(CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var hourlyRatesRaw = await conn.QueryAsync(@"
            SELECT date_trunc('hour', event_time) AS bucket,
                   COUNT(*)::int AS count
            FROM alarms.alarm_history
            WHERE event_time >= NOW() - INTERVAL '24 hours'
            GROUP BY 1
            ORDER BY 1");
        var hourlyRates = hourlyRatesRaw.Select(r => new
        {
            hour = (DateTime)r.bucket,
            count = (int)r.count
        }).ToList();

        var chattering = await conn.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM (
                SELECT source
                FROM alarms.alarm_history
                WHERE event_time >= NOW() - INTERVAL '24 hours'
                GROUP BY source
                HAVING COUNT(*) >= 5
            ) t");

        var fleeting = await conn.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM alarms.alarm_history
            WHERE event_time >= NOW() - INTERVAL '24 hours'
              AND cleared_time IS NOT NULL
              AND cleared_time - event_time < INTERVAL '60 seconds'");

        var total24h = await conn.ExecuteScalarAsync<long>(@"
            SELECT COUNT(*) FROM alarms.alarm_history
            WHERE event_time >= NOW() - INTERVAL '24 hours'");

        var topSources = (await conn.QueryAsync(@"
            SELECT source AS source_name, COUNT(*)::int AS alarm_count
            FROM alarms.alarm_history
            WHERE event_time >= NOW() - INTERVAL '7 days'
            GROUP BY source
            ORDER BY alarm_count DESC
            LIMIT 10"))
            .Select(r => new { sourceName = (string)r.source_name, alarmCount = (int)r.alarm_count })
            .ToList();

        var top10Count = topSources.Sum(x => x.alarmCount);
        var weekTotal = await conn.ExecuteScalarAsync<long>(@"
            SELECT COUNT(*) FROM alarms.alarm_history
            WHERE event_time >= NOW() - INTERVAL '7 days'");

        var stale = await conn.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM alarms.alarm_current
            WHERE ack_status = false
              AND event_time < NOW() - INTERVAL '15 minutes'");

        var priorities = (await conn.QueryAsync(@"
            SELECT CASE
                     WHEN severity >= 900 THEN 'CRITICAL'
                     WHEN severity >= 700 THEN 'HIGH'
                     WHEN severity >= 400 THEN 'MEDIUM'
                     ELSE 'LOW'
                   END AS priority,
                   COUNT(*)::int AS count
            FROM alarms.alarm_current
            GROUP BY 1"))
            .Select(r => new { priority = (string)r.priority, count = (int)r.count })
            .ToList();

        return Ok(new
        {
            hourlyRates,
            chatteringCount = chattering,
            fleetingCount = fleeting,
            top10ContributionPercent = weekTotal > 0 ? (double)top10Count / weekTotal * 100.0 : 0.0,
            badActors = topSources,
            staleAlarmCount = stale,
            totalAlarms24h = total24h,
            priorities,
        });
    }
}
