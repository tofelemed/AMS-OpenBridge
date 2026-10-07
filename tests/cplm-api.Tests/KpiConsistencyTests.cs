// CHG-066 — KPI read-path consistency (lab traverse_cplm): window history is LIVE unless asked otherwise; the fleet
// diagnosis distribution counts the same population as the matrix (monitored loops, LIVE rows); the heatmap carries
// each window's observability flags and honours the health filter.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class KpiConsistencyTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _site = "kpi_site_" + Guid.NewGuid().ToString("N")[..6];
    private string Loop(string n) => $"KPI_{_site[^6..].ToUpperInvariant()}_{n}";

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        foreach (var (n, monitored) in new[] { ("MON", true), ("OFF", false) })
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring)
                VALUES (@loop, 'kpi consistency probe', 'FIC', @site, 'a', 'u', jsonb_build_object('enabled', @monitored))
                """, new { loop = Loop(n), site = _site, monitored });
        // MON: a LIVE verdict (with flags) and a newer REPLAY row; OFF: a LIVE verdict on an unmonitored loop
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, confidence, purpose, payload, created_at)
            VALUES (@mon, '24h', NOW() - interval '2 hours', 'SUSPECTED_OSCILLATION', 0.8, 'LIVE',
                    '{"gates":{"G11":"PASS"},"observability_flags":["HEALTH_NOT_CONFIGURED","NO_VP"]}'::jsonb, NOW()),
                   (@mon, '24h', NOW() - interval '1 hour', 'CONFIRMED_OSCILLATION', 0.95, 'REPLAY', '{}'::jsonb, NOW()),
                   (@off, '24h', NOW() - interval '2 hours', 'SUSPECTED_OSCILLATION', 0.8, 'LIVE', '{}'::jsonb, NOW())
            """, new { mon = Loop("MON"), off = Loop("OFF") });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id IN (@a, @b)", new { a = Loop("MON"), b = Loop("OFF") });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE site = @site", new { site = _site });
        await _db.DisposeAsync();
    }

    private static JsonElement Json(IActionResult r) => JsonSerializer.SerializeToElement(((OkObjectResult)r).Value);

    [Fact]
    public async Task Window_history_is_live_by_default_and_any_on_request()
    {
        var api = new CpmAnalyticsController(_db);
        var live = Json(await api.GetGateHistory(Loop("MON"), "24h", ct: default));
        live.GetProperty("count").GetInt32().Should().Be(1, "the REPLAY row is not a live window");
        live.GetProperty("windows")[0].GetProperty("diagnosis").GetString().Should().Be("SUSPECTED_OSCILLATION");
        var any = Json(await api.GetGateHistory(Loop("MON"), "24h", purpose: "any", ct: default));
        any.GetProperty("count").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task Diagnosis_distribution_counts_monitored_loops_on_live_rows_only()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync<(string Diagnosis, int Count)>(FleetLatestSql.SummaryByDiagnosis,
            new { site = _site, area = (string?)null, unit = (string?)null, windowKind = "24h" })).ToList();
        rows.Should().Equal(("SUSPECTED_OSCILLATION", 1));   // not the newer REPLAY verdict, not the unmonitored loop
    }

    [Fact]
    public async Task Heatmap_rows_carry_the_window_flags_and_honour_the_health_filter()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var args = new { site = _site, area = (string?)null, unit = (string?)null, windowKind = "24h", limit = 10 };
        var row = (await conn.QueryAsync(FleetLatestSql.HeatmapFiltered(""), args)).Single();
        ((string)row.flags).Should().Contain("HEALTH_NOT_CONFIGURED");
        // no PV device is bound to the probe loop, so "missing-binding" keeps it
        (await conn.QueryAsync(FleetLatestSql.HeatmapFiltered(FleetLatestSql.HealthFilter("missing-binding")!), args)).Should().HaveCount(1);
        (await conn.QueryAsync(FleetLatestSql.HeatmapFiltered(FleetLatestSql.HealthFilter("active-affected")!), args)).Should().BeEmpty();
        FleetLatestSql.HealthFilter("bogus").Should().BeNull();
    }
}
