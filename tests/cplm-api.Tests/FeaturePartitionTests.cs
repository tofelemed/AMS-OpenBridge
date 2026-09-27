// CHG-033 - the plant's result tables (short, long, gate) as daily range partitions on plain PostgreSQL:
// scripts/cpm-10b builds the shape, the startup self-heal DDL is a no-op on it, the consumer's upserts
// land once per key, an out-of-range replay row lands in the DEFAULT partition, and the maintenance
// loop (FeaturePartitions) creates the next days and drops the ones past retention_policy.
using Dapper;
using FluentAssertions;
using Npgsql;
using NpgsqlTypes;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class FeaturePartitionTests : IClassFixture<PlainCplmDb>
{
    private readonly PlainCplmDb _fx;
    public FeaturePartitionTests(PlainCplmDb fx) => _fx = fx;

    private static readonly string[] Tables = { "cplm_short_feature_results", "cplm_long_feature_results", "cplm_gate_results" };

    private async Task<List<string>> Partitions(NpgsqlConnection conn, string t) => (await conn.QueryAsync<string>("""
        SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid JOIN pg_class p ON p.oid = h.inhparent
        JOIN pg_namespace n ON n.oid = p.relnamespace WHERE n.nspname = 'analytics' AND p.relname = @t ORDER BY 1
        """, new { t })).ToList();

    private static async Task<Dictionary<string, string>> Indexes(NpgsqlConnection conn, string t) =>
        (await conn.QueryAsync<(string name, string def)>(
            "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'analytics' AND tablename = @t", new { t }))
        .ToDictionary(r => r.name, r => r.def);

    [Fact]
    public async Task Cpm10b_turns_the_three_result_tables_into_daily_range_partitions_with_their_indexes()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        foreach (var t in Tables)
        {
            (await conn.ExecuteScalarAsync<string>(
                "SELECT relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'analytics' AND c.relname = @t", new { t }))
                .Should().Be("p", t);
            var parts = await Partitions(conn, t);
            parts.Should().Contain(new[] { t + "_default", $"{t}_p{DateTime.UtcNow:yyyyMMdd}", $"{t}_p{DateTime.UtcNow.AddDays(2):yyyyMMdd}" });
            (await conn.ExecuteScalarAsync<string>(
                "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname = @t AND c.contype = 'p'", new { t }))
                .Should().Be("PRIMARY KEY (id, window_end)", t);
            (await conn.ExecuteScalarAsync<string>("SELECT column_default FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = @t AND column_name = 'id'", new { t }))
                .Should().Contain("nextval", "the identity column becomes a plain sequence default (PG15 has no identity on a partitioned parent)");
        }
        var idx = await Indexes(conn, "cplm_short_feature_results");
        idx.Keys.Should().Contain(new[] { "uq_cplm_short_window_bundle", "ix_cplm_short_feature_results_method_run_ids", "idx_cplm_short_loop_kind_time",
            "idx_cplm_short_loop_kind_end", "idx_cplm_short_loop_lower", "idx_cplm_short_created_at" });
        var gate = await Indexes(conn, "cplm_gate_results");
        gate.Keys.Should().Contain(new[] { "uq_cplm_gate_results_window_bundle", CplmReadIndexes.RealVerdictIndex, CplmReadIndexes.AnyRowIndex, CplmReadIndexes.CreatedAtIndex });
        gate[CplmReadIndexes.RealVerdictIndex].Should().Contain("WHERE", "the partial predicate survives the rebuild");
        var days = (await conn.QueryAsync<(string cls, int days)>("SELECT record_class, days FROM analytics.retention_policy WHERE record_class IN ('SHORT_FEATURES','LONG_FEATURES','GATE_RESULTS')")).ToDictionary(r => r.cls, r => r.days);
        days.Should().Equal(new Dictionary<string, int> { ["SHORT_FEATURES"] = 3, ["LONG_FEATURES"] = 30, ["GATE_RESULTS"] = 30 });
    }

    [Fact]
    public async Task The_startup_self_heal_ddl_is_a_no_op_on_the_partitioned_shape()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var before = new Dictionary<string, Dictionary<string, string>>();
        foreach (var t in Tables) before[t] = await Indexes(conn, t);
        await using (var cmd = new NpgsqlCommand(CplmResultSchema.Ddl, conn) { CommandTimeout = 120 }) await cmd.ExecuteNonQueryAsync();
        foreach (var t in Tables)
        {
            (await Indexes(conn, t)).Should().Equal(before[t], "the self-heal must neither add nor rebuild an index on " + t);
            (await conn.ExecuteScalarAsync<string>("SELECT relkind::text FROM pg_class WHERE relname = @t", new { t })).Should().Be("p");
        }
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM pg_views WHERE schemaname = 'analytics' AND viewname IN ('cplm_gate_latest','cplm_short_feature_latest','cplm_long_feature_latest')")).Should().Be(3);
    }

    /// <summary>The consumer's exact statement with every parameter it binds (jsonb ones typed as the consumer types them).</summary>
    private static async Task<int> ShortUpsert(NpgsqlConnection conn, string loop, DateTime windowEnd, int samples)
    {
        await using var cmd = new NpgsqlCommand(CplmFeatureUpsertSql.Short, conn);
        cmd.Parameters.AddWithValue("loopId", loop); cmd.Parameters.AddWithValue("windowKind", "1m");
        cmd.Parameters.AddWithValue("winStart", windowEnd.AddMinutes(-1)); cmd.Parameters.AddWithValue("winEnd", windowEnd);
        cmd.Parameters.AddWithValue("samples", samples);
        for (var i = 1; i <= 10; i++) cmd.Parameters.AddWithValue("m" + i, 0.5);
        cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = "{}" });
        cmd.Parameters.AddWithValue("source", "flink");
        cmd.Parameters.Add(new NpgsqlParameter("methodRunIds", NpgsqlDbType.Jsonb) { Value = "{}" });
        cmd.Parameters.AddWithValue("bundleHash", "b1"); cmd.Parameters.AddWithValue("contextRevision", 0); cmd.Parameters.AddWithValue("resultRevision", 1);
        cmd.Parameters.AddWithValue("purpose", "LIVE"); cmd.Parameters.AddWithValue("analysisRunId", DBNull.Value);
        cmd.Parameters.AddWithValue("sourceCommit", DBNull.Value); cmd.Parameters.AddWithValue("jarSha256", DBNull.Value); cmd.Parameters.AddWithValue("datasetHash", DBNull.Value);
        return await cmd.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task The_consumer_upsert_lands_once_per_key_and_keeps_the_fuller_row()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var end = DateTime.UtcNow.AddMinutes(-5);
        await ShortUpsert(conn, "PART-UPSERT", end, 10);
        await ShortUpsert(conn, "PART-UPSERT", end, 5);       // fewer samples: the DO UPDATE's WHERE refuses it
        await ShortUpsert(conn, "PART-UPSERT", end, 12);      // more: accepted
        var rows = (await conn.QueryAsync<int>("SELECT sample_count FROM analytics.cplm_short_feature_results WHERE loop_id = 'PART-UPSERT'")).ToList();
        rows.Should().Equal(12);
        (await conn.ExecuteScalarAsync<int>($"SELECT count(*) FROM analytics.cplm_short_feature_results_p{DateTime.UtcNow:yyyyMMdd} WHERE loop_id = 'PART-UPSERT'"))
            .Should().Be(1, "a row for today lives in today's partition");
    }

    [Fact]
    public async Task A_replay_row_older_than_every_partition_lands_in_the_default_partition()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        await ShortUpsert(conn, "PART-REPLAY", DateTime.UtcNow.AddDays(-30), 10);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.cplm_short_feature_results_default WHERE loop_id = 'PART-REPLAY'")).Should().Be(1);
    }

    [Fact]
    public async Task Running_cpm10b_again_changes_nothing()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var before = new Dictionary<string, (List<string> parts, Dictionary<string, string> idx)>();
        foreach (var t in Tables) before[t] = (await Partitions(conn, t), await Indexes(conn, t));
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-10b-result-partitions.sql"));
        foreach (var t in Tables)
        {
            (await Partitions(conn, t)).Should().Equal(before[t].parts);
            (await Indexes(conn, t)).Should().Equal(before[t].idx);
        }
    }

    [Fact]
    public async Task The_reconciler_and_the_fleet_probe_run_on_indexes_across_every_partition()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        foreach (var t in Tables)
        {
            var parts = await Partitions(conn, t);
            var createdAt = t == "cplm_gate_results" ? CplmReadIndexes.CreatedAtIndex : t.Replace("cplm_", "idx_cplm_").Replace("_feature_results", "_created_at");
            (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM pg_inherits WHERE inhparent = ('analytics.' || @i)::regclass", new { i = createdAt }))
                .Should().Be(parts.Count, $"{createdAt} must have one child index per partition of {t}");
        }
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_end, diagnosis, purpose, created_at)
            VALUES ('PART-PROBE', '24h', NOW(), 'SUSPECTED_OSCILLATION', 'LIVE', NOW());
            ANALYZE analytics.cplm_gate_results;
            """);
        await using var tx = await conn.BeginTransactionAsync();
        await conn.ExecuteAsync("SET LOCAL enable_seqscan = off", transaction: tx);
        var probe = string.Join("\n", await conn.QueryAsync<string>("""
            EXPLAIN SELECT g.id FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower('PART-PROBE') AND g.window_kind = '24h'
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA' AND g.purpose = 'LIVE'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC LIMIT 1
            """, transaction: tx));
        probe.Should().NotContain("Seq Scan", "every partition answers the fleet probe from its child of " + CplmReadIndexes.RealVerdictIndex);
        var reconcile = string.Join("\n", await conn.QueryAsync<string>(
            "EXPLAIN " + Traverse.CplmApi.Services.PostgresEvidenceBlobStore.ReconcileSql("analytics.cplm_gate_results"), transaction: tx));
        reconcile.Should().NotContain("Seq Scan", "with sequential scans disabled, any Seq Scan means a partition has no usable created_at index");
    }

    private static readonly FeaturePartitionOptions Opts = new() { LookaheadDays = 2, LockTimeoutSeconds = 5 };
    private static string Day(DateTime utc) => utc.ToString("yyyyMMdd");

    [Fact]
    public async Task Maintenance_creates_the_lookahead_days_and_drops_the_days_past_retention()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var old = DateTime.UtcNow.Date.AddDays(-5);
        await conn.ExecuteAsync($"""
            CREATE TABLE IF NOT EXISTS analytics.cplm_short_feature_results_p{Day(old)} PARTITION OF analytics.cplm_short_feature_results
            FOR VALUES FROM ('{old:yyyy-MM-dd} 00:00:00+00') TO ('{old.AddDays(1):yyyy-MM-dd} 00:00:00+00')
            """);
        var r = await FeaturePartitions.MaintainOnceAsync(_fx.Db, DateTime.UtcNow.AddDays(1), Opts, null, CancellationToken.None);
        r.Skipped.Should().Be(0);
        var parts = await Partitions(conn, "cplm_short_feature_results");
        parts.Should().Contain($"cplm_short_feature_results_p{Day(DateTime.UtcNow.AddDays(3))}", "tomorrow's run looks two days ahead of tomorrow");
        parts.Should().NotContain($"cplm_short_feature_results_p{Day(old)}", "SHORT_FEATURES keeps 3 days; a 5-day-old day is dropped");
        (await Partitions(conn, "cplm_gate_results")).Should().Contain($"cplm_gate_results_p{Day(DateTime.UtcNow.AddDays(3))}");
    }

    [Fact]
    public async Task Maintenance_moves_rows_parked_in_default_into_the_day_it_creates()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var target = DateTime.UtcNow.Date.AddDays(5).AddHours(12);          // no partition that far ahead yet: the row parks in DEFAULT
        await ShortUpsert(conn, "PART-RELOCATE", target, 10);
        await FeaturePartitions.MaintainOnceAsync(_fx.Db, DateTime.UtcNow.AddDays(3), Opts, null, CancellationToken.None);
        (await conn.ExecuteScalarAsync<int>($"SELECT count(*) FROM analytics.cplm_short_feature_results_p{Day(target)} WHERE loop_id = 'PART-RELOCATE'")).Should().Be(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.cplm_short_feature_results_default WHERE loop_id = 'PART-RELOCATE'")).Should().Be(0);
    }

    [Fact]
    public async Task Maintenance_prunes_default_rows_older_than_retention()
    {
        await using var conn = await _fx.Db.OpenConnectionAsync();
        await ShortUpsert(conn, "PART-PRUNE", DateTime.UtcNow.AddDays(-40), 10);
        var r = await FeaturePartitions.MaintainOnceAsync(_fx.Db, DateTime.UtcNow, Opts, null, CancellationToken.None);
        r.Pruned.Should().BeGreaterThanOrEqualTo(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.cplm_short_feature_results_default WHERE loop_id = 'PART-PRUNE'")).Should().Be(0);
    }

    [Fact]
    public async Task Maintenance_leaves_a_table_that_is_not_partitioned_alone()
    {
        // the lab's tables are Timescale hypertables (relkind r): nothing to create, drop or prune there
        await using var lab = NpgsqlDataSource.Create(TestDb.ConnectionString());
        var r = await FeaturePartitions.MaintainOnceAsync(lab, DateTime.UtcNow, Opts, null, CancellationToken.None);
        r.Should().Be(new PartitionMaintenanceResult(0, 0, 0, 0, Skipped: 3));
    }

    [Fact]
    public async Task Maintenance_disabled_by_options_creates_and_drops_nothing()
    {
        // review finding: Cplm:Partitions:Enabled=false must also stop the pass the consumer runs at startup
        await using var conn = await _fx.Db.OpenConnectionAsync();
        var before = await Partitions(conn, "cplm_short_feature_results");
        var r = await FeaturePartitions.MaintainOnceAsync(_fx.Db, DateTime.UtcNow.AddDays(10), new FeaturePartitionOptions { Enabled = false }, null, CancellationToken.None);
        r.Should().Be(new PartitionMaintenanceResult(0, 0, 0, 0, Skipped: 3));
        (await Partitions(conn, "cplm_short_feature_results")).Should().Equal(before);
    }
}
