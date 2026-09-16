using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>v2.5 Task 1H.6: the fleet health filters are server-side AND-clauses; unknown filters are refused, not ignored.</summary>
public sealed class FleetHealthFilterTests
{
    [Theory]
    [InlineData("missing-binding", "NOT EXISTS")]
    [InlineData("stale-collection", "collection_state IN")]
    [InlineData("active-affected", "eligibility IN")]
    public void Known_filters_become_and_clauses_inside_the_rankings_query(string filter, string marker)
    {
        var where = FleetLatestSql.HealthFilter(filter);
        where.Should().NotBeNull().And.Contain(marker);
        var sql = FleetLatestSql.Rankings("l.confidence DESC NULLS LAST", where!);
        sql.Should().Contain(marker);
        sql.IndexOf(marker, StringComparison.Ordinal).Should().BeLessThan(sql.LastIndexOf("ORDER BY", StringComparison.Ordinal),
            "the filter narrows the rows before ranking, so a LIMITed page is filtered by the server");
    }

    [Fact]
    public void No_filter_leaves_the_query_unchanged_and_an_unknown_filter_is_refused()
    {
        FleetLatestSql.HealthFilter(null).Should().Be("");
        FleetLatestSql.HealthFilter("  ").Should().Be("");
        FleetLatestSql.Rankings("l.mae DESC NULLS LAST").Should().Be(FleetLatestSql.Rankings("l.mae DESC NULLS LAST", ""));
        FleetLatestSql.HealthFilter("bogus").Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Every_filter_is_valid_sql_against_the_lab_schema()
    {
        await using var db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await db.OpenConnectionAsync();
        foreach (var f in new[] { "missing-binding", "stale-collection", "active-affected" })
        {
            var rows = await conn.QueryAsync(FleetLatestSql.Rankings("l.confidence DESC NULLS LAST", FleetLatestSql.HealthFilter(f)!),
                new { site = (string?)null, area = (string?)null, unit = (string?)null, windowKind = "24h", limit = 5 });
            rows.Should().NotBeNull();
        }
    }
}
