// CHG-023 — GET /loops (the registry list nine CPM pages mount).
//
// It hydrated every loop with two more round trips each: 1 + 2L queries in series on one
// connection (461 for the lab's 230 loops, ~0.45 s; every page that lists loops paid it).
// Now the tag map and the links are read once each and grouped in memory. The oracle is
// the per-loop hydration the service shipped with, run through the same Hydrate().
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class RegistryReadsTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _db.DisposeAsync();

    private const string LegacyTags = """
        SELECT signal_role, uns_path FROM cpm.loop_tag_map
        WHERE loop_id = @loopId AND is_active = TRUE
        """;

    private const string LegacyLinks = """
        SELECT to_loop_id AS ToLoopId, rel_type AS RelType, origin AS Origin
        FROM cpm.loop_link WHERE from_loop_id = @loopId
        UNION
        SELECT from_loop_id, rel_type, origin
        FROM cpm.loop_link WHERE to_loop_id = @loopId AND rel_type = 'PEER'
        """;

    /// <summary>Order-insensitive for the two collections; everything else must match exactly.</summary>
    private static string Canonical(CpmLoopDto d) => string.Join("|",
        d.LoopId, d.AssetId, d.DisplayName, d.Site, d.Area, d.Unit, d.LoopType, d.Criticality,
        d.IsActive, d.MonitoringEnabled,
        string.Join(",", d.Tags.OrderBy(t => t.Key, StringComparer.Ordinal).Select(t => $"{t.Key}={t.Value}")),
        string.Join(",", d.ObservabilityFlags),
        string.Join(",", d.Links.Select(l => $"{l.ToLoopId}/{l.RelType}/{l.Origin}").OrderBy(x => x, StringComparer.Ordinal)),
        d.StepTestApproved, d.ThresholdProfileId, d.Engineering);

    [Fact]
    public async Task Load_all_hydrates_every_loop_exactly_as_the_per_loop_queries_did()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync(CpmLoopRegistryReads.RegistrySelect + " ORDER BY loop_id")).ToList();
        rows.Should().NotBeEmpty();

        var expected = new List<string>();
        foreach (var row in rows)
        {
            string loopId = row.loop_id;
            var tags = (await conn.QueryAsync<(string SignalRole, string UnsPath)>(LegacyTags, new { loopId })).ToList();
            var links = (await conn.QueryAsync<CpmLoopLinkDto>(LegacyLinks, new { loopId })).ToList();
            expected.Add(Canonical(CpmLoopRegistryReads.Hydrate(row, tags, links)));
        }

        var actual = (await CpmLoopRegistryReads.LoadAllAsync(conn)).Select(Canonical).ToList();

        actual.Should().Equal(expected);
    }

    [Fact]
    public async Task Load_one_matches_load_all_for_a_loop_with_links()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var loopId = await conn.ExecuteScalarAsync<string?>(
            "SELECT from_loop_id FROM cpm.loop_link ORDER BY from_loop_id LIMIT 1")
            ?? await conn.ExecuteScalarAsync<string>("SELECT loop_id FROM cpm.loop_registry ORDER BY loop_id LIMIT 1");

        var one = await CpmLoopRegistryReads.LoadOneAsync(conn, loopId!);
        var all = (await CpmLoopRegistryReads.LoadAllAsync(conn)).Single(l => l.LoopId == loopId);

        one.Should().NotBeNull();
        Canonical(one!).Should().Be(Canonical(all));
    }
}
