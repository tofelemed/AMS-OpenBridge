// CHG-043 (SME review #5/#6) — the fleet operating picture.
//
// Integration tests run against the REAL traverse_cplm database (lab Postgres on 127.0.0.1:5433,
// or CPLM_TEST_DB), like FleetLatestSqlTests. The oracle classifies every monitored loop in C#
// from a plain DISTINCT ON read; the SQL must give the same counts, and the states must add up
// to the monitored total — the defect being fixed is loops falling out of the Overview.
using System.Text.RegularExpressions;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class FleetStaleAfterTests
{
    [Theory]
    [InlineData("24h", 86_400)]
    [InlineData("12h", 43_200)]
    [InlineData("15m", 900)]
    [InlineData("7d", 604_800)]
    [InlineData(" 1H ", 3_600)]
    [InlineData("weird", 86_400)]
    [InlineData(null, 86_400)]
    [InlineData("0h", 86_400)]
    public void Stale_after_is_the_window_size(string? kind, int seconds)
        => FleetLatestSql.StaleAfterSeconds(kind).Should().Be(seconds);
}

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]   // reads or writes the shared lab registry: serialised with the other lab tests
public sealed class FleetStatusSqlTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;

    public Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _db.DisposeAsync();

    private sealed record Latest(string loop_id, string? site, string? diagnosis, DateTime? window_end, bool has_live_rows);

    private const string OracleLatest = """
        WITH v AS (
            SELECT DISTINCT ON (lower(g.loop_id)) lower(g.loop_id) AS lid, g.diagnosis, g.window_end
            FROM analytics.cplm_gate_results g
            WHERE g.window_kind = @windowKind AND g.purpose = 'LIVE'
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
            ORDER BY lower(g.loop_id), g.window_end DESC NULLS LAST, g.created_at DESC
        ), any_live AS (
            SELECT DISTINCT lower(g.loop_id) AS lid FROM analytics.cplm_gate_results g
            WHERE g.window_kind = @windowKind AND g.purpose = 'LIVE'
        )
        SELECT r.loop_id, r.site, v.diagnosis, v.window_end, (a.lid IS NOT NULL) AS has_live_rows
        FROM cpm.loop_registry r
        LEFT JOIN v ON v.lid = lower(r.loop_id)
        LEFT JOIN any_live a ON a.lid = lower(r.loop_id)
        WHERE COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
        """;

    private static string Classify(Latest l, DateTime now, int staleSeconds)
    {
        if (l.diagnosis is null) return l.has_live_rows ? "INSUFFICIENT_DATA" : "NO_RESULT";
        if (l.window_end is null || l.window_end < now.AddSeconds(-staleSeconds)) return "STALE";
        if (l.diagnosis.StartsWith("EXCLUDED", StringComparison.Ordinal)) return "EXCLUDED";
        if (l.diagnosis is "NORMAL" or "NONE" or "HEALTHY") return "HEALTHY";
        if (Regex.IsMatch(l.diagnosis, "^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_")) return "POOR";
        return "UNCLASSIFIED";
    }

    private async Task<Dictionary<string, int>> Statuses(string? site, string windowKind = "24h")
    {
        await using var conn = await _db.OpenConnectionAsync();
        var rows = await conn.QueryAsync<(string Status, int Count)>(FleetLatestSql.SummaryByStatus,
            new { site, area = (string?)null, unit = (string?)null, windowKind, staleSeconds = FleetLatestSql.StaleAfterSeconds(windowKind) });
        return rows.ToDictionary(r => r.Status, r => r.Count);
    }

    [Fact]
    public async Task Every_monitored_loop_is_in_exactly_one_state_and_matches_the_oracle()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var now = await conn.ExecuteScalarAsync<DateTime>("SELECT now() AT TIME ZONE 'UTC'");
        var latest = (await conn.QueryAsync<Latest>(OracleLatest, new { windowKind = "24h" })).ToList();
        latest.Should().NotBeEmpty("the lab registry carries monitored loops");

        var expected = latest.GroupBy(l => Classify(l, DateTime.SpecifyKind(now, DateTimeKind.Utc), 86_400))
            .ToDictionary(g => g.Key, g => g.Count());
        var actual = await Statuses(site: null);

        actual.Values.Sum().Should().Be(latest.Count, "the states add up to the monitored total");
        actual.Should().BeEquivalentTo(expected);
    }

    [Fact]
    public async Task A_site_scope_sums_to_that_sites_monitored_loops()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var site = await conn.ExecuteScalarAsync<string?>("""
            SELECT site FROM cpm.loop_registry WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE)
            GROUP BY site ORDER BY COUNT(*) DESC LIMIT 1
            """);
        site.Should().NotBeNull();
        var monitored = await conn.ExecuteScalarAsync<int>("""
            SELECT COUNT(*)::int FROM cpm.loop_registry
            WHERE site = @site AND COALESCE((monitoring->>'enabled')::boolean, FALSE)
            """, new { site });

        (await Statuses(site)).Values.Sum().Should().Be(monitored);
    }
}
