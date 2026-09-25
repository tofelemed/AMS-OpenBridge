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

    [Fact]
    public async Task The_analysis_run_read_never_walks_the_manifest_table()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        // Size-independent (review of e24aac9e, I1): with sequential scans disabled the planner takes any
        // applicable index whatever the table size, so a "Seq Scan on evidence_manifest" line can only mean
        // no index applies - on a fresh lab (< 200k rows) a row-count threshold would have let a regression
        // (index dropped, ::text cast reintroduced) pass as a cheap-looking scan.
        await conn.ExecuteAsync("SET LOCAL enable_seqscan = off", transaction: tx);
        var plan = string.Join(NL, await conn.QueryAsync<string>("EXPLAIN " + AnalysisRunStore.ReadSql, new { id = Guid.NewGuid() }, transaction: tx));
        var walked = plan.Split(NL).Where(l => l.Contains("Seq Scan on evidence_manifest")).ToList();
        walked.Should().BeEmpty("every manifest count in the read must come from an index" + NL + plan);
        // "No seq scan" alone is not enough: with seqscan off, the old `method_run_id::text = ...` form falls back to
        // a bitmap over ix_evidence_manifest_readiness (864k rows on the lab) and never prints a Seq Scan. The read
        // must be served by the two indexes built for it.
        plan.Should().Contain("ix_evidence_manifest_analysis_run", "the two provenance counts use the expression index on provenance->>'analysis_run_id'" + NL + plan);
        plan.Should().Contain("ix_evidence_manifest_method_run", "the reconstructs probe compares uuid to uuid so the btree on method_run_id applies" + NL + plan);
    }
}
