// CHG-102 Phase 3 — tiered KPI / verdict history reads. Pure: an in-memory IoTDB fake that honours the
// read contract (from <= time < before, newest first, limit) stands in for the historian.
using FluentAssertions;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class KpiHistoryReaderTests
{
    private static readonly DateTime T0 = new(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc);
    private static readonly TimeSpan Step = TimeSpan.FromMinutes(5);

    /// <summary>The historian: points at T0 - k*Step for k in [0, n).</summary>
    private sealed class FakeIotDb : IIotDbReader
    {
        public readonly List<(string Device, long? From, long? Before, int Limit, string? Predicate)> Calls = new();
        public bool Down { get; init; }
        public int Points { get; init; } = 20;
        public Func<long, IReadOnlyDictionary<string, object?>> Values { get; init; } =
            ms => new Dictionary<string, object?> { ["mae"] = ms / 1000.0, ["sample_count"] = 60.0, ["g0"] = "PASS", ["sufficient_data"] = "true" };

        public Task<IotDbRows> ReadNewestAsync(string device, IReadOnlyList<string> columns, long? fromMs, long? beforeMs,
            int limit, string? predicate, CancellationToken ct)
        {
            Calls.Add((device, fromMs, beforeMs, limit, predicate));
            if (Down) return Task.FromResult(IotDbRows.Fail("connection refused"));
            var rows = Enumerable.Range(0, Points)
                .Select(k => new DateTimeOffset(T0 - k * Step).ToUnixTimeMilliseconds())
                .Where(ms => (fromMs is null || ms >= fromMs) && (beforeMs is null || ms < beforeMs))
                .OrderByDescending(ms => ms).Take(limit)
                .Select(ms => new IotDbRow(ms, Values(ms))).ToList();
            return Task.FromResult(new IotDbRows(rows, false, null));
        }
    }

    /// <summary>Layout v1: the reader never asks the historian (for tests of the Postgres-only behaviour).</summary>
    public static KpiHistoryReader PostgresOnly() => Reader(new FakeIotDb(), "v1");

    private static KpiHistoryReader Reader(FakeIotDb fake, string layout = "v2") =>
        new(fake, Options.Create(new IotDbWriteOptions { Layout = layout, KpiDatabase = "root.k", ShortKpiDatabase = "root.ks" }));

    /// <summary>A Postgres short row (Dapper rows are dictionaries) for window k.</summary>
    private static object Pg(int k) => new Dictionary<string, object?>
        { ["window_end"] = T0 - k * Step, ["mae"] = 1.0, ["method_run_ids"] = "{\"G0\":\"x\"}" };

    private static List<object> PgRows(params int[] ks) => ks.Select(Pg).ToList();

    private static DateTime End(object row) => (DateTime)((IDictionary<string, object?>)row)["window_end"]!;
    private static string Source(object row) => (string)((IDictionary<string, object?>)row)["source"]!;

    [Fact]
    public void Parse_maps_the_column_oriented_reply_to_rows_by_bare_measurement()
    {
        const string json = """
            {"expressions":["root.k.gate_12h.L1.mae","root.k.gate_12h.L1.diagnosis","root.k.gate_12h.L1.g0"],
             "column_names":null,"data_types":["FLOAT","TEXT","TEXT"],
             "timestamps":[1793000003000,1793000002000],"values":[[3.5,2.5],["HEALTHY",null],[null,"FAIL"]]}
            """;
        var r = IotDbReadClient.Parse(json);
        r.Degraded.Should().BeFalse();
        r.Rows.Should().HaveCount(2);
        r.Rows[0].TimestampMs.Should().Be(1793000003000);
        r.Rows[0].Values["mae"].Should().Be(3.5);
        r.Rows[0].Values["diagnosis"].Should().Be("HEALTHY");
        r.Rows[0].Values["g0"].Should().BeNull();
        r.Rows[1].Values["g0"].Should().Be("FAIL");
        r.Rows[1].Values["diagnosis"].Should().BeNull();
    }

    [Theory]
    [InlineData("""{"expressions":null,"column_names":null,"data_types":null,"timestamps":[],"values":[]}""", false)]
    [InlineData("""{"code":700,"message":"line 1:90 no viable alternative"}""", true)]
    [InlineData("<html>bad gateway</html>", true)]
    public void Parse_empty_is_empty_and_an_error_body_is_degraded(string json, bool degraded)
    {
        var r = IotDbReadClient.Parse(json);
        r.Rows.Should().BeEmpty();
        r.Degraded.Should().Be(degraded);
    }

    [Fact]
    public void Newest_sql_uses_bare_names_half_open_range_and_desc_limit()
    {
        IotDbReadClient.BuildNewestSql("root.k.gate_12h.L1", new[] { "mae", "g0" }, 100, 200, 7, "diagnosis is null")
            .Should().Be("select mae,g0 from root.k.gate_12h.L1 where time >= 100 and time < 200 and (diagnosis is null) order by time desc limit 7");
        IotDbReadClient.BuildNewestSql("root.k.x", new[] { "mae" }, null, null, 3, null)
            .Should().Be("select mae from root.k.x order by time desc limit 3");
    }

    [Fact]
    public async Task A_full_postgres_page_never_asks_the_historian()
    {
        var fake = new FakeIotDb();
        var r = await Reader(fake).ExtendKpisAsync("L1", "5m", false, null, null, null, 3, PgRows(0, 1, 2), default);
        fake.Calls.Should().BeEmpty();
        r.Rows.Should().HaveCount(3).And.OnlyContain(x => Source(x) == "postgres");
    }

    [Fact]
    public async Task A_short_page_is_completed_strictly_older_than_the_oldest_postgres_row_without_duplicates()
    {
        var fake = new FakeIotDb();   // the historian ALSO holds windows 0..3 (it is written in parallel)
        var r = await Reader(fake).ExtendKpisAsync("FIC-101", "5m", false, null, null, null, 6, PgRows(0, 1, 2, 3), default);

        fake.Calls.Should().ContainSingle();
        var call = fake.Calls[0];
        call.Device.Should().Be("root.ks.short_5m.FIC_101");
        call.Before.Should().Be(new DateTimeOffset(T0 - 3 * Step).ToUnixTimeMilliseconds());
        call.Limit.Should().Be(2);
        r.Rows.Select(End).Should().Equal(Enumerable.Range(0, 6).Select(k => T0 - k * Step));
        r.Rows.Select(Source).Should().Equal("postgres", "postgres", "postgres", "postgres", "historian", "historian");
        r.HistorianCount.Should().Be(2);

        var h = (IDictionary<string, object?>)r.Rows[4];
        h["method_run_ids"].Should().Be("{}");
        h["purpose"].Should().Be("LIVE");
        h["sufficient_data"].Should().Be(true);
        h["gate0_status"].Should().Be("PASS");
        h["sample_count"].Should().Be(60);
        h["created_at"].Should().BeNull();
        KpiHistoryReader.NextBefore(r.Rows, 6, "window_end").Should().Be(new DateTimeOffset(T0 - 5 * Step));
    }

    [Fact]
    public async Task The_cursor_continues_across_the_seam_into_the_historian()
    {
        var fake = new FakeIotDb { Points = 9 };
        var reader = Reader(fake);
        var page1 = await reader.ExtendKpisAsync("L1", "5m", false, null, null, null, 4, PgRows(0, 1), default);
        var cursor = KpiHistoryReader.NextBefore(page1.Rows, 4, "window_end");
        cursor.Should().Be(new DateTimeOffset(T0 - 3 * Step));

        // next page: Postgres holds nothing older, the edge is the cursor itself (exclusive)
        var page2 = await reader.ExtendKpisAsync("L1", "5m", false, null, null, cursor, 4, new List<object>(), default);
        fake.Calls[^1].Before.Should().Be(cursor!.Value.ToUnixTimeMilliseconds());
        page2.Rows.Select(End).Should().Equal(Enumerable.Range(4, 4).Select(k => T0 - k * Step));
        var cursor2 = KpiHistoryReader.NextBefore(page2.Rows, 4, "window_end");

        var page3 = await reader.ExtendKpisAsync("L1", "5m", false, null, null, cursor2, 4, new List<object>(), default);
        page3.Rows.Select(End).Should().Equal(T0 - 8 * Step);
        KpiHistoryReader.NextBefore(page3.Rows, 4, "window_end").Should().BeNull("the end of the data");
        page1.Rows.Concat(page2.Rows).Concat(page3.Rows).Select(End).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task An_empty_postgres_page_uses_the_request_bound_and_from()
    {
        var fake = new FakeIotDb();
        var to = new DateTimeOffset(T0 - 10 * Step);
        var from = new DateTimeOffset(T0 - 13 * Step);
        var r = await Reader(fake).ExtendKpisAsync("L1", "24h", true, from, to, null, 50, new List<object>(), default);

        fake.Calls[0].Device.Should().Be("root.k.long_24h.L1");
        fake.Calls[0].Before.Should().Be(to.ToUnixTimeMilliseconds() + 1, "`to` is inclusive like the Postgres query");
        fake.Calls[0].From.Should().Be(from.ToUnixTimeMilliseconds());
        r.Rows.Select(End).Should().Equal(Enumerable.Range(10, 4).Select(k => T0 - k * Step));
        var row = (IDictionary<string, object?>)r.Rows[0];
        row["long_metrics_qualified"].Should().BeNull("unknown, never claimed qualified");
        row.Should().ContainKey("vw_mae");

        // `before` and `to` together: the tighter wins
        KpiHistoryReader.Edge(new List<object>(), "window_end", to, to.AddMinutes(-1)).Should().Be(to.AddMinutes(-1).ToUnixTimeMilliseconds());
    }

    [Fact]
    public async Task A_range_wholly_inside_what_postgres_answered_does_not_ask_the_historian()
    {
        var fake = new FakeIotDb();
        var from = new DateTimeOffset(T0 - 2 * Step);
        var r = await Reader(fake).ExtendKpisAsync("L1", "5m", false, from, null, null, 10, PgRows(0, 1, 2), default);
        fake.Calls.Should().BeEmpty();
        r.Rows.Should().HaveCount(3);
    }

    [Fact]
    public async Task Historian_down_returns_the_postgres_rows_flagged_degraded()
    {
        var fake = new FakeIotDb { Down = true };
        var r = await Reader(fake).ExtendKpisAsync("L1", "5m", false, null, null, null, 10, PgRows(0, 1), default);
        r.Degraded.Should().BeTrue();
        r.Rows.Select(End).Should().Equal(T0, T0 - Step);
        KpiHistoryReader.NextBefore(r.Rows, 10, "window_end").Should().BeNull();
    }

    [Theory]
    [InlineData("v1", "5m", false)]
    [InlineData("v2", "2m", false)]    // a window kind with no history family
    [InlineData("v2", "6h", true)]
    public async Task Layout_v1_or_a_kind_without_a_family_is_postgres_only(string layout, string kind, bool isLong)
    {
        var fake = new FakeIotDb();
        var r = await Reader(fake, layout).ExtendKpisAsync("L1", kind, isLong, null, null, null, 10, PgRows(0), default);
        fake.Calls.Should().BeEmpty();
        r.Degraded.Should().BeFalse();
        r.Rows.Should().ContainSingle();
    }

    [Fact]
    public void Families_map_only_kinds_the_templates_carry()
    {
        KpiHistorianRows.Family("12h", KpiResultKind.Gate).Should().Be("gate_12h");
        KpiHistorianRows.Family("4h", KpiResultKind.Gate).Should().BeNull();
        KpiHistorianRows.Family("4h", KpiResultKind.Long).Should().Be("long_4h");
        KpiHistorianRows.Family("60m", KpiResultKind.Short).Should().Be("short_60m");
        KpiHistorianRows.Family("12h", KpiResultKind.Short).Should().BeNull();
    }

    private static Dictionary<string, object?> PgSummary(int k)
    {
        dynamic row = new System.Dynamic.ExpandoObject();
        row.loop_id = "L1"; row.window_kind = "12h"; row.window_start = T0 - k * Step - TimeSpan.FromHours(12);
        row.window_end = T0 - k * Step; row.sample_count = 8640; row.diagnosis = "HEALTHY"; row.severity = "LOW";
        row.confidence = 0.9; row.created_at = T0;
        row.payload = """{"gates":{"G0":"PASS","G5":"WARN"},"method_run_ids":{"G0":"r1"},"bundle_hash":"bh","jarSha256":"0123456789abcdef"}""";
        return GateMatrixProjection.Summary(row);
    }

    [Fact]
    public async Task Gate_summaries_are_tiered_for_LIVE_in_the_same_shape_and_hide_insufficient_by_default()
    {
        var fake = new FakeIotDb
        {
            Values = ms => new Dictionary<string, object?>
                { ["diagnosis"] = "SUSPECTED_STICTION", ["severity"] = "HIGH", ["confidence"] = 0.7, ["g0"] = "PASS", ["g2r"] = "WARN", ["g10"] = "FAIL", ["engine"] = "0123456789ab", ["sample_count"] = 8640.0 },
        };
        var pg = new List<object> { PgSummary(0) };
        var r = await Reader(fake).ExtendGateSummariesAsync("L1", "12h", null, null, 3, false, "LIVE", pg, default);

        fake.Calls.Should().ContainSingle();
        fake.Calls[0].Device.Should().Be("root.k.gate_12h.L1");
        fake.Calls[0].Predicate.Should().Be(KpiHistoryReader.ExcludeInsufficient);
        fake.Calls[0].Before.Should().Be(new DateTimeOffset(T0).ToUnixTimeMilliseconds());
        r.Rows.Should().HaveCount(3);

        var pgRow = (Dictionary<string, object?>)r.Rows[0];
        var h = (Dictionary<string, object?>)r.Rows[1];
        h.Keys.Should().BeEquivalentTo(pgRow.Keys, "the historian summary is the Postgres summary's shape");
        pgRow["source"].Should().Be("postgres");
        h["source"].Should().Be("historian");
        h["diagnosis"].Should().Be("SUSPECTED_STICTION");
        h["windowEnd"].Should().Be(T0 - Step);
        h["jarSha256"].Should().Be("0123456789ab");
        ((IDictionary<string, string>)h["methodRunIds"]!).Should().BeEmpty();
        var statuses = ((IEnumerable<object>)h["gates"]!).ToDictionary(
            g => (string)g.GetType().GetProperty("key")!.GetValue(g)!, g => (string?)g.GetType().GetProperty("status")!.GetValue(g));
        statuses["G0"].Should().Be("PASS");
        statuses["G2r"].Should().Be("WARN");
        statuses["G10"].Should().Be("FAIL");
        statuses["G7"].Should().Be("UNKNOWN", "same as a Postgres row without that status");
    }

    [Theory]
    [InlineData("REPLAY", "12h")]
    [InlineData("ANY", "12h")]
    [InlineData("LIVE", "4h")]   // no gate family for 4h
    public async Task Gate_summaries_for_another_purpose_or_kind_stay_postgres_only(string purpose, string kind)
    {
        var fake = new FakeIotDb();
        var r = await Reader(fake).ExtendGateSummariesAsync("L1", kind, null, null, 5, true, purpose, new List<object> { PgSummary(0) }, default);
        fake.Calls.Should().BeEmpty();
        r.Rows.Should().ContainSingle();
    }

    [Fact]
    public async Task Gate_summaries_include_insufficient_when_asked_and_degrade_when_down()
    {
        var up = new FakeIotDb();
        await Reader(up).ExtendGateSummariesAsync("L1", "24h", null, null, 5, true, "LIVE", new List<object>(), default);
        up.Calls[0].Predicate.Should().BeNull();
        up.Calls[0].Before.Should().BeNull("no bound and no Postgres row: newest history first");

        var down = new FakeIotDb { Down = true };
        var r = await Reader(down).ExtendGateSummariesAsync("L1", "24h", null, null, 5, false, "LIVE", new List<object> { PgSummary(0) }, default);
        r.Degraded.Should().BeTrue();
        r.Rows.Should().ContainSingle();
    }
}
