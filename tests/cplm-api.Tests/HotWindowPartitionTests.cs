// CHG-102 - the short features in HOURLY partitions kept 6 h by DROP (scripts/cpm-17 on top of cpm-10b, plain
// PostgreSQL): the conversion keeps only the last 6 h and leaves the parent (indexes, view, sequence) untouched, the
// self-heal DDL stays a no-op, re-running changes nothing, the maintenance creates the next hours and drops the
// ones past retention_policy.hours, DEFAULT rows move into the hour created for them, the long table is dropped
// by its 1-day row, and the rollback script restores the daily shape.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>cpm-10b's daily shape, seeded with short rows of different ages, then cpm-17. Snapshots taken around cpm-17.</summary>
public class HotWindowCplmDb : PlainCplmDb
{
    public HotWindowCplmDb() : this("cplm_hotwindow_test") { }
    protected HotWindowCplmDb(string name) : base(name) { }

    public Dictionary<string, string> ShortIndexesBefore { get; private set; } = new();
    public Dictionary<string, List<string>> PartitionsBefore { get; } = new();
    public Dictionary<string, List<string>> PartitionsAfter { get; } = new();
    public DateTime AppliedFrom { get; private set; }
    public DateTime AppliedTo { get; private set; }

    public static readonly string[] Tables = { "cplm_short_feature_results", "cplm_long_feature_results", "cplm_gate_results" };

    protected override async Task AfterCpm10bAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        var now = DateTime.UtcNow;
        await FeaturePartitionTests.ShortUpsert(conn, "HW-KEEP", now.AddHours(-1), 10);
        await FeaturePartitionTests.ShortUpsert(conn, "HW-OLD", now.AddHours(-10), 10);
        await FeaturePartitionTests.ShortUpsert(conn, "HW-FUTURE", now.AddMinutes(30), 10);
        ShortIndexesBefore = await HotWindowProbe.Indexes(conn, "cplm_short_feature_results");
        foreach (var t in Tables) PartitionsBefore[t] = await HotWindowProbe.Partitions(conn, t);
        AppliedFrom = DateTime.UtcNow;
        await ApplyAsync(RepoFile("scripts", "cpm-17-hot-window-partitions.sql"));
        AppliedTo = DateTime.UtcNow;
        foreach (var t in Tables) PartitionsAfter[t] = await HotWindowProbe.Partitions(conn, t);
    }
}

internal static class HotWindowProbe
{
    public static async Task<List<string>> Partitions(NpgsqlConnection conn, string t) => (await conn.QueryAsync<string>("""
        SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid JOIN pg_class p ON p.oid = h.inhparent
        JOIN pg_namespace n ON n.oid = p.relnamespace WHERE n.nspname = 'analytics' AND p.relname = @t ORDER BY 1
        """, new { t })).ToList();

    public static async Task<Dictionary<string, string>> Indexes(NpgsqlConnection conn, string t) =>
        (await conn.QueryAsync<(string name, string def)>(
            "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'analytics' AND tablename = @t", new { t }))
        .ToDictionary(r => r.name, r => r.def);

    public static async Task<Dictionary<string, (int? days, int? hours)>> Retention(NpgsqlConnection conn) =>
        (await conn.QueryAsync<(string cls, int? days, int? hours)>(
            "SELECT record_class, days, (to_jsonb(r) ->> 'hours')::int FROM analytics.retention_policy r WHERE record_class IN ('SHORT_FEATURES','LONG_FEATURES','GATE_RESULTS')"))
        .ToDictionary(r => r.cls, r => (r.days, r.hours));

    public static DateTime Hour(DateTime utc) => new(utc.Year, utc.Month, utc.Day, utc.Hour, 0, 0, DateTimeKind.Utc);
    public static string ShortHour(DateTime utc) => $"cplm_short_feature_results_p{utc:yyyyMMddHH}";
    public static bool IsDaily(string name, string t) => name.Length == t.Length + 2 + 8 && name.StartsWith(t + "_p", StringComparison.Ordinal);
    public static bool IsHourly(string name, string t) => name.Length == t.Length + 2 + 10 && name.StartsWith(t + "_p", StringComparison.Ordinal);
    public static async Task<int> Count(NpgsqlConnection conn, string sql) => await conn.ExecuteScalarAsync<int>(sql);
}

[Trait("Category", "Integration")]
public sealed class HotWindowPartitionTests : IClassFixture<HotWindowCplmDb>
{
    private const string Short = "cplm_short_feature_results";
    private readonly HotWindowCplmDb _fx;
    public HotWindowPartitionTests(HotWindowCplmDb fx) => _fx = fx;

