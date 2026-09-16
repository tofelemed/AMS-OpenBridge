// v2.5 Task 1G.1 — the v2.5 schema is present on the lab traverse_cplm exactly as the three
// shipped copies (database/scripts/53, migration/schema/03, scripts/cpm-07 + cpm-07b) say.
using Dapper;
using FluentAssertions;
using Npgsql;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class SchemaV25Tests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    private async Task<HashSet<string>> Columns(string table)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return (await conn.QueryAsync<string>(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = @table",
            new { table })).ToHashSet();
    }

    [Theory]
    [InlineData("cplm_gate_results")]
    [InlineData("cplm_short_feature_results")]
    [InlineData("cplm_long_feature_results")]
    public async Task Result_tables_carry_the_run_identity_columns(string table)
    {
        var cols = await Columns(table);
        cols.Should().Contain(new[] { "method_run_ids", "bundle_hash", "context_revision", "result_revision", "purpose",
            "analysis_run_id", "source_commit", "jar_sha256", "dataset_hash" });
    }

    [Fact]
    public async Task Event_frames_carry_availability_and_condition()
    {
        var cols = await Columns("cplm_event_frames");
        cols.Should().Contain(new[] { "availability_state", "condition_state", "result_revision", "qualified_support_ms", "support_until", "close_reason" });
    }

    [Fact]
    public async Task Run_registry_evidence_and_retention_tables_exist()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var tables = (await conn.QueryAsync<string>(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'analytics'")).ToHashSet();
        tables.Should().Contain(new[] { "analysis_run", "evidence_manifest", "evidence_chunk", "retention_policy", "condition_event" });
        var std = await conn.ExecuteScalarAsync<int?>("SELECT days FROM analytics.retention_policy WHERE record_class = 'STANDARD'");
        std.Should().Be(90);
    }

    [Fact]
    public async Task The_result_unique_key_includes_bundle_hash_and_the_old_key_is_gone()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var idx = (await conn.QueryAsync<string>(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'analytics' AND tablename IN ('cplm_gate_results','cplm_short_feature_results','cplm_long_feature_results')")).ToHashSet();
        idx.Should().Contain(new[] { "uq_cplm_gate_results_window_bundle", "uq_cplm_short_window_bundle", "uq_cplm_long_window_bundle", "ix_cplm_gate_results_method_run_ids" });
        idx.Should().NotContain(new[] { "uq_cplm_gate_results_window", "uq_cplm_short_window", "uq_cplm_long_window" });
    }
}
