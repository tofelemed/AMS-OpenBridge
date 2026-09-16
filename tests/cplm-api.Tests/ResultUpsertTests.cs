// v2.5 Task 1G.3 (spec v6 §1.6, R19) — the v1 gate row is the method run: the upsert key
// includes bundle_hash, so a re-evaluation of the same window under another configuration is
// a NEW row, a late-data refinement under the SAME configuration updates in place, and a
// pre-v2.5 payload lands as bundle_hash = 'legacy'. Runs against the lab traverse_cplm
// (after 53_cplm_v25 / cpm-07b swapped the unique key); rows are tagged and removed.
using Dapper;
using FluentAssertions;
using Npgsql;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class ResultUpsertTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private const string Loop = "ZZ_UPSERT_TEST_LOOP";

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_gate_results WHERE loop_id = @Loop", new { Loop });
        await _db.DisposeAsync();
    }

    /// <summary>The consumer's statement, verbatim (kept in sync by CplmResultConsumerService.GateUpsertSql).</summary>
    private static string Sql => Traverse.CplmApi.BackgroundServices.CplmResultConsumerService.GateUpsertSql;

    private static object Args(int samples, string bundle, string diagnosis = "SUSPECTED_OSCILLATION", string runIds = "{}") => new
    {
        loopId = Loop, windowKind = "24h",
        winStart = new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc), winEnd = new DateTime(2026, 9, 16, 0, 0, 0, DateTimeKind.Utc),
        samples, mae = (double?)1.0, rmse = (double?)null, iae = (double?)null, goodErrorPct = (double?)null,
        acfPeriodS = (double?)null, acfRegularity = (double?)null, effortRatio = (double?)null, triangularity = (double?)null,
        horchOddness = (double?)null, phaseArea = (double?)null, cornerScore = (double?)null, travelPerDay = (double?)null,
        reversalsPerHour = (double?)null, harmAmpRatio = (double?)null, harmEnergyRatio = (double?)null,
        diagnosis, severity = "HIGH", confidence = 0.8, payload = "{}", source = "flink",
        methodRunIds = runIds, bundleHash = bundle, contextRevision = 0, resultRevision = 1, purpose = "LIVE",
        analysisRunId = (Guid?)null, sourceCommit = "abc", jarSha256 = "def", datasetHash = "0123",
    };

    private async Task<List<dynamic>> Rows()
    {
        await using var conn = await _db.OpenConnectionAsync();
        return (await conn.QueryAsync("SELECT sample_count, bundle_hash, diagnosis FROM analytics.cplm_gate_results WHERE loop_id = @Loop ORDER BY bundle_hash",
            new { Loop })).ToList();
    }

    [Fact]
    public async Task Same_bundle_with_more_samples_updates_in_place_and_a_different_bundle_is_a_new_row()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync(Sql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb"), Args(100, "profile:aaaa"));
        await conn.ExecuteAsync(Sql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb"), Args(120, "profile:aaaa", "CONFIRMED_OSCILLATION"));
        var rows = await Rows();
        rows.Should().HaveCount(1);
        ((int)rows[0].sample_count).Should().Be(120);
        ((string)rows[0].diagnosis).Should().Be("CONFIRMED_OSCILLATION");

        await conn.ExecuteAsync(Sql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb"), Args(90, "profile:aaaa", "DETECTED_OSCILLATION"));
        rows = await Rows();
        ((int)rows[0].sample_count).Should().Be(120, "fewer samples for the same bundle never overwrite");

        await conn.ExecuteAsync(Sql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb"), Args(50, "profile:bbbb", "NO_CALL"));
        rows = await Rows();
        rows.Should().HaveCount(2, "a different configuration is a new row, never an overwrite");
        rows.Select(r => (string)r.bundle_hash).Should().Equal("profile:aaaa", "profile:bbbb");
    }

    [Fact]
    public async Task A_legacy_payload_lands_as_bundle_hash_legacy()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync(Sql.Replace("@payload", "@payload::jsonb").Replace("@methodRunIds", "@methodRunIds::jsonb"), Args(10, "legacy"));
        var rows = await Rows();
        rows.Select(r => (string)r.bundle_hash).Should().ContainSingle(b => b == "legacy");
    }
}
