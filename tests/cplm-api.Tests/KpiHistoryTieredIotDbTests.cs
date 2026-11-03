// CHG-102 Phase 3 against a REAL IoTDB (layout v2 scratch databases, infra/docker/iotdb-layout-v2.sh) and a
// throwaway PostgreSQL database (PlainCplmDb shape). Set IOTDB_TEST_URL + IOTDB_TEST_PASSWORD (+ optional
// IOTDB_TEST_KPI_DB / IOTDB_TEST_KPIS_DB, default root.p3test_kpi / root.p3test_kpis); skipped otherwise.
// Proves the endpoint serves Postgres rows, then older history from IoTDB in the same row shape, with no
// duplicate at the seam and a cursor that walks across it; a dead historian degrades, never fails.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.BackgroundServices;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Infrastructure;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>The throwaway Postgres database, created only when the live IoTDB is configured.</summary>
public sealed class TieredHistoryDb : IAsyncLifetime
{
    private sealed class Db : PlainCplmDb { public Db() : base("cplm_tiered_history_test") { } }
    private Db? _db;
    public static readonly string? Url = Environment.GetEnvironmentVariable("IOTDB_TEST_URL");
    public PlainCplmDb Fixture => _db!;
    public bool Live => _db is not null;
    public async Task InitializeAsync()
    {
        if (string.IsNullOrEmpty(Url)) return;
        _db = new Db();
        await _db.InitializeAsync();
    }
    public async Task DisposeAsync() { if (_db is not null) await _db.DisposeAsync(); }
}

[Trait("Category", "Integration")]
public sealed class KpiHistoryTieredIotDbTests : IClassFixture<TieredHistoryDb>
{
    private static readonly string Pw = Environment.GetEnvironmentVariable("IOTDB_TEST_PASSWORD") ?? "root";
    private static readonly string KpiDb = Environment.GetEnvironmentVariable("IOTDB_TEST_KPI_DB") ?? "root.p3test_kpi";
    private static readonly string KpisDb = Environment.GetEnvironmentVariable("IOTDB_TEST_KPIS_DB") ?? "root.p3test_kpis";
    private const string Loop = "P3-TIER-LOOP";
    private static readonly TimeSpan Step = TimeSpan.FromMinutes(5);

    private readonly TieredHistoryDb _fx;
    // whole minutes, so window ends are exact in both stores
    private readonly DateTime _t0 = new(DateTime.UtcNow.Ticks / TimeSpan.TicksPerMinute * TimeSpan.TicksPerMinute, DateTimeKind.Utc);

    public KpiHistoryTieredIotDbTests(TieredHistoryDb fx) => _fx = fx;

    private static IotDbWriteOptions Opts(string url) => new()
        { RestUrl = url, Password = Pw, Layout = "v2", KpiDatabase = KpiDb, ShortKpiDatabase = KpisDb };

    private static IHttpClientFactory Http() => new ServiceCollection().AddHttpClient().BuildServiceProvider()
        .GetRequiredService<IHttpClientFactory>();

    private static KpiHistoryReader Reader(string url) => new(
        new IotDbReadClient(Http(), Options.Create(Opts(url)), NullLogger<IotDbReadClient>.Instance), Options.Create(Opts(url)));

    private static KpiHistoryConsumerService Writer(CplmOptions cplm)
    {
        var o = Opts(TieredHistoryDb.Url!);
        var client = new IotDbWriteClient(Http(), Options.Create(o), NullLogger<IotDbWriteClient>.Instance);
        return new KpiHistoryConsumerService(NullLogger<KpiHistoryConsumerService>.Instance,
            Options.Create(new KafkaOptions { BootstrapServers = "unused:9092" }), Options.Create(cplm),
            Options.Create(o), client, new ConsumerHeartbeat(), new KpiHistoryStats());
    }

    /// <summary>Wipes the probe loop's history points (an earlier run's windows would interleave with this run's).</summary>
    private static async Task ClearHistory(string device)
    {
        var o = Opts(TieredHistoryDb.Url!);
        var client = new IotDbWriteClient(Http(), Options.Create(o), NullLogger<IotDbWriteClient>.Instance);
        (await client.ExecuteAsync($"delete from {device}.**", default)).Should().Be(IotDbWriteOutcome.Ok);
    }

    private DateTime End(int k) => _t0 - k * Step;
    private long Ms(int k) => new DateTimeOffset(End(k)).ToUnixTimeMilliseconds();

