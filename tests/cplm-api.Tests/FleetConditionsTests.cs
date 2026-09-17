// 2026-09-17 audit F22: the fast G10 limit-dwell / G11 freeze conditions had no view - a freeze on the lab
// was visible only through the per-loop API and the next fused window. GET /conditions lists them fleet-wide
// (registry scope, open first) with the loop's display name; the rows are exactly the per-loop rows.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class FleetConditionsTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    [Fact]
    public async Task The_fleet_list_carries_the_per_loop_rows_with_the_registry_name_and_open_ones_first()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var loopId = await conn.ExecuteScalarAsync<string?>("SELECT loop_id FROM analytics.condition_event GROUP BY loop_id ORDER BY count(*) DESC LIMIT 1");
        loopId.Should().NotBeNull("the lab has condition events");
        var perLoop = (await conn.QueryAsync(ConditionEventStore.SelectForLoopSql, new { loopId, fromMs = (long?)null, toMs = (long?)null, openOnly = false, limit = 2000 })).ToList();

        var fleet = (await conn.QueryAsync(ConditionEventStore.SelectFleetSql, new { site = (string?)null, area = (string?)null, unit = (string?)null, openOnly = false, limit = 5000 })).ToList();
        var mine = fleet.Where(r => string.Equals((string)r.loop_id, loopId, StringComparison.OrdinalIgnoreCase)).ToList();
        mine.Select(r => $"{r.gate}|{r.kind}|{r.start_ms}|{r.state}").OrderBy(x => x)
            .Should().Equal(perLoop.Select(r => $"{r.gate}|{r.kind}|{r.start_ms}|{r.state}").OrderBy(x => x));
        mine.Select(r => (string?)r.display_name).Should().OnlyContain(n => n != null, "the registry name rides along");

        // open first, then newest
        var states = fleet.Select(r => (string)r.state == "CLOSED" ? 1 : 0).ToList();
        states.Should().BeInAscendingOrder();

        var open = (await conn.QueryAsync(ConditionEventStore.SelectFleetSql, new { site = (string?)null, area = (string?)null, unit = (string?)null, openOnly = true, limit = 5000 })).ToList();
        open.Select(r => (string)r.state).Should().OnlyContain(st => st != "CLOSED");
    }
}