    [Fact]
    public async Task Cpm17_makes_the_short_table_hourly_and_keeps_only_the_last_6_hours()
    {
        var after = _fx.PartitionsAfter[Short];
        after.Should().Contain(Short + "_default");
        after.Should().NotContain(n => HotWindowProbe.IsDaily(n, Short), "every day partition of the short table is dropped");
        var hours = after.Where(n => HotWindowProbe.IsHourly(n, Short)).ToList();
        hours.Should().HaveCount(10, "the copy window (6 h) back to the current hour + 3");
        var last = new[] { _fx.AppliedFrom, _fx.AppliedTo }.Select(t => HotWindowProbe.ShortHour(HotWindowProbe.Hour(t).AddHours(3)));
        last.Should().Contain(hours.Max(), "the newest hour is the current hour + 3");
        _fx.PartitionsAfter["cplm_long_feature_results"].Should().Equal(_fx.PartitionsBefore["cplm_long_feature_results"]);
        _fx.PartitionsAfter["cplm_gate_results"].Should().Equal(_fx.PartitionsBefore["cplm_gate_results"]);

        await using var conn = await _fx.Db.OpenConnectionAsync();
        var loops = (await conn.QueryAsync<string>($"SELECT loop_id FROM analytics.{Short} WHERE loop_id IN ('HW-KEEP', 'HW-OLD', 'HW-FUTURE') ORDER BY 1")).ToList();
        loops.Should().Equal("HW-FUTURE", "HW-KEEP");   // HW-OLD (10 h) is not carried over
        (await HotWindowProbe.Retention(conn)).Should().Equal(new Dictionary<string, (int?, int?)>
        {
            ["SHORT_FEATURES"] = (1, 6), ["LONG_FEATURES"] = (1, null), ["GATE_RESULTS"] = (30, null),
        });
    }