    private static string ShortPayload(long endMs, int k) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["loop_id"] = Loop, ["window_kind"] = "5m", ["windowEndMs"] = endMs, ["purpose"] = "LIVE",
        ["calculation_source"] = "flink", ["sample_count"] = 60, ["mae"] = 0.5 + k, ["rmse"] = 1.25,
        ["completeness"] = 1.0, ["sufficient_data"] = k % 2 == 0, ["gate0_status"] = "PASS", ["gate2r_status"] = "WARN",
        ["evaluation_state"] = "EVALUATED", ["bundle_hash"] = "bh-" + k, ["jarSha256"] = "abcdef0123456789abcdef",
    });

    private static string GatePayload(long endMs, string diagnosis) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["loop_id"] = Loop, ["window_kind"] = "12h", ["windowEndMs"] = endMs, ["purpose"] = "LIVE",
        ["calculation_source"] = "flink", ["sample_count"] = 8640, ["diagnosis"] = diagnosis, ["severity"] = "LOW",
        ["confidence"] = 0.75, ["gate0_status"] = "PASS", ["gate10_status"] = "FAIL", ["bundle_hash"] = "bh",
        ["jarSha256"] = "abcdef0123456789abcdef",
    });

    [Fact]
    public async Task Kpi_endpoint_serves_postgres_then_historian_rows_across_the_seam()
    {
        if (!_fx.Live) return;
        var cplm = new CplmOptions();
        var writer = Writer(cplm);
        await ClearHistory($"{KpisDb}.short_5m.P3_TIER_LOOP");
        // the history holds windows 0..9 (written in parallel with Postgres, like the live consumer) ...
        for (var k = 0; k < 10; k++)
            (await writer.WriteAsync(cplm.ShortFeatureTopic, ShortPayload(Ms(k), k), default)).Should().Be(IotDbWriteOutcome.Ok);
        // ... Postgres only the hot window 0..3
        await using (var conn = await _fx.Fixture.Db.OpenConnectionAsync())
        {
            await conn.ExecuteAsync("DELETE FROM analytics.cplm_short_feature_results WHERE loop_id = @Loop", new { Loop });
            for (var k = 0; k < 4; k++)
                await conn.ExecuteAsync("""
                    INSERT INTO analytics.cplm_short_feature_results (loop_id, window_kind, window_end, sample_count, mae, payload, purpose)
                    VALUES (@Loop, '5m', @end, 60, @mae, CAST(@payload AS jsonb), 'LIVE')
                    """, new { Loop, end = End(k), mae = 0.5 + k, payload = ShortPayload(Ms(k), k) });
        }

        var controller = new CpmAnalyticsController(_fx.Fixture.Db, Reader(TieredHistoryDb.Url!));
        var from = new DateTimeOffset(End(8));   // inclusive: windows 0..8
        var page1 = Page(await controller.GetKpiStream(Loop, "5m", from, null, 6, null, default));
        page1.Degraded.Should().BeNull();
        page1.Rows.Select(r => (DateTime)r["window_end"]!).Should().Equal(Enumerable.Range(0, 6).Select(End));
        page1.Rows.Select(r => (string)r["source"]!).Should().Equal("postgres", "postgres", "postgres", "postgres", "historian", "historian");
        page1.NextBefore.Should().Be(new DateTimeOffset(End(5)));

        var pgRow = page1.Rows[0];
        var hRow = page1.Rows[4];
        hRow.Keys.Should().BeEquivalentTo(pgRow.Keys, "the historian row is the Postgres row's shape");
        ((double)hRow["mae"]!).Should().BeApproximately(4.5, 1e-6);
        hRow["sufficient_data"].Should().Be(true);
        hRow["gate2r_status"].Should().Be("WARN");
        hRow["evaluation_state"].Should().Be("EVALUATED");
        hRow["bundle_hash"].Should().Be("bh-4");
        hRow["method_run_ids"].Should().Be("{}");
        page1.Rows[5]["sufficient_data"].Should().Be(false);

        var page2 = Page(await controller.GetKpiStream(Loop, "5m", from, null, 6, page1.NextBefore, default));
        page2.Rows.Select(r => (DateTime)r["window_end"]!).Should().Equal(Enumerable.Range(6, 3).Select(End));
        page2.Rows.Should().OnlyContain(r => (string)r["source"]! == "historian");
        page2.NextBefore.Should().BeNull("window 9 is older than `from`");

        // a dead historian: Postgres rows still served, flagged degraded
        var dead = new CpmAnalyticsController(_fx.Fixture.Db, Reader("http://127.0.0.1:1"));
        var page3 = Page(await dead.GetKpiStream(Loop, "5m", from, null, 6, null, default));
        page3.Degraded.Should().BeTrue();
        page3.Rows.Should().HaveCount(4).And.OnlyContain(r => (string)r["source"]! == "postgres");
    }

    [Fact]
    public async Task Gate_summary_history_older_than_postgres_comes_from_the_verdict_history()
    {
        if (!_fx.Live) return;
        var cplm = new CplmOptions();
        var writer = Writer(cplm);
        await ClearHistory($"{KpiDb}.gate_12h.P3_TIER_LOOP");
        var hour = TimeSpan.FromHours(1);
        DateTime GEnd(int k) => _t0 - k * hour;
        for (var k = 0; k < 5; k++)
            (await writer.WriteAsync(cplm.GateResultsTopic,
                GatePayload(new DateTimeOffset(GEnd(k)).ToUnixTimeMilliseconds(), k == 3 ? "INSUFFICIENT_DATA" : "HEALTHY"), default))
                .Should().Be(IotDbWriteOutcome.Ok);
        await using (var conn = await _fx.Fixture.Db.OpenConnectionAsync())
        {
            await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id = @Loop", new { Loop });
            await conn.ExecuteAsync("""
                INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, sample_count, diagnosis, severity, confidence, payload, purpose)
                VALUES (@Loop, '12h', @end, 8640, 'HEALTHY', 'LOW', 0.75, CAST(@payload AS jsonb), 'LIVE')
                """, new { Loop, end = GEnd(0), payload = GatePayload(new DateTimeOffset(GEnd(0)).ToUnixTimeMilliseconds(), "HEALTHY") });
        }

        var controller = new CpmAnalyticsController(_fx.Fixture.Db, Reader(TieredHistoryDb.Url!));
        var res = Json(await controller.GetGateHistory(Loop, "12h", null, null, 10, false, "summary", "LIVE", default));
        var windows = res.GetProperty("windows").EnumerateArray().ToList();
        windows.Select(w => w.GetProperty("source").GetString()).Should().Equal("postgres", "historian", "historian", "historian");
        windows.Select(w => w.GetProperty("windowEnd").GetDateTime()).Should().Equal(GEnd(0), GEnd(1), GEnd(2), GEnd(4));
        PropertyNames(windows[1]).Should().BeEquivalentTo(PropertyNames(windows[0]), "same summary shape");
        var gates = windows[1].GetProperty("gates").EnumerateArray().ToDictionary(g => g.GetProperty("key").GetString()!, g => g.GetProperty("status").GetString());
        gates["G0"].Should().Be("PASS");
        gates["G10"].Should().Be("FAIL");
        windows[1].GetProperty("jarSha256").GetString().Should().Be("abcdef012345");

        var all = Json(await controller.GetGateHistory(Loop, "12h", null, null, 10, true, "summary", "LIVE", default));
        all.GetProperty("windows").GetArrayLength().Should().Be(5, "includeInsufficient also serves the INSUFFICIENT_DATA verdict");
        var full = Json(await controller.GetGateHistory(Loop, "12h", null, null, 10, false, null, "LIVE", default));
        full.GetProperty("windows").GetArrayLength().Should().Be(1, "the full matrix stays Postgres-only");
    }

    private sealed record KpiPage(List<Dictionary<string, object?>> Rows, DateTimeOffset? NextBefore, bool? Degraded);

    private static KpiPage Page(IActionResult result)
    {
        var value = ((OkObjectResult)result).Value!;
        var t = value.GetType();
        var samples = (IEnumerable<object>)t.GetProperty("samples")!.GetValue(value)!;
        var rows = samples.Select(s => ((IDictionary<string, object?>)s).ToDictionary(kv => kv.Key, kv => kv.Value)).ToList();
        return new KpiPage(rows, (DateTimeOffset?)t.GetProperty("nextBefore")!.GetValue(value), (bool?)t.GetProperty("degraded")!.GetValue(value));
    }

    private static JsonElement Json(IActionResult result) =>
        JsonDocument.Parse(JsonSerializer.Serialize(((OkObjectResult)result).Value,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })).RootElement;

    private static List<string> PropertyNames(JsonElement e) => e.EnumerateObject().Select(p => p.Name).ToList();
}
