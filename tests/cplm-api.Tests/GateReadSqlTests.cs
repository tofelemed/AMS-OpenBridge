// CHG-023 — the other two gate-table reads the page sweep caught at prod scale:
//   * /calculations "versions" — ORDER BY created_at DESC LIMIT 1 with a payload predicate,
//     no usable index → whole-table detoast, 30 s timeout (HTTP 500) at 367k rows;
//   * /loops/{id}/gates/latest — per-loop sort of that loop's ~2k rows by the real-verdict
//     expression on every click (150–340 ms); the fleet's two-probe shape applies as-is.
// Oracles are the shipped queries, verbatim. Same DB rules as FleetLatestSqlTests.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class GateReadSqlTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private const int OracleTimeoutSeconds = 600;

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    // ── Legacy shapes ──────────────────────────────────────────────────────

    private const string LegacyLatestForLoop = """
        SELECT loop_id, window_kind, window_start, window_end, sample_count,
               diagnosis, severity, confidence, payload::text AS payload, created_at
        FROM analytics.cplm_gate_results
        WHERE lower(loop_id) = lower(@loopId) AND window_kind = @windowKind
        ORDER BY (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC,
                 window_end DESC NULLS LAST, created_at DESC
        LIMIT 1
        """;

    private const string LegacyVersions = """
        SELECT COALESCE(payload->>'calculationVersion',  payload->>'calculation_version')  AS calculation_version,
               COALESCE(payload->>'dynamicsProfileVersion', payload->>'dynamics_profile_version') AS dynamics_profile_version
        FROM analytics.cplm_gate_results
        WHERE payload ? 'calculationVersion' OR payload ? 'calculation_version'
        ORDER BY created_at DESC LIMIT 1
        """;

    private const string LegacyObservedGates = """
        SELECT DISTINCT gate FROM (
            SELECT jsonb_object_keys(payload->'gates') AS gate
            FROM analytics.cplm_gate_results
            WHERE payload ? 'gates'
            LIMIT 2000
        ) keys
        """;

    private static string Row(dynamic r) =>
        $"{r.loop_id}|{r.window_kind}|{r.window_start}|{r.window_end}|{r.sample_count}|{r.diagnosis}|{r.severity}|{r.confidence}|{r.created_at}|{((string?)r.payload)?.Length}";

    // ── gates/latest ───────────────────────────────────────────────────────

    [Theory]
    [InlineData("24h")]
    [InlineData("12h")]
    public async Task Latest_gate_row_per_loop_matches_legacy_for_a_sample_of_loops(string windowKind)
    {
        await using var conn = await _db.OpenConnectionAsync();
        // Mixed-case ids on purpose: the read is case-insensitive.
        var loops = (await conn.QueryAsync<string>(
            "SELECT DISTINCT loop_id FROM analytics.cplm_gate_results ORDER BY loop_id LIMIT 12"))
            .Select((id, i) => i % 2 == 0 ? id : id.ToUpperInvariant()).ToList();
        loops.Should().NotBeEmpty();

        foreach (var loopId in loops)
        {
            var legacy = await conn.QueryFirstOrDefaultAsync(LegacyLatestForLoop, new { loopId, windowKind }, commandTimeout: OracleTimeoutSeconds);
            var fresh = await conn.QueryFirstOrDefaultAsync(GateReadSql.LatestForLoop, new { loopId, windowKind });
            ((object?)fresh is null).Should().Be((object?)legacy is null, loopId);
            if (legacy is not null) ((string)Row(fresh)).Should().Be((string)Row(legacy), loopId);
        }
    }

    [Fact]
    public async Task Latest_gate_row_for_an_unknown_loop_is_null()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var fresh = await conn.QueryFirstOrDefaultAsync(GateReadSql.LatestForLoop, new { loopId = "no-such-loop", windowKind = "24h" });
        ((object?)fresh).Should().BeNull();
    }

    [Fact]
    public async Task Latest_gate_row_plan_probes_the_latest_indexes()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var plan = await conn.ExecuteScalarAsync<string>(
            "EXPLAIN (FORMAT JSON) " + GateReadSql.LatestForLoop, new { loopId = "FIC00001", windowKind = "24h" });

        plan.Should().Contain(CplmReadIndexes.RealVerdictIndex);
        plan.Should().Contain(CplmReadIndexes.AnyRowIndex);
    }

    // ── /calculations ──────────────────────────────────────────────────────

    [Fact]
    public async Task Versions_row_matches_legacy_and_walks_the_created_at_index()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var legacy = await conn.QueryFirstOrDefaultAsync(LegacyVersions, commandTimeout: OracleTimeoutSeconds);
        var fresh = await conn.QueryFirstOrDefaultAsync(GateReadSql.LatestVersions);

        ((string?)fresh?.calculation_version).Should().Be((string?)legacy?.calculation_version);
        ((string?)fresh?.dynamics_profile_version).Should().Be((string?)legacy?.dynamics_profile_version);

        var plan = await conn.ExecuteScalarAsync<string>("EXPLAIN (FORMAT JSON) " + GateReadSql.LatestVersions);
        plan.Should().Contain(CplmReadIndexes.CreatedAtIndex);
        // On the plant (plain table) this is one backward index walk. On the lab hypertable
        // TimescaleDB's COMPRESSED chunks have no btree, so they legitimately show a scan of
        // their tiny compressed relation; anything else scanning the table is the defect.
        SeqScansOutsideCompressedChunks(plan!).Should().BeEmpty();
    }

    private static List<string> SeqScansOutsideCompressedChunks(string planJson)
    {
        var hits = new List<string>();
        void Walk(System.Text.Json.JsonElement node)
        {
            if (node.ValueKind == System.Text.Json.JsonValueKind.Array) { foreach (var n in node.EnumerateArray()) Walk(n); return; }
            if (node.ValueKind != System.Text.Json.JsonValueKind.Object) return;
            if (node.TryGetProperty("Node Type", out var t) && t.GetString() == "Seq Scan")
            {
                var rel = node.TryGetProperty("Relation Name", out var r) ? r.GetString() ?? "" : "";
                if (!rel.StartsWith("compress_hyper_", StringComparison.Ordinal)) hits.Add(rel);
            }
            foreach (var p in node.EnumerateObject()) Walk(p.Value);
        }
        using var doc = System.Text.Json.JsonDocument.Parse(planJson);
        Walk(doc.RootElement);
        return hits;
    }

    [Fact]
    public async Task Observed_gates_come_from_the_newest_rows_and_cover_what_legacy_saw()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var legacy = (await conn.QueryAsync<string>(LegacyObservedGates, commandTimeout: OracleTimeoutSeconds)).ToHashSet();
        var fresh = (await conn.QueryAsync<string>(GateReadSql.ObservedGates)).ToHashSet();

        fresh.Should().BeEquivalentTo(legacy);
        // No plan assertion here: for a 2,000-row sample the planner only walks the
        // created_at index once the table is large relative to the sample (it did at plant
        // scale — 0.37–0.56 s against a 30 s timeout); on the small lab table a scan wins.
    }

    [Fact]
    public async Task All_three_read_indexes_exist_on_the_gate_table()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var names = (await conn.QueryAsync<string>(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'analytics' AND tablename = 'cplm_gate_results'")).ToList();

        names.Should().Contain(new[] { CplmReadIndexes.RealVerdictIndex, CplmReadIndexes.AnyRowIndex, CplmReadIndexes.CreatedAtIndex });
    }
}
