// CHG-201 - the Loop Registry detail page shows when a loop was added and last changed, and each signal's tag in the control
// system. Both are additive facts on the loop reads (GET /loops, GET /loops/{id}): createdAt / updatedAt from cpm.loop_registry,
// sourceTags from the active cpm.loop_tag_map rows (null when the map records none). Older frontends ignore the new fields.
using System.Text.Json;
using System.Text.Json.Serialization;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]   // writes the shared lab registry: serialised with the other lab tests
public sealed class RegistryLoopFactsTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _tagged = "ZZ_FACTS_T_" + Guid.NewGuid().ToString("N")[..8];
    private readonly string _bare = "ZZ_FACTS_B_" + Guid.NewGuid().ToString("N")[..8];
    private static readonly DateTime Added = new(2026, 8, 31, 9, 15, 0, DateTimeKind.Utc);
    private static readonly DateTime Changed = new(2026, 11, 4, 13, 20, 0, DateTimeKind.Utc);

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE loop_id = ANY(@ids)", new { ids = new[] { _tagged, _bare } });
        await _db.DisposeAsync();
    }

    private async Task SeedAsync(NpgsqlConnection conn)
    {
        foreach (var loop in new[] { _tagged, _bare })
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, monitoring, created_at, updated_at)
                VALUES (@loop, 'facts probe', 'FIC', 'facts_site', '{"enabled":true}'::jsonb, @added, @changed)
                """, new { loop, added = Added, changed = Changed });
        }
        // PV and SP carry a DCS tag, MODE none; the retired OP mapping's tag must not show.
        await conn.ExecuteAsync("""
            INSERT INTO cpm.loop_tag_map (loop_id, signal_role, uns_path, source_tag, is_active)
            VALUES (@loop, 'PV', 'facts/' || @loop || '.pv', 'FIC10401.PV', TRUE),
                   (@loop, 'SP', 'facts/' || @loop || '.sp', ' FIC10401.SP ', TRUE),
                   (@loop, 'MODE', 'facts/' || @loop || '.mode', NULL, TRUE),
                   (@loop, 'OP', 'facts/' || @loop || '.old_op', 'OLD.OP', FALSE)
            """, new { loop = _tagged });
        await conn.ExecuteAsync("""
            INSERT INTO cpm.loop_tag_map (loop_id, signal_role, uns_path, source_tag, is_active)
            VALUES (@loop, 'PV', 'facts/' || @loop || '.pv', '  ', TRUE)
            """, new { loop = _bare });
    }

    [Fact]
    public async Task One_loop_carries_its_dates_and_the_source_tag_of_each_active_mapping()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await SeedAsync(conn);

        var one = await CpmLoopRegistryReads.LoadOneAsync(conn, _tagged);

        one.Should().NotBeNull();
        one!.CreatedAt.Should().Be(Added);
        one.UpdatedAt.Should().Be(Changed);
        one.SourceTags.Should().BeEquivalentTo(new Dictionary<string, string> { ["PV"] = "FIC10401.PV", ["SP"] = "FIC10401.SP" });
    }

    [Fact]
    public async Task The_list_carries_the_same_facts_and_a_loop_without_source_tags_has_none()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await SeedAsync(conn);

        var all = await CpmLoopRegistryReads.LoadAllAsync(conn);
        var tagged = all.Single(l => l.LoopId == _tagged);
        var bare = all.Single(l => l.LoopId == _bare);

        tagged.CreatedAt.Should().Be(Added);
        tagged.UpdatedAt.Should().Be(Changed);
        tagged.SourceTags.Should().BeEquivalentTo(new Dictionary<string, string> { ["PV"] = "FIC10401.PV", ["SP"] = "FIC10401.SP" });
        bare.SourceTags.Should().BeNull("a blank source tag is not a tag");
        bare.CreatedAt.Should().Be(Added);
    }

    [Fact]
    public async Task The_json_adds_createdAt_updatedAt_and_sourceTags_and_leaves_sourceTags_out_when_there_are_none()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await SeedAsync(conn);
        // The options Program.cs gives the controllers.
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        var tagged = JsonDocument.Parse(JsonSerializer.Serialize(await CpmLoopRegistryReads.LoadOneAsync(conn, _tagged), options)).RootElement;
        var bare = JsonDocument.Parse(JsonSerializer.Serialize(await CpmLoopRegistryReads.LoadOneAsync(conn, _bare), options)).RootElement;

        tagged.GetProperty("createdAt").GetDateTime().Should().Be(Added);
        tagged.GetProperty("updatedAt").GetDateTime().Should().Be(Changed);
        tagged.GetProperty("sourceTags").GetProperty("PV").GetString().Should().Be("FIC10401.PV");
        tagged.GetProperty("tags").GetProperty("PV").GetString().Should().Be($"facts/{_tagged}.pv", "the existing fields are unchanged");
        bare.TryGetProperty("sourceTags", out _).Should().BeFalse();
    }
}