    [Fact]
    public async Task Cpm17_leaves_the_parent_indexes_view_key_and_sequence_as_cpm10b_made_them()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        (await HotWindowProbe.Indexes(conn, Short)).Should().Equal(_fx.ShortIndexesBefore);
        (await conn.ExecuteScalarAsync<string>(
            "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname = @t AND c.contype = 'p'", new { t = Short }))
            .Should().Be("PRIMARY KEY (id, window_end)");
        (await conn.ExecuteScalarAsync<string>("SELECT column_default FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = @t AND column_name = 'id'", new { t = Short }))
            .Should().Contain("nextval");
        (await HotWindowProbe.Count(conn, "SELECT count(*) FROM pg_views WHERE schemaname = 'analytics' AND viewname = 'cplm_short_feature_latest'")).Should().Be(1);
        var parts = await HotWindowProbe.Partitions(conn, Short);
        (await HotWindowProbe.Count(conn, "SELECT count(*) FROM pg_inherits WHERE inhparent = 'analytics.idx_cplm_short_created_at'::regclass"))
            .Should().Be(parts.Count, "every hourly child carries the parent's created_at index (the evidence reconciler's scan)");
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM pg_class c JOIN pg_inherits i ON i.inhrelid = c.oid WHERE i.inhparent = 'analytics.{Short}'::regclass AND pg_get_userbyid(c.relowner) <> 'ams_user'"))
            .Should().Be(0, "cplm-api (ams_user) drops these partitions later");
    }

    [Fact]
    public async Task The_startup_self_heal_ddl_is_a_no_op_on_the_hourly_shape()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var idx = await HotWindowProbe.Indexes(conn, Short);
        var parts = await HotWindowProbe.Partitions(conn, Short);
        await using (var cmd = new NpgsqlCommand(CplmResultSchema.Ddl, conn) { CommandTimeout = 120 }) await cmd.ExecuteNonQueryAsync();
        (await HotWindowProbe.Indexes(conn, Short)).Should().Equal(idx);
        (await HotWindowProbe.Partitions(conn, Short)).Should().Equal(parts);
    }

    [Fact]
    public async Task Running_cpm17_again_changes_nothing()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var before = new Dictionary<string, List<string>>();
        foreach (var t in HotWindowCplmDb.Tables) before[t] = await HotWindowProbe.Partitions(conn, t);
        var rows = await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{Short}");
        var retention = await HotWindowProbe.Retention(conn);
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-17-hot-window-partitions.sql"));
        foreach (var t in HotWindowCplmDb.Tables) (await HotWindowProbe.Partitions(conn, t)).Should().Equal(before[t]);
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{Short}")).Should().Be(rows);
        (await HotWindowProbe.Retention(conn)).Should().Equal(retention);
    }

    [Fact]
    public async Task The_consumer_upsert_lands_in_the_hour_partition_of_its_window()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var end = DateTime.UtcNow.AddMinutes(-5);
        await FeaturePartitionTests.ShortUpsert(conn, "HW-UPSERT", end, 10);
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{HotWindowProbe.ShortHour(end)} WHERE loop_id = 'HW-UPSERT'")).Should().Be(1);
    }

    [Theory]
    [InlineData(3, 60, 3)]
    [InlineData(1, 60, 3)]     // one missed hourly pass still finds the next hour ready
    [InlineData(3, 180, 7)]    // a 3-hour pass interval widens the lookahead to two passes + 1
    [InlineData(6, 60, 6)]
    public void The_hourly_lookahead_always_covers_two_passes(int lookaheadHours, int maintenanceMinutes, int expected) =>
        FeaturePartitions.EffectiveLookaheadHours(new FeaturePartitionOptions { LookaheadHours = lookaheadHours, MaintenanceMinutes = maintenanceMinutes })
            .Should().Be(expected);

    [Theory]
    [InlineData(1, 6, 72, 6)]          // hours wins over days
    [InlineData(1, null, 72, 24)]      // days x 24 when hours is not set (the long table, or the pre-cpm-17 rows)
    [InlineData(null, null, 72, 72)]   // no row / no value: the table's fallback
    [InlineData(0, 0, 72, 1)]          // never below one hour
    public void Retention_is_hours_when_set_else_days(int? days, int? hours, int fallback, int expected) =>
        FeaturePartitions.RetentionHours(days, hours, fallback).Should().Be(expected);

    [Fact]
    public async Task Maintenance_creates_the_next_hours_even_with_a_short_lookahead_option()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        // a 3-hour pass interval with a 1-hour option: the lookahead widens to 7 h, past the conversion's + 3
        var now = DateTime.UtcNow;
        var r = await FeaturePartitions.MaintainOnceAsync(_fx.Db, now, new FeaturePartitionOptions { LookaheadHours = 1, MaintenanceMinutes = 180 }, null, CancellationToken.None);
        r.Created.Should().BeGreaterThanOrEqualTo(1);
        var parts = await HotWindowProbe.Partitions(conn, Short);
        for (var h = 0; h <= 7; h++) parts.Should().Contain(HotWindowProbe.ShortHour(now.AddHours(h)));
        parts.Should().NotContain(n => HotWindowProbe.IsDaily(n, Short), "the short table is never given a day partition again");
    }

    [Fact]
    public async Task Maintenance_drops_hours_past_the_hours_retention_and_prunes_default()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var now = DateTime.UtcNow;
        var old = HotWindowProbe.Hour(now).AddHours(-9);
        await conn.ExecuteAsync($"""
            CREATE TABLE IF NOT EXISTS analytics.{HotWindowProbe.ShortHour(old)} PARTITION OF analytics.{Short}
            FOR VALUES FROM ('{old:yyyy-MM-dd HH}:00:00+00') TO ('{old.AddHours(1):yyyy-MM-dd HH}:00:00+00')
            """);
        await FeaturePartitionTests.ShortUpsert(conn, "HW-PRUNE", HotWindowProbe.Hour(now).AddHours(-8).AddMinutes(10), 10);   // no partition: DEFAULT
        var r = await FeaturePartitions.MaintainOnceAsync(_fx.Db, now, new FeaturePartitionOptions(), null, CancellationToken.None);
        r.Dropped.Should().BeGreaterThanOrEqualTo(1);
        var parts = await HotWindowProbe.Partitions(conn, Short);
        parts.Should().NotContain(HotWindowProbe.ShortHour(old), "SHORT_FEATURES hours = 6 wins over days = 1 (which would keep it)");
        parts.Should().Contain(HotWindowProbe.ShortHour(now.AddHours(-6)), "its upper bound is after the cutoff (current hour - 6 h)");
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{Short}_default WHERE loop_id = 'HW-PRUNE'")).Should().Be(0);
    }

    [Fact]
    public async Task Maintenance_moves_default_rows_into_the_hour_it_creates()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var target = HotWindowProbe.Hour(DateTime.UtcNow).AddHours(5).AddMinutes(30);   // past the conversion's +3: DEFAULT
        await FeaturePartitionTests.ShortUpsert(conn, "HW-RELOCATE", target, 10);
        await FeaturePartitions.MaintainOnceAsync(_fx.Db, DateTime.UtcNow, new FeaturePartitionOptions { LookaheadHours = 6 }, null, CancellationToken.None);
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{HotWindowProbe.ShortHour(target)} WHERE loop_id = 'HW-RELOCATE'")).Should().Be(1);
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{Short}_default WHERE loop_id = 'HW-RELOCATE'")).Should().Be(0);
    }

    [Fact]
    public async Task Maintenance_drops_long_days_past_the_one_day_row()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        const string Long = "cplm_long_feature_results";
        var today = DateTime.UtcNow.Date;
        var old = today.AddDays(-3);
        await conn.ExecuteAsync($"""
            CREATE TABLE IF NOT EXISTS analytics.{Long}_p{old:yyyyMMdd} PARTITION OF analytics.{Long}
            FOR VALUES FROM ('{old:yyyy-MM-dd} 00:00:00+00') TO ('{old.AddDays(1):yyyy-MM-dd} 00:00:00+00')
            """);
        await FeaturePartitions.MaintainOnceAsync(_fx.Db, DateTime.UtcNow, new FeaturePartitionOptions(), null, CancellationToken.None);
        var parts = await HotWindowProbe.Partitions(conn, Long);
        parts.Should().NotContain($"{Long}_p{old:yyyyMMdd}", "LONG_FEATURES = 1 day");
        parts.Should().Contain($"{Long}_p{today.AddDays(-1):yyyyMMdd}", "yesterday ends after the cutoff (today - 1 day)");
        parts.Should().Contain($"{Long}_p{today.AddDays(2):yyyyMMdd}", "the long table stays daily, two days ahead");
        parts.Should().NotContain(n => HotWindowProbe.IsHourly(n, Long));
    }
}

