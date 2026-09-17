// 2026-09-17 rendered performance probe of the System Response page: opening one event took 7-15 s
// because every evidence read (manifest, batch, bundle) resolves the run's location through
// MethodRunResolver, whose containment probe seq-scanned the short (119k rows) and long (9k rows)
// result hypertables - only the fusion table had a GIN index on method_run_ids, and even there the
// planner walked the created_at index under ORDER BY ... LIMIT 1 instead of the GIN. Every result
// table the resolver probes must answer the containment predicate from its GIN index, and the
// response event (a btree point lookup) is probed first.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class MethodRunLookupIndexTests : IAsyncLifetime
{
    private const char NL = (char)10;
    private static int RowsOf(string planLine)
    {
        var m = System.Text.RegularExpressions.Regex.Match(planLine, @"rows=(\d+)");
        return m.Success ? int.Parse(m.Groups[1].Value) : 0;
    }
    private NpgsqlDataSource _db = null!;
    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    [Fact]
    public void The_resolver_probes_the_cheapest_table_first()
    {
        // a G12 run lives only in response_event (btree on method_run_id): probing it first keeps the Response page
        // off the large feature tables entirely; the largest table is last
        MethodRunResolver.ProbeOrder.Select(t => t.table).Should().Equal(
            "analytics.response_event", "analytics.cplm_gate_results", "analytics.cplm_long_feature_results", "analytics.cplm_short_feature_results");
    }

    [Theory]
    [InlineData("analytics.cplm_gate_results")]
    [InlineData("analytics.cplm_short_feature_results")]
    [InlineData("analytics.cplm_long_feature_results")]
    public async Task The_run_containment_probe_is_answered_from_a_gin_index(string table)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var plan = string.Join(NL, await conn.QueryAsync<string>("EXPLAIN " + MethodRunResolver.LookupSql(table), new { id = Guid.NewGuid() }));
        // a compressed TimescaleDB chunk (lab only; prod tables are plain) is decompressed, never indexed, and the
        // planner rightly reads a tiny chunk sequentially - no chunk of any size must be walked row by row
        var walked = plan.Split(NL).Where(l => l.Contains("Seq Scan on") && !l.Contains("compress_hyper") && RowsOf(l) >= 1000).ToList();
        walked.Should().BeEmpty($"{table} must carry a GIN index on method_run_ids (database/scripts/53, scripts/cpm-07-v25-schema.sql)");
        plan.Should().Contain("Bitmap Index Scan", "the containment probe must use the GIN index, not walk created_at");
    }
}
