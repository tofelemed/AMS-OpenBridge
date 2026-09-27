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
    public async Task Governed_configuration_tables_exist_with_their_state_vocabularies()
    {
        // v2.5 Task 3B.1 (58): bundles, layers, approvals bound to a hash, deployments + worker ACK matrix, the active bundle per scope, worker capability
        await using var conn = await _db.OpenConnectionAsync();
        var tables = (await conn.QueryAsync<string>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'cpm'")).ToHashSet();
        tables.Should().Contain(new[] { "gate_config_bundle", "gate_config_layer", "config_approval", "config_deployment", "config_worker_ack", "config_active", "config_worker_capability" });
        var check = await conn.ExecuteScalarAsync<string>("""
            SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'cpm' AND t.relname = 'gate_config_bundle' AND c.conname LIKE '%state%'
            """);
        check.Should().ContainAll("DRAFT", "VALIDATED", "SHADOW_EVALUATED", "APPROVED", "SCHEDULED", "PREPARED", "ACTIVE_VERIFIED", "REJECTED", "EXPIRED", "PARTIALLY_ACKNOWLEDGED", "ACTIVATION_FAILED", "ROLLED_BACK", "SUPERSEDED");
        var ackPk = await conn.ExecuteScalarAsync<string>("""
            SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'cpm' AND t.relname = 'config_worker_ack' AND c.contype = 'p'
            """);
        ackPk.Should().ContainAll("deployment_id", "job_name", "subtask_index", "phase");
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

    [Fact]
    public async Task Episode_capture_table_and_policy_exist()
    {
        // CHG-033: evidence bounded by class - captures at episode transitions (61 / cpm-10a / 03 / EnsureSchemaAsync),
        // the EPISODE retention row, and capture_count on the frame.
        await using var conn = await _db.OpenConnectionAsync();
        var tables = (await conn.QueryAsync<string>(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'analytics'")).ToHashSet();
        tables.Should().Contain("cplm_episode_capture");
        (await Columns("cplm_event_frames")).Should().Contain("capture_count");
        (await Columns("cplm_episode_capture")).Should().Contain(new[] { "episode_id", "method_run_id", "kind", "captured_at" });
        var episode = await conn.ExecuteScalarAsync<int?>("SELECT days FROM analytics.retention_policy WHERE record_class = 'EPISODE'");
        episode.Should().Be(90);
    }
}
