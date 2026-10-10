// KPI Phase 4 — one loop's KPIs (lab traverse_cplm): the newest LIVE window now and the newest that existed 24 h earlier,
// with the stored metrics, the engine's gate verdicts that judge them, and the registry spans.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]   // writes the shared lab registry: serialised with the other lab tests
public sealed class LoopKpiEndpointTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "LKPI_" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring, engineering)
            VALUES (@loop, 'loop kpi probe', 'FIC', 'lkpi_site', 'a', 'u', '{"enabled":true}'::jsonb,
                    '{"pvMin":0,"pvMax":200,"pvUnit":"m3/h"}'::jsonb)
            """, new { loop = _loop });
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, confidence, purpose, payload, created_at)
            VALUES (@loop, '24h', NOW() - interval '10 minutes', 'NO_CALL', 0.2, 'LIVE',
                    '{"auto_pct":0.98,"mae":4.0,"pv_std":3.0,"saturation_pct":0.01,"limit_source":"REGISTRY","gates":{"G0":"PASS","G1":"PASS","G3":"WARN"}}'::jsonb, NOW()),
                   (@loop, '24h', NOW() - interval '30 hours', 'NO_CALL', 0.2, 'LIVE',
                    '{"auto_pct":0.90,"mae":6.0,"gates":{"G1":"WARN"}}'::jsonb, NOW())
            """, new { loop = _loop });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id = @loop", new { loop = _loop });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE loop_id = @loop", new { loop = _loop });
        await _db.DisposeAsync();
    }

    private static JsonElement Json(IActionResult r) =>
        JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public async Task Serves_the_current_and_the_previous_window_with_gates_and_spans()
    {
        var k = Json(await new CpmLoopKpiController(_db).Get(_loop.ToLowerInvariant()));
        k.GetProperty("span").GetProperty("pvMax").GetDouble().Should().Be(200);
        var cur = k.GetProperty("current");
        cur.GetProperty("values").GetProperty("auto_pct").GetDouble().Should().Be(0.98);
        cur.GetProperty("values").GetProperty("mae").GetDouble().Should().Be(4.0);
        cur.GetProperty("values").GetProperty("travel_per_day").ValueKind.Should().Be(JsonValueKind.Null, "not stored = not measured, never 0");
        cur.GetProperty("gates").GetProperty("G3").GetString().Should().Be("WARN");
        cur.GetProperty("limitSource").GetString().Should().Be("REGISTRY");
        k.GetProperty("previous").GetProperty("values").GetProperty("auto_pct").GetDouble().Should().Be(0.90);
    }

    [Fact]
    public async Task An_unknown_loop_is_404()
    {
        (await new CpmLoopKpiController(_db).Get("NO_SUCH_LOOP_" + Guid.NewGuid().ToString("N")[..6])).Should().BeOfType<NotFoundObjectResult>();
    }
}