/// <summary>Its own database: the rollback changes the shape the other class asserts on.</summary>
public sealed class HotWindowRollbackDb : HotWindowCplmDb
{
    public HotWindowRollbackDb() : base("cplm_hotwindow_rollback_test") { }
}

[Trait("Category", "Integration")]
public sealed class HotWindowRollbackTests : IClassFixture<HotWindowRollbackDb>
{
    private const string Short = "cplm_short_feature_results";
    private readonly HotWindowRollbackDb _fx;
    public HotWindowRollbackTests(HotWindowRollbackDb fx) => _fx = fx;

    [Fact]
    public async Task The_rollback_restores_the_daily_shape_with_every_row_and_cpm17_converts_it_again()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var idx = await HotWindowProbe.Indexes(conn, Short);
        var rows = await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{Short}");
        var rollback = PlainCplmDb.RepoFile("scripts", "cpm-17-hot-window-partitions.rollback.sql");
        await _fx.ApplyAsync(rollback);

        var parts = await HotWindowProbe.Partitions(conn, Short);
        var today = DateTime.UtcNow.Date;
        parts.Should().NotContain(n => HotWindowProbe.IsHourly(n, Short));
        parts.Should().Contain(new[] { $"{Short}_p{today.AddDays(-1):yyyyMMdd}", $"{Short}_p{today:yyyyMMdd}", $"{Short}_p{today.AddDays(2):yyyyMMdd}", Short + "_default" });
        (await HotWindowProbe.Count(conn, $"SELECT count(*) FROM analytics.{Short}")).Should().Be(rows, "the rollback keeps every row");
        (await HotWindowProbe.Indexes(conn, Short)).Should().Equal(idx);
        (await HotWindowProbe.Count(conn, "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = 'retention_policy' AND column_name = 'hours'"))
            .Should().Be(0, "the previous cplm-api never knew the column");
        (await conn.ExecuteScalarAsync<int>("SELECT days FROM analytics.retention_policy WHERE record_class = 'SHORT_FEATURES'")).Should().Be(1);

        await _fx.ApplyAsync(rollback);   // re-runnable
        (await HotWindowProbe.Partitions(conn, Short)).Should().Equal(parts);

        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-17-hot-window-partitions.sql"));   // and forward again
        var again = await HotWindowProbe.Partitions(conn, Short);
        again.Should().NotContain(n => HotWindowProbe.IsDaily(n, Short));
        again.Count(n => HotWindowProbe.IsHourly(n, Short)).Should().Be(10);
    }
}
