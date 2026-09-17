// CHG-024 (batch 4) — GET /loops/{id}/kpis/latest?resolutions=…&limit=… for the Windows
// comparator, which used to issue six GET /loops/{id}/kpis calls (one per short window
// kind) on every loop selection. The batch answer must be exactly what the six single
// reads return, keyed by kind, and it must be the same SQL (moved to Data/KpiSql.cs so
// both endpoints share it). Runs against the lab traverse_cplm database.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class KpiReadsTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    private static readonly string[] ShortKinds = { "1m", "5m", "10m", "15m", "30m", "60m" };

    private static string Rows(IEnumerable<dynamic> rows) =>
        string.Join("\n", rows.Select(r => string.Join("|", ((IDictionary<string, object?>)r).OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => $"{kv.Key}={kv.Value}"))));

    [Fact]
    public async Task Latest_by_resolution_equals_the_single_read_for_every_kind()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var loopId = await conn.ExecuteScalarAsync<string?>(
            "SELECT loop_id FROM analytics.cplm_short_feature_results GROUP BY loop_id ORDER BY count(*) DESC LIMIT 1");
        loopId.Should().NotBeNull("the lab has short-feature rows");
        // Mixed case on purpose: the read is case-insensitive like every CPM loop read.
        var probeId = loopId!.ToUpperInvariant();

        var kinds = ShortKinds.Select(k => (Kind: k, IsLong: false)).Concat(new[] { (Kind: "24h", IsLong: true) }).ToList();
        var batch = await KpiReads.LatestByResolutionAsync(conn, probeId, kinds, limit: 12);

        batch.Keys.Should().BeEquivalentTo(kinds.Select(k => k.Kind));
        foreach (var (kind, isLong) in kinds)
        {
            var single = await conn.QueryAsync(isLong ? KpiSql.Long : KpiSql.Short,
                new { loopId = probeId, resolution = kind, from = (DateTimeOffset?)null, to = (DateTimeOffset?)null, limit = 12, before = (DateTimeOffset?)null });
            batch[kind].Tier.Should().Be(isLong ? "long" : "short");
            batch[kind].Count.Should().Be(single.Count());
            Rows(batch[kind].Samples).Should().Be(Rows(single), kind);
        }
        batch.Values.Sum(s => s.Count).Should().BeGreaterThan(0, "the chosen loop has rows");
    }

    // v2.5 workbench: a short (1m…60m) or long window is opened by its per-gate method run ids, so the
    // KPI rows must carry the identity columns the 53 migration added (method_run_ids, bundle_hash,
    // purpose) - the rows are the window picker's source for the non-fused tiers.
    [Theory]
    [InlineData("15m", false)]
    [InlineData("24h", true)]
    public async Task Every_kpi_row_names_its_run_identity(string kind, bool isLong)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var loopId = await conn.ExecuteScalarAsync<string?>(
            $"SELECT loop_id FROM analytics.{(isLong ? "cplm_long_feature_results" : "cplm_short_feature_results")} WHERE window_kind = @kind AND method_run_ids <> '{{}}'::jsonb ORDER BY created_at DESC LIMIT 1",
            new { kind });
        loopId.Should().NotBeNull($"the lab has {kind} rows with run identity (v2.5 jar)");
        var rows = (await conn.QueryAsync(isLong ? KpiSql.Long : KpiSql.Short,
            new { loopId, resolution = kind, from = (DateTimeOffset?)null, to = (DateTimeOffset?)null, limit = 3, before = (DateTimeOffset?)null })).ToList();
        rows.Should().NotBeEmpty();
        var first = (IDictionary<string, object?>)rows[0];
        first.Should().ContainKeys("method_run_ids", "bundle_hash", "purpose");
        var ids = System.Text.Json.JsonDocument.Parse((string)first["method_run_ids"]!).RootElement;
        ids.EnumerateObject().Should().NotBeEmpty("the row was written by a v2.5 jar");
        ids.EnumerateObject().Select(p => p.Name).Should().Contain(isLong ? "G5" : "G0");
        ((string)first["purpose"]!).Should().Be("LIVE");
        ((string)first["bundle_hash"]!).Should().NotBeNullOrWhiteSpace();
        if (!isLong)
        {
            first.Should().ContainKeys("gate0_reason", "evaluation_state", "evaluation_reason");
        }
    }

    [Fact]
    public async Task An_unknown_loop_yields_empty_slices_for_every_requested_kind()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var batch = await KpiReads.LatestByResolutionAsync(conn, "no-such-loop", new[] { ("1m", false), ("60m", false) }, 12);

        batch.Should().HaveCount(2);
        batch.Values.Should().OnlyContain(s => s.Count == 0 && !s.Samples.Any());
    }
}
