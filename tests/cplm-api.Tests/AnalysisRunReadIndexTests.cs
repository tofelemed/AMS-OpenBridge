// 2026-09-25 pre-prod lab run: GET /api/v1/cpm/analysis-runs/{id} answered 500 (Npgsql 30 s timeout) while
// the ingestion E2E waited for its REPLAY run. AnalysisRunStore.ReadAsync counts the run's manifests with
// three correlated subqueries over analytics.evidence_manifest: two filter on provenance->>'analysis_run_id'
// (no index - a parallel seq scan of 827k rows, 18 s cold) and one compares method_run_id::text to a JSON
// string (the cast defeats the btree on method_run_id). The UI polls this endpoint during every shadow /
// replay / reconstruction run, so on the plant the Gate Configuration shadow would hang the same way.
// Every manifest subquery of the read must be answered from an index.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class AnalysisRunReadIndexTests : IAsyncLifetime
{
    private const char NL = (char)10;
    private NpgsqlDataSource _db = null!;

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    private static int RowsOf(string planLine)
    {
        var m = System.Text.RegularExpressions.Regex.Match(planLine, @"rows=(\d+)");
        return m.Success ? int.Parse(m.Groups[1].Value) : 0;
    }

    [Fact]
    public async Task The_analysis_run_read_never_walks_the_manifest_table()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var plan = string.Join(NL, await conn.QueryAsync<string>("EXPLAIN " + AnalysisRunStore.ReadSql, new { id = Guid.NewGuid() }));
        var walked = plan.Split(NL).Where(l => l.Contains("Seq Scan on evidence_manifest") && RowsOf(l) >= 1000).ToList();
        walked.Should().BeEmpty("every manifest count in the read must come from an index (ix_evidence_manifest_analysis_run on "
            + "provenance->>'analysis_run_id'; the reconstructs probe must compare uuid to uuid so ix_evidence_manifest_method_run applies)"
            + NL + plan);
    }
}
