// CHG-226 (docs/next-release/flink-restart-data-gap.md, option D) - after a Flink restart the engine marks its refill windows
// ("warming_up": true, "coverage_from_ms"). Owner's rule (23 Nov): lastStored is true ONLY while a loop's newest 12 h / 24 h row is
// such a refill window and its earlier real verdict is used in its place; in every other case lastStored is false and the newest
// row is served as before - normal running, a stale loop, a real outage (G0 INCOMPLETE without the flag), no earlier verdict in
// reach, rows without the flag. Checked on every read: KPI drill-downs, rankings, priority queue, fleet status, heat map,
// gates/latest and the loop KPI summary. Probe loops in their own site on the lab traverse_cplm; removed afterwards.
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
[Collection("instrument-bindings-lab")]   // writes the shared lab registry: serialised with the other lab tests
public sealed class FleetRefillFallbackTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _site = "rf_t_" + Guid.NewGuid().ToString("N")[..6];
    private string Loop(string n) => $"RFT_{_site[^6..].ToUpperInvariant()}_{n}";

    // every probe; only REF is a refill with its verdict in reach
    private static readonly string[] Probes = { "REF", "FAR", "OUT", "WUV", "SRC", "OK", "STL", "NEW" };
    private static readonly string[] NotStored = Probes.Where(n => n != "REF").ToArray();

    // the refill marker as the engine writes it: buffer covers from @cover ago
    private static string Warming(string cover, string extra = "") =>
        $"jsonb_build_object('warming_up', true, 'coverage_from_ms', (extract(epoch FROM now() - interval '{cover}') * 1000)::bigint{extra})";
    private const string NotEnough = ", 'completeness', 0.08, 'gate0_reason', 'INCOMPLETE', 'gates', jsonb_build_object('G0', 'FAIL')";
    private const string Osc = """jsonb_build_object('auto_pct', 0.99, 'saturation_pct', 0.02, 'gates', jsonb_build_object('G0', 'PASS', 'G3', 'PASS'))""";

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        foreach (var n in Probes)
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, criticality, monitoring)
                VALUES (@loop, 'refill probe', 'FIC', @site, 'a', 'u', 'high', '{"enabled":true}'::jsonb)
                """, new { loop = Loop(n), site = _site });
        // REF: a verdict 12.5 h old (older than the 12 h stale age), the engine restarted 1 h ago and refills
        await Row("REF", "12h", "12 hours 30 minutes", "CONFIRMED_OSCILLATION", Osc, runIds: """{"G5":"run-ref"}""");
        await Row("REF", "12h", "10 minutes", "INSUFFICIENT_DATA", Warming("1 hour", NotEnough));
        await Row("REF", "24h", "20 hours", "DETECTED_OSCILLATION", Osc);
        await Row("REF", "24h", "10 minutes", "INSUFFICIENT_DATA", Warming("1 hour", NotEnough));
        // FAR: refilling, but its last verdict ended more than one window length before the coverage start
        await Row("FAR", "12h", "14 hours", "NO_CALL", Osc);
        await Row("FAR", "12h", "10 minutes", "INSUFFICIENT_DATA", Warming("1 hour", NotEnough));
        // OUT: a real outage - incomplete WITHOUT the refill flag (also: rows from a jar that never writes it)
        await Row("OUT", "12h", "12 hours 30 minutes", "CONFIRMED_OSCILLATION", Osc);
        await Row("OUT", "12h", "10 minutes", "INSUFFICIENT_DATA", "jsonb_build_object('completeness', 0.4, 'gate0_reason', 'INCOMPLETE')");
        // WUV: the first real verdict of the refill (still flagged) is the newest result itself
        await Row("WUV", "12h", "2 hours", "CONFIRMED_OSCILLATION", Osc);
        await Row("WUV", "12h", "10 minutes", "NO_CALL", Warming("11 hours 40 minutes", ", 'auto_pct', 1.0"));
        // SRC: the verdict in reach is not the streaming engine's
        await Row("SRC", "12h", "12 hours 30 minutes", "CONFIRMED_OSCILLATION", Osc, source: "historian");
        await Row("SRC", "12h", "10 minutes", "INSUFFICIENT_DATA", Warming("1 hour", NotEnough));
        // OK: normal running, no flag anywhere
        await Row("OK", "12h", "3 hours", "CONFIRMED_OSCILLATION", Osc);
        await Row("OK", "12h", "10 minutes", "NO_CALL", "jsonb_build_object('auto_pct', 1.0)");
        // STL: a refill that stopped - its newest (flagged) row is 3 h old, so the loop is stale, not refilling
        await Row("STL", "12h", "12 hours 30 minutes", "CONFIRMED_OSCILLATION", Osc);
        await Row("STL", "12h", "3 hours", "INSUFFICIENT_DATA", Warming("4 hours", NotEnough));
        // NEW: a new loop - refilling, no earlier verdict at all
        await Row("NEW", "12h", "10 minutes", "INSUFFICIENT_DATA", Warming("1 hour", NotEnough));
        // the findings' open episodes (the queue lists only loops with one: its shelving test reads a NULL as "not queued")
        foreach (var n in new[] { "REF", "OUT", "STL" })
            await conn.ExecuteAsync("""
                INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence)
                VALUES (@loop, '12h', 'OSCILLATION', now() - interval '20 hours', 'CONFIRMED_OSCILLATION', 0.9)
                """, new { loop = Loop(n) });
    }

    private async Task Row(string n, string kind, string age, string diagnosis, string payloadSql, string source = "flink", string runIds = "{}")
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync($"""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, severity, confidence, purpose, source,
                                                     method_run_ids, payload, created_at)
            VALUES (@loop, @kind, now() - interval '{age}', @diagnosis, 'HIGH', 0.9, 'LIVE', @source, @runIds::jsonb, {payloadSql}, now())
            """, new { loop = Loop(n), kind, diagnosis, source, runIds });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_event_frames WHERE loop_id LIKE @p", new { p = $"RFT_{_site[^6..].ToUpperInvariant()}_%" });
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id LIKE @p", new { p = $"RFT_{_site[^6..].ToUpperInvariant()}_%" });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE site = @site", new { site = _site });
        await _db.DisposeAsync();
    }

    private static JsonElement Json(IActionResult r) =>
        JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    private static FleetReadCache Cache() => new(new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions()));
    private static Microsoft.Extensions.Configuration.IConfiguration Config() => new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build();
    private static ControllerContext Ctx() => new() { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() };

    private static void Near(JsonElement e, TimeSpan ago, string because) =>
        e.GetDateTimeOffset().Should().BeCloseTo(DateTimeOffset.UtcNow - ago, TimeSpan.FromMinutes(2), because);

    private JsonElement ById(JsonElement rows, string n) => rows.EnumerateArray().Single(x => x.GetProperty("loopId").GetString() == Loop(n));

    /// <summary>The owner's rule on one list: REF alone is lastStored; every other probe in it says false.</summary>
    private void OnlyRefIsStored(JsonElement rows, string where)
    {
        foreach (var x in rows.EnumerateArray())
        {
            var n = x.GetProperty("loopId").GetString()![(Loop("").Length)..];
            x.GetProperty("lastStored").GetBoolean().Should().Be(n == "REF", $"{where}: {n}");
        }
    }

    [Fact]
    public async Task Kpi_rows_use_the_last_verdict_only_while_the_loop_refills()
    {
        var api = new CpmFleetKpiController(_db, Cache(), Config(), Traverse.CplmApi.Services.Kpi.PlantClock.Utc) { ControllerContext = Ctx() };
        var all = Json(await api.GetKpiLoops("all", site: _site, pageSize: 200)).GetProperty("rows");
        all.GetArrayLength().Should().Be(Probes.Length);
        OnlyRefIsStored(all, "kpi rows");

        var r = ById(all, "REF");
        (r.GetProperty("state").GetString(), r.GetProperty("diagnosis").GetString()).Should().Be(("Assessed", "CONFIRMED_OSCILLATION"));
        Near(r.GetProperty("resultAt"), TimeSpan.FromHours(12.5), "the result shown is the verdict");
        Near(r.GetProperty("updatingSince"), TimeSpan.FromHours(1), "the engine covers again from its restart");
        Near(r.GetProperty("windowEnd"), TimeSpan.FromMinutes(10), "freshness stays the newest row");
        r.GetProperty("inputs").GetProperty("autoPct").GetDouble().Should().Be(0.99, "mode and saturation come from the verdict");

        // every other case: the newest row is the result, exactly as before
        foreach (var (n, state, diagnosis) in new[]
                 {
                     ("FAR", "NotAssessable", "INSUFFICIENT_DATA"), ("OUT", "NotAssessable", "INSUFFICIENT_DATA"),
                     ("SRC", "NotAssessable", "INSUFFICIENT_DATA"), ("NEW", "NotAssessable", "INSUFFICIENT_DATA"),
                     ("WUV", "Assessed", "NO_CALL"), ("OK", "Assessed", "NO_CALL"), ("STL", "Stale", "INSUFFICIENT_DATA"),
                 })
        {
            var x = ById(all, n);
            (x.GetProperty("state").GetString(), x.GetProperty("diagnosis").GetString()).Should().Be((state, diagnosis), n);
            x.GetProperty("resultAt").GetDateTimeOffset().Should().Be(x.GetProperty("windowEnd").GetDateTimeOffset(), $"{n}: the newest row is the result");
        }
        ById(all, "OUT").GetProperty("reason").GetString().Should().Be("INCOMPLETE_DATA", "a real outage still reads Not assessable");
        foreach (var n in new[] { "OUT", "OK", "STL" })
            ById(all, n).GetProperty("updatingSince").ValueKind.Should().Be(JsonValueKind.Null, $"{n} is not refilling");
        Near(ById(all, "FAR").GetProperty("updatingSince"), TimeSpan.FromHours(1), "refilling, but nothing in reach to show");

        var k = Json(await api.GetKpis(site: _site));
        k.GetProperty("states").GetProperty("stale").GetInt32().Should().Be(1, "STL alone: a refill that stopped is stale");
        k.GetProperty("kpis").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "oscillating").GetProperty("count").GetInt32().Should().Be(1);
        // 24 h: a verdict 20 h old is within one window length (24 h) of the coverage start
        var day = Json(await api.GetKpiLoops("all", site: _site, windowKind: "24h", pageSize: 200)).GetProperty("rows");
        OnlyRefIsStored(day, "kpi rows 24h");
        ById(day, "REF").GetProperty("diagnosis").GetString().Should().Be("DETECTED_OSCILLATION");
    }

    [Fact]
    public async Task Fleet_status_rankings_and_the_queue_keep_a_refilling_verdict_current_and_nothing_else()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var args = new { site = _site, area = (string?)null, unit = (string?)null, windowKind = "12h", limit = 50,
            staleSeconds = FleetLatestSql.StaleAfterSeconds("12h") };
        var status = (await conn.QueryAsync<(string Status, int Count)>(FleetLatestSql.SummaryByStatus, args)).ToDictionary(x => x.Status, x => x.Count);
        status.Should().BeEquivalentTo(new Dictionary<string, int> { ["POOR"] = 1, ["STALE"] = 4, ["UNCLASSIFIED"] = 2, ["INSUFFICIENT_DATA"] = 1 },
            "REF is current while it refills; OUT (no flag), FAR (out of reach), SRC (not flink) and STL (refill stopped) stay stale");

        var queue = (await conn.QueryAsync(FleetPrioritySql.Queue(), args)).ToList();
        queue.Select(q => (string)q.loop_id).Should().Equal(new[] { Loop("REF") }, "OUT and STL have open episodes but stale verdicts");
        ((bool)queue[0].last_stored).Should().BeTrue();
        (await conn.ExecuteScalarAsync<int>(FleetPrioritySql.ShelvedCount(), args)).Should().Be(0);

        var api = new CpmFleetController(_db, Cache(), Config()) { ControllerContext = Ctx() };
        var ranked = Json(await api.GetRankings(site: _site, windowKind: "12h")).GetProperty("loops");
        ranked.GetArrayLength().Should().Be(Probes.Length);
        OnlyRefIsStored(ranked, "rankings");
        var r = ById(ranked, "REF");
        Near(r.GetProperty("resultAt"), TimeSpan.FromHours(12.5), "the verdict shown");
        Near(r.GetProperty("updatingSince"), TimeSpan.FromHours(1), "the refill");
        foreach (var n in new[] { "OUT", "OK", "STL" })
            ById(ranked, n).GetProperty("updatingSince").ValueKind.Should().Be(JsonValueKind.Null, n);
        OnlyRefIsStored(Json(await api.GetRankings(site: _site, windowKind: "12h", orderBy: "priority")).GetProperty("loops"), "priority queue");
    }

    [Fact]
    public async Task The_heat_map_serves_the_verdict_only_while_the_loop_refills()
    {
        var api = new CpmFleetController(_db, Cache(), Config()) { ControllerContext = Ctx() };
        var loops = Json(await api.GetHeatmap(site: _site, windowKind: "12h")).GetProperty("loops");
        OnlyRefIsStored(loops, "heat map");

        var r = ById(loops, "REF");
        r.GetProperty("diagnosis").GetString().Should().Be("CONFIRMED_OSCILLATION");
        r.GetProperty("gates").GetProperty("G3").GetString().Should().Be("PASS", "the verdict's gates, not the refill window's");
        r.GetProperty("methodRunIds").GetProperty("G5").GetString().Should().Be("run-ref");
        Near(r.GetProperty("windowEnd"), TimeSpan.FromHours(12.5), "the row is the verdict");
        Near(r.GetProperty("resultAt"), TimeSpan.FromHours(12.5), "the row is the verdict");
        r.GetProperty("lastVerdict").ValueKind.Should().Be(JsonValueKind.Null, "the verdict is the row itself");
        r.TryGetProperty("newestWindow", out _).Should().BeFalse("no screen reads a side note on the heat map");

        foreach (var n in new[] { "OUT", "STL" })
        {
            var o = ById(loops, n);
            o.GetProperty("diagnosis").GetString().Should().Be("INSUFFICIENT_DATA", $"{n}: as before, the newest window");
            o.GetProperty("lastVerdict").GetProperty("diagnosis").GetString().Should().Be("CONFIRMED_OSCILLATION", $"{n}: the old verdict beside, with its age");
            o.GetProperty("gates").GetProperty("G3").GetString().Should().Be("NOT_EVALUATED", n);
            o.GetProperty("updatingSince").ValueKind.Should().Be(JsonValueKind.Null, n);
        }
    }

    [Fact]
    public async Task The_loop_page_serves_the_verdict_matrix_and_kpis_only_while_the_loop_refills()
    {
        var api = new CpmAnalyticsController(_db, KpiHistoryReaderTests.PostgresOnly());
        foreach (var (kind, diagnosis) in new[] { ("12h", "CONFIRMED_OSCILLATION"), ("24h", "DETECTED_OSCILLATION") })
        {
            var m = Json(await api.GetLatestGateMatrix(Loop("REF"), kind));
            (m.GetProperty("served").GetString(), m.GetProperty("diagnosis").GetString()).Should().Be(("verdict", diagnosis), kind);
            m.GetProperty("lastStored").GetBoolean().Should().BeTrue(kind);
            m.GetProperty("resultAt").GetDateTimeOffset().Should().Be(m.GetProperty("windowEnd").GetDateTimeOffset());
            m.GetProperty("newestWindow").GetProperty("diagnosis").GetString().Should().Be("INSUFFICIENT_DATA");
            Near(m.GetProperty("updatingSince"), TimeSpan.FromHours(1), kind);
        }
        foreach (var n in NotStored)
        {
            var m = Json(await api.GetLatestGateMatrix(Loop(n), "12h"));
            (m.GetProperty("served").GetString(), m.GetProperty("lastStored").GetBoolean()).Should().Be(("newest", false), n);
            m.GetProperty("resultAt").GetDateTimeOffset().Should().Be(m.GetProperty("windowEnd").GetDateTimeOffset(), n);
        }
        Json(await api.GetLatestGateMatrix(Loop("OUT"), "12h")).GetProperty("updatingSince").ValueKind.Should().Be(JsonValueKind.Null);
        Json(await api.GetLatestGateMatrix(Loop("STL"), "12h")).GetProperty("updatingSince").ValueKind.Should().Be(JsonValueKind.Null);
        Json(await api.GetLatestGateMatrix(Loop("FAR"), "12h", prefer: "verdict")).GetProperty("lastStored").GetBoolean()
            .Should().BeFalse("asked for the verdict, but it is not the loop's result");

        var kpi = new CpmLoopKpiController(_db);
        var cur = Json(await kpi.Get(Loop("REF"), "12h")).GetProperty("current");
        (cur.GetProperty("diagnosis").GetString(), cur.GetProperty("lastStored").GetBoolean()).Should().Be(("CONFIRMED_OSCILLATION", true));
        cur.GetProperty("values").GetProperty("auto_pct").GetDouble().Should().Be(0.99);
        Near(cur.GetProperty("resultAt"), TimeSpan.FromHours(12.5), "the verdict");
        Near(cur.GetProperty("updatingSince"), TimeSpan.FromHours(1), "the refill");
        foreach (var n in NotStored)
        {
            var c = Json(await kpi.Get(Loop(n), "12h")).GetProperty("current");
            c.GetProperty("lastStored").GetBoolean().Should().BeFalse(n);
            c.GetProperty("resultAt").GetDateTimeOffset().Should().Be(c.GetProperty("windowEnd").GetDateTimeOffset(), n);
        }
    }
}

/// <summary>CHG-226: the refill rule on its own (no database).</summary>
public sealed class RefillRuleTests
{
    private static readonly DateTimeOffset T = new(2026, 11, 23, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Now = T.AddHours(1);
    private static string P(bool? warming, DateTimeOffset? from) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["warming_up"] = warming, ["coverage_from_ms"] = from?.ToUnixTimeMilliseconds(),
    });

    [Fact]
    public void A_fresh_flagged_row_is_refilling_and_anything_else_is_not()
    {
        var fresh = Now.AddMinutes(-10);
        RefillSql.Read(P(true, T), fresh, Now).Should().Be(new RefillSql.Refill(true, T));
        RefillSql.Read(P(true, T), fresh, Now).UpdatingSince.Should().Be(T);
        RefillSql.Read(P(true, T), Now.AddHours(-1), Now).Refilling.Should().BeTrue("exactly the freshness limit is still fresh");
        RefillSql.Read(P(true, T), Now.AddHours(-3), Now).Refilling.Should().BeFalse("a refill that stopped is a stale loop");
        RefillSql.Read(P(true, T), Now.AddHours(-3), Now).UpdatingSince.Should().BeNull();
        RefillSql.Read("""{"completeness":0.1}""", fresh, Now).Should().Be(default(RefillSql.Refill), "missing = false");
        RefillSql.Read(P(false, T), fresh, Now).UpdatingSince.Should().BeNull();
        RefillSql.Read("not json", fresh, Now).Refilling.Should().BeFalse();
        RefillSql.Read(null, fresh, Now).Refilling.Should().BeFalse();
    }

    [Theory]
    [InlineData("12h", -12.0, true)]     // exactly one window length before the coverage start: in reach
    [InlineData("12h", -12.1, false)]
    [InlineData("24h", -23.9, true)]
    [InlineData("4h", -1.0, false)]      // only the fused 12 h / 24 h windows fall back
    public void A_verdict_counts_within_one_window_length_of_the_coverage_start(string kind, double verdictHours, bool expected)
    {
        var refill = new RefillSql.Refill(true, T);
        RefillSql.Qualifies(refill, "INSUFFICIENT_DATA", T.AddHours(verdictHours), "NO_CALL", "flink", kind).Should().Be(expected);
    }

    [Fact]
    public void Never_without_a_refill_a_streaming_verdict_or_when_the_newest_row_is_a_verdict()
    {
        var at = T.AddHours(-1);
        RefillSql.Qualifies(new RefillSql.Refill(false, T), "INSUFFICIENT_DATA", at, "NO_CALL", "flink", "12h").Should().BeFalse("a real outage or a stale loop");
        RefillSql.Qualifies(new RefillSql.Refill(true, null), "INSUFFICIENT_DATA", at, "NO_CALL", "flink", "12h").Should().BeFalse("no coverage start");
        RefillSql.Qualifies(new RefillSql.Refill(true, T), "INSUFFICIENT_DATA", at, "NO_CALL", "historian", "12h").Should().BeFalse("not the streaming engine");
        RefillSql.Qualifies(new RefillSql.Refill(true, T), "NO_CALL", at, "CONFIRMED_OSCILLATION", "flink", "12h").Should().BeFalse("the newest row is the result");
        RefillSql.Qualifies(new RefillSql.Refill(true, T), "INSUFFICIENT_DATA", null, null, null, "12h").Should().BeFalse("no earlier verdict");
    }
}
