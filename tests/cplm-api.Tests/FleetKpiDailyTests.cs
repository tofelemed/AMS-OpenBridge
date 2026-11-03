// CHG-102 Phase 6 - three years of Overview-KPI history (analytics.cplm_kpi_daily) on a throwaway PLAIN database built from
// the fresh-install script (migration/schema/03) + cpm-10b + cpm-18: the tables come from the fresh path and cpm-18 is a
// no-op on top; the job stores a day exactly as GET loops?asOf=<day end> returned it live; a second pass changes nothing;
// a rule-version change recomputes only the days whose gate results are kept; the trend reads stored days beyond 14 d
// and today live; days past KPI_DAILY are deleted. Never touches the lab's traverse_cplm.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services.Kpi;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class KpiDailyCplmDb : PlainCplmDb
{
    public KpiDailyCplmDb() : base("cplm_kpi_daily_test") { }

    protected override async Task AfterCpm10bAsync()
    {
        await ApplyAsync(RepoFile("scripts", "cpm-18-kpi-daily.sql"));   // on top of the fresh install: must be a no-op
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = 14 WHERE record_class = 'GATE_RESULTS'");   // the plant's value
    }
}

[Trait("Category", "Integration")]
public sealed class FleetKpiDailyTests : IClassFixture<KpiDailyCplmDb>, IAsyncLifetime
{
    private readonly KpiDailyCplmDb _fx;
    private NpgsqlDataSource Db => _fx.Db;
    private const string Site = "kd";
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);
    private static readonly DateOnly Yesterday = Today.AddDays(-1);
    private static readonly KpiThresholds T = new();
    private static readonly PlantClock Clock = PlantClock.Utc;

    public FleetKpiDailyTests(KpiDailyCplmDb fx) => _fx = fx;

    public async Task InitializeAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            TRUNCATE analytics.cplm_kpi_daily, analytics.cplm_kpi_daily_run;
            DELETE FROM analytics.cplm_gate_results; DELETE FROM cpm.loop_registry;
            INSERT INTO analytics.retention_policy (record_class, days) VALUES ('KPI_DAILY', 1095)
                ON CONFLICT (record_class) DO UPDATE SET days = 1095;
            """);
        // the rows as they stood at yesterday's end (00:00 UTC today): fresh windows of every kind + one stale + one never
        var end = Clock.DayEnd(Yesterday);
        var probes = new (string Loop, string? Diagnosis, int MinutesBefore, string Payload)[]
        {
            ("KD_OK", "NO_CALL", 0, """{"auto_pct":1.0,"saturation_pct":0.0,"gates":{"G3":"PASS","G4":"PASS"}}"""),
            ("KD_OSC", "CONFIRMED_OSCILLATION", 15, """{"auto_pct":0.99,"saturation_pct":0.3}"""),
            ("KD_MAN", "EXCLUDED_MODE", 30, """{"auto_pct":0.1,"manual_pct":0.9}"""),
            ("KD_GAP", "INSUFFICIENT_DATA", 0, """{"completeness":0.66,"bad_quality_pct":0.0}"""),
            ("KD_OLD", "NO_CALL", 300, """{"auto_pct":1.0}"""),
            ("KD_NEW", null, 0, ""),
        };
        foreach (var (loop, diagnosis, before, payload) in probes)
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring)
                VALUES (@loop, 'kpi daily probe', 'FIC', @site, 'a', 'u', '{"enabled":true}'::jsonb)
                """, new { loop, site = Site });
            if (diagnosis is null) continue;
            foreach (var w in KpiThresholds.Windows)
                await conn.ExecuteAsync("""
                    INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, confidence, purpose, payload, created_at)
                    VALUES (@loop, @w, @at, @diagnosis, 0.9, 'LIVE', @payload::jsonb, @at)
                    """, new { loop, w, at = end.AddMinutes(-before), diagnosis, payload });
        }
        // a row AFTER the day end: must not leak into yesterday
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, confidence, purpose, payload, created_at)
            VALUES ('KD_NEW', '12h', @at, 'CONFIRMED_OSCILLATION', 0.9, 'LIVE', '{}'::jsonb, @at)
            """, new { at = end.AddMinutes(5) });
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private Task<FleetKpiDaily.RunResult> RunAsync(PlantClock? clock = null) =>
        FleetKpiDaily.RunOnceAsync(Db, clock ?? Clock, T, DateTimeOffset.UtcNow, TimeSpan.Zero, null, CancellationToken.None);

    private CpmFleetKpiController Api(PlantClock? clock = null) =>
        new(Db, new FleetReadCache(new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions())),
            new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build(), clock ?? Clock)
        {
            ControllerContext = new ControllerContext { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() },
        };

    private static JsonElement Json(IActionResult r) =>
        JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public async Task The_fresh_install_creates_the_tables_and_cpm18_and_its_rollback_are_re_runnable()
    {
        await using var conn = await Db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<string>("SELECT to_regclass('analytics.cplm_kpi_daily')::text")).Should().NotBeNull();
        var pk = await conn.ExecuteScalarAsync<string>("""
            SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'analytics.cplm_kpi_daily'::regclass AND contype = 'p'
            """);
        pk.Should().Be("PRIMARY KEY (day, window_kind, loop_id)");
        (await conn.ExecuteScalarAsync<int>("SELECT days FROM analytics.retention_policy WHERE record_class = 'KPI_DAILY'")).Should().Be(1095);

        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-18-kpi-daily.rollback.sql"));
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-18-kpi-daily.rollback.sql"));
        (await conn.ExecuteScalarAsync<string?>("SELECT to_regclass('analytics.cplm_kpi_daily_run')::text")).Should().BeNull();
        (await RunAsync()).TableMissing.Should().BeTrue("no tables = the job waits, it does not fail");
        Json(await Api().GetTrend(days: 3, site: Site)).GetProperty("points").GetArrayLength().Should().Be(3, "the trend falls back to live");

        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-18-kpi-daily.sql"));
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-18-kpi-daily.sql"));
        (await conn.ExecuteScalarAsync<int>("SELECT days FROM analytics.retention_policy WHERE record_class = 'KPI_DAILY'")).Should().Be(1095);
    }

    [Fact]
    public async Task A_stored_day_equals_the_live_drill_down_as_of_the_day_end()
    {
        var asOf = Clock.DayEnd(Yesterday);
        var before = new Dictionary<string, JsonElement>();
        foreach (var w in KpiThresholds.Windows)
            foreach (var key in FleetKpiClassifier.Keys)
            {
                var live = Json(await Api().GetKpiLoops(key, site: Site, pageSize: 200, asOf: asOf, windowKind: w));
                live.GetProperty("source").GetString().Should().Be("live");
                before[$"{w}|{key}"] = live;
            }

        var r = await RunAsync();
        r.Computed.Should().Be(13 * 2, "every ended day inside the 14-day gate retention, both windows");

        foreach (var w in KpiThresholds.Windows)
            foreach (var key in FleetKpiClassifier.Keys)
            {
                var stored = Json(await Api().GetKpiLoops(key, site: Site, pageSize: 200, asOf: asOf, windowKind: w));
                stored.GetProperty("source").GetString().Should().Be("daily");
                var live = before[$"{w}|{key}"];
                stored.GetProperty("total").GetInt32().Should().Be(live.GetProperty("total").GetInt32(), $"{w} {key}");
                stored.GetProperty("rows").GetRawText().Should().Be(live.GetProperty("rows").GetRawText(), $"{w} {key}: same rows, same values");
                stored.GetProperty("figure").GetRawText().Should().Be(live.GetProperty("figure").GetRawText(), $"{w} {key}");
                stored.GetProperty("computedAt").GetDateTimeOffset().Should().Be(asOf);
            }
        var all = Json(await Api().GetKpiLoops("all", site: Site, pageSize: 200, asOf: asOf));
        all.GetProperty("total").GetInt32().Should().Be(6);
        Json(await Api().GetKpiLoops("oscillating", site: Site, asOf: asOf)).GetProperty("total").GetInt32()
            .Should().Be(1, "the KD_NEW row 5 min after the day end belongs to today");
    }

    [Fact]
    public async Task A_second_pass_changes_nothing_and_a_rule_version_change_recomputes_only_kept_days()
    {
        (await RunAsync()).Computed.Should().Be(26);
        await using var conn = await Db.OpenConnectionAsync();
        var stamp = await conn.ExecuteScalarAsync<DateTime>("SELECT max(computed_at) FROM analytics.cplm_kpi_daily_run");
        var again = await RunAsync();
        (again.Computed, again.Recomputed).Should().Be((0, 0));
        (await conn.ExecuteScalarAsync<DateTime>("SELECT max(computed_at) FROM analytics.cplm_kpi_daily_run")).Should().Be(stamp);

        // yesterday under an older rule version (kept gate results) and a day 40 days back (gate results gone)
        var old = Today.AddDays(-40);
        await conn.ExecuteAsync("UPDATE analytics.cplm_kpi_daily_run SET rule_version = 0 WHERE day = @d::date", new { d = Yesterday.ToString("yyyy-MM-dd") });
        await conn.ExecuteAsync("UPDATE analytics.cplm_kpi_daily SET rule_version = 0 WHERE day = @d::date", new { d = Yesterday.ToString("yyyy-MM-dd") });
        await InsertStoredDayAsync(conn, old, "KD_OSC", ruleVersion: 0);
        var re = await RunAsync();
        (re.Computed, re.Recomputed).Should().Be((0, 2), "yesterday on both windows; the 40-day-old day keeps its own rule version");
        (await conn.ExecuteScalarAsync<int>("SELECT min(rule_version) FROM analytics.cplm_kpi_daily WHERE day = @d::date",
            new { d = Yesterday.ToString("yyyy-MM-dd") })).Should().Be(FleetKpiClassifier.RuleVersion);
        (await conn.ExecuteScalarAsync<int>("SELECT rule_version FROM analytics.cplm_kpi_daily_run WHERE day = @d::date AND window_kind = '12h'",
            new { d = old.ToString("yyyy-MM-dd") })).Should().Be(0);
    }

    [Fact]
    public async Task The_trend_reads_stored_days_beyond_14_days_and_today_live()
    {
        await RunAsync();
        await using var conn = await Db.OpenConnectionAsync();
        var old = Today.AddDays(-40);
        await InsertStoredDayAsync(conn, old, "KD_OSC", FleetKpiClassifier.RuleVersion);

        var t = Json(await Api().GetTrend(days: 45, site: Site));
        t.GetProperty("days").GetInt32().Should().Be(45);
        var points = t.GetProperty("points").EnumerateArray().ToList();
        points.Should().HaveCount(45);
        int Count(JsonElement p, string key) => p.GetProperty("kpis").EnumerateArray()
            .Where(f => f.GetProperty("key").GetString() == key).Select(f => f.GetProperty("count").GetInt32()).FirstOrDefault();

        var now = points[^1];
        (now.GetProperty("isNow").GetBoolean(), now.GetProperty("source").GetString()).Should().Be((true, "live"));
        now.GetProperty("day").GetString().Should().Be(Today.ToString("yyyy-MM-dd"), "today's point names the plant day, so no browser clock labels it the next day");
        var y = points[^2];
        (y.GetProperty("day").GetString(), y.GetProperty("source").GetString()).Should().Be((Yesterday.ToString("yyyy-MM-dd"), "daily"));
        Count(y, "oscillating").Should().Be(1);
        y.GetProperty("monitored").GetInt32().Should().Be(6);

        var o = points.Single(p => p.GetProperty("day").GetString() == old.ToString("yyyy-MM-dd"));
        o.GetProperty("source").GetString().Should().Be("daily");
        Count(o, "oscillating").Should().Be(1);
        o.GetProperty("monitored").GetInt32().Should().Be(1);
        points.Single(p => p.GetProperty("day").GetString() == Today.AddDays(-30).ToString("yyyy-MM-dd"))
            .GetProperty("source").GetString().Should().Be("none", "older than the gate results and never stored");
        Json(await Api().GetTrend(days: 5000, site: Site)).GetProperty("days").GetInt32().Should().Be(1095);

        // the old point's drill-down comes from the table, with the stored values
        var asOf = DateTimeOffset.Parse(o.GetProperty("asOf").GetString()!);
        var list = Json(await Api().GetKpiLoops("oscillating", site: Site, asOf: asOf));
        (list.GetProperty("source").GetString(), list.GetProperty("total").GetInt32()).Should().Be(("daily", 1));
        list.GetProperty("rows")[0].GetProperty("loopId").GetString().Should().Be("KD_OSC");
        list.GetProperty("rows")[0].GetProperty("inputs").GetProperty("autoPct").GetDouble().Should().Be(0.5);
        Json(await Api().GetKpiLoops("oscillating", site: "elsewhere", asOf: asOf)).GetProperty("total").GetInt32().Should().Be(0);
        (await Api().GetKpiLoops("all", site: Site, asOf: asOf.AddHours(6))).Should().BeOfType<BadRequestObjectResult>(
            "an instant older than 14 days that is not a stored day end has no source");
        (await Api().GetKpiLoops("all", site: Site, asOf: Clock.DayEnd(Today.AddDays(-30)))).Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task A_zone_change_re_stores_the_kept_days_and_older_days_stay_readable_at_their_own_end()
    {
        (await RunAsync()).Computed.Should().Be(26);
        await using var conn = await Db.OpenConnectionAsync();
        var old = Today.AddDays(-40);
        await InsertStoredDayAsync(conn, old, "KD_OSC", FleetKpiClassifier.RuleVersion);   // stored under UTC, gate results gone

        var iran = PlantClock.Parse("IR");
        var re = await RunAsync(iran);
        (re.Computed + re.Recomputed).Should().Be(26, "every kept day is re-stored as an Iran day (one may be new if Tehran is a day ahead)");
        var runs = (await conn.QueryAsync<(string Day, DateTime AsOf)>(
            "SELECT day::text, as_of FROM analytics.cplm_kpi_daily_run WHERE day > @d::date", new { d = old.ToString("yyyy-MM-dd") })).ToList();
        runs.Should().OnlyContain(r => new DateTimeOffset(DateTime.SpecifyKind(r.AsOf, DateTimeKind.Utc))
            == iran.DayEnd(DateOnly.ParseExact(r.Day, "yyyy-MM-dd")), "a day ends at 20:30 UTC (Tehran midnight)");
        runs.Should().OnlyContain(r => r.AsOf.TimeOfDay == new TimeSpan(20, 30, 0));
        (await RunAsync(iran)).Recomputed.Should().Be(0, "stable once on the new zone");

        var t = Json(await Api(iran).GetTrend(days: 45, site: Site));
        t.GetProperty("plantDay").GetProperty("zone").GetString().Should().Be("Asia/Tehran");
        t.GetProperty("plantDay").GetProperty("utcOffset").GetString().Should().Be("+03:30");
        var o = t.GetProperty("points").EnumerateArray().Single(p => p.GetProperty("day").GetString() == old.ToString("yyyy-MM-dd"));
        var oldAsOf = DateTimeOffset.Parse(o.GetProperty("asOf").GetString()!);
        oldAsOf.Should().Be(Clock.DayEnd(old), "the old day keeps the UTC end it was stored with");
        Json(await Api(iran).GetKpiLoops("oscillating", site: Site, asOf: oldAsOf)).GetProperty("source").GetString().Should().Be("daily");
    }

    [Fact]
    public async Task Days_past_KPI_DAILY_are_deleted_and_a_null_row_keeps_everything()
    {
        await using var conn = await Db.OpenConnectionAsync();
        var ancient = Today.AddDays(-1100);
        await InsertStoredDayAsync(conn, ancient, "KD_OSC", FleetKpiClassifier.RuleVersion);
        await InsertStoredDayAsync(conn, Today.AddDays(-1000), "KD_OSC", FleetKpiClassifier.RuleVersion);
        await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = NULL WHERE record_class = 'KPI_DAILY'");
        (await RunAsync()).Pruned.Should().Be(0);
        await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = 1095 WHERE record_class = 'KPI_DAILY'");
        (await RunAsync()).Pruned.Should().Be(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.cplm_kpi_daily_run WHERE day < CURRENT_DATE - 1095")).Should().Be(0);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.cplm_kpi_daily WHERE day = @d::date",
            new { d = Today.AddDays(-1000).ToString("yyyy-MM-dd") })).Should().Be(1);
    }

    /// <summary>A stored day the gate results no longer hold: one finding loop on 12h, with its run row.</summary>
    private static async Task InsertStoredDayAsync(NpgsqlConnection conn, DateOnly day, string loop, int ruleVersion)
    {
        var d = day.ToString("yyyy-MM-dd");
        var asOf = Clock.DayEnd(day);
        var inputs = JsonSerializer.Serialize(new KpiLoopRow { LoopId = loop, Site = Site, Diagnosis = "CONFIRMED_OSCILLATION", AutoPct = 0.5,
            Confidence = 0.9, WindowEnd = asOf.AddMinutes(-15) }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_kpi_daily (day, window_kind, loop_id, as_of, site, area, unit, state, outcome, band, family,
                diagnosis, window_end, age_seconds, fresh, normal_mode_measured, in_normal_mode, saturation_measured, saturated,
                manual_mode_measured, in_manual_mode, inputs, rule_version)
            VALUES (@d::date, '12h', @loop, @asOf, @site, 'a', 'u', 'Assessed', 'Finding', 'CONFIRMED', 'OSCILLATION',
                'CONFIRMED_OSCILLATION', @we, 900, true, true, false, false, false, false, false, @inputs::jsonb, @ruleVersion)
            ON CONFLICT DO NOTHING;
            INSERT INTO analytics.cplm_kpi_daily_run (day, window_kind, as_of, rule_version, loops, thresholds)
            VALUES (@d::date, '12h', @asOf, @ruleVersion, 1, '{}'::jsonb) ON CONFLICT DO NOTHING;
            """, new { d, loop, asOf, site = Site, we = asOf.AddMinutes(-15), inputs, ruleVersion });
    }
}
