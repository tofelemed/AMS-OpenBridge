// KPI Phase 1 — the endpoints against the lab traverse_cplm: probe loops in their own site with fresh / stale / never rows;
// every figure of GET fleet/kpis equals the `total` of GET fleet/kpis/loops for the same key (the drill-down proves the tile).
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
[Collection("instrument-bindings-lab")]   // reads or writes the shared lab registry: serialised with the other lab tests
public sealed class FleetKpiEndpointTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _site = "kpi_t_" + Guid.NewGuid().ToString("N")[..6];
    private string Loop(string n) => $"KPIT_{_site[^6..].ToUpperInvariant()}_{n}";

    // (name, diagnosis or null = no row, age, payload)
    private (string, string?, string, string)[] Probes => new[]
    {
        ("OK", "NO_CALL", "10 minutes", """{"auto_pct":1.0,"saturation_pct":0.0}"""),
        ("OSC", "CONFIRMED_OSCILLATION", "10 minutes", """{"auto_pct":0.99,"saturation_pct":0.3}"""),
        ("SYM", "DETECTED_OSCILLATION", "10 minutes", """{"auto_pct":1.0,"saturation_pct":0.0}"""),
        ("MAN", "EXCLUDED_MODE", "10 minutes", """{"auto_pct":0.1,"saturation_pct":0.0}"""),
        ("GAP", "INSUFFICIENT_DATA", "10 minutes", """{"completeness":0.66,"bad_quality_pct":0.0}"""),
        ("OLD", "NO_CALL", "3 hours", """{"auto_pct":1.0}"""),
        ("NEW", null, "", ""),
    };

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        foreach (var (n, diagnosis, age, payload) in Probes)
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring)
                VALUES (@loop, 'kpi probe', 'FIC', @site, 'a', 'u', '{"enabled":true}'::jsonb)
                """, new { loop = Loop(n), site = _site });
            if (diagnosis is null) continue;
            await conn.ExecuteAsync($"""
                INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, confidence, purpose, payload, created_at)
                VALUES (@loop, '24h', NOW() - interval '{age}', @diagnosis, 0.9, 'LIVE', @payload::jsonb, NOW())
                """, new { loop = Loop(n), diagnosis, payload });
        }
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id LIKE @p", new { p = $"KPIT_{_site[^6..].ToUpperInvariant()}_%" });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE site = @site", new { site = _site });
        await _db.DisposeAsync();
    }

    private CpmFleetKpiController Api()
    {
        // a fresh cache per controller, so every test reads the database
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build();
        return new CpmFleetKpiController(_db, new FleetReadCache(new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions())), config)
        {
            ControllerContext = new ControllerContext { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() },
        };
    }

    // the API serialises with the ASP.NET web defaults (camelCase)
    private static JsonElement Json(IActionResult r) =>
        JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public async Task Every_figure_equals_its_drill_down_and_the_states_partition_the_loops()
    {
        var api = Api();
        var k = Json(await api.GetKpis(site: _site));
        k.GetProperty("monitored").GetInt32().Should().Be(7);
        var st = k.GetProperty("states");
        st.GetProperty("assessed").GetInt32().Should().Be(3);
        st.GetProperty("notAssessable").GetInt32().Should().Be(2);
        st.GetProperty("stale").GetInt32().Should().Be(1);
        st.GetProperty("neverEvaluated").GetInt32().Should().Be(1);

        var expected = new Dictionary<string, int>
        {
            ["acceptable"] = 1, ["normal-mode"] = 3, ["oscillating"] = 1, ["valve"] = 0, ["effort"] = 0,
            ["saturated"] = 1, ["not-assessable"] = 2, ["stale"] = 1, ["never-evaluated"] = 1,
        };
        foreach (var f in k.GetProperty("kpis").EnumerateArray())
        {
            var key = f.GetProperty("key").GetString()!;
            var count = f.GetProperty("count").GetInt32();
            count.Should().Be(expected[key], key);
            var list = Json(await api.GetKpiLoops(key, site: _site, pageSize: 200));
            list.GetProperty("total").GetInt32().Should().Be(count, $"the {key} tile equals its drill-down");
            list.GetProperty("rows").GetArrayLength().Should().Be(count);
        }
    }

    [Fact]
    public async Task The_previous_picture_is_the_same_rules_on_the_rows_that_existed_24_h_earlier()
    {
        var k = Json(await Api().GetKpis(site: _site));
        var prev = k.GetProperty("previous");
        prev.GetProperty("monitored").GetInt32().Should().Be(7);
        var never = prev.GetProperty("kpis").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "never-evaluated");
        never.GetProperty("count").GetInt32().Should().Be(7, "every probe row is younger than 24 h, so none existed then");
        DateTimeOffset.Parse(prev.GetProperty("asOf").GetString()!).Should()
            .BeCloseTo(DateTimeOffset.Parse(k.GetProperty("computedAt").GetString()!).AddHours(-24), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Drill_down_rows_carry_the_deciding_value_and_reject_unknown_keys()
    {
        var api = Api();
        var gap = Json(await api.GetKpiLoops("not-assessable", reason: "INCOMPLETE_DATA", site: _site)).GetProperty("rows")[0];
        gap.GetProperty("loopId").GetString().Should().Be(Loop("GAP"));
        gap.GetProperty("deciding").GetProperty("value").GetDouble().Should().Be(0.66);
        gap.GetProperty("deciding").GetProperty("threshold").GetDouble().Should().Be(0.95);
        gap.GetProperty("evidenceScore").ValueKind.Should().Be(JsonValueKind.Null, "no score without a verdict");

        var man = Json(await api.GetKpiLoops("out-of-mode", site: _site)).GetProperty("rows")[0];
        man.GetProperty("loopId").GetString().Should().Be(Loop("MAN"));
        man.GetProperty("deciding").GetProperty("value").GetDouble().Should().Be(0.1);

        (await api.GetKpiLoops("bogus", site: _site)).Should().BeOfType<BadRequestObjectResult>();
    }
}
