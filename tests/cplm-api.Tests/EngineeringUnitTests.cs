// CHG-047 (SME review #10) — the PV engineering unit on the loop registry's engineering block.
// Unit tests for the read / write / "worth storing" rules, and an integration test that evaluates the
// bulk upsert's real merge expression (CpmLoopRegistryService.EngineeringMerge) on the lab Postgres with
// literal JSON, so a ranges-only re-import provably keeps a registered unit.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Registry;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EngineeringUnitTests
{
    [Fact]
    public void Reads_the_unit_and_a_unit_alone_is_a_range_worth_returning()
    {
        CpmLoopRegistryReads.ReadRange("""{"pvMin":0,"pvMax":1200,"pvUnit":" kg/h "}""")!
            .Should().BeEquivalentTo(new CpmEngineeringRange(PvMin: 0, PvMax: 1200, PvUnit: "kg/h"));
        CpmLoopRegistryReads.ReadRange("""{"pvUnit":"°C"}""")!.PvUnit.Should().Be("°C");
        CpmLoopRegistryReads.ReadRange("""{"pvUnit":"   "}""").Should().BeNull();
        CpmLoopRegistryReads.ReadRange("""{"pvMin":0,"pvMax":10}""")!.PvUnit.Should().BeNull();
    }

    [Fact]
    public void Writes_a_trimmed_capped_unit_and_omits_a_blank_one()
    {
        var json = CpmLoopRegistryService.SerializeRange(new CpmEngineeringRange(PvMin: 0, PvMax: 5, PvUnit: "  barg "));
        JsonDocument.Parse(json).RootElement.GetProperty("pvUnit").GetString().Should().Be("barg");

        var blank = CpmLoopRegistryService.SerializeRange(new CpmEngineeringRange(PvMin: 0, PvMax: 5, PvUnit: " "));
        JsonDocument.Parse(blank).RootElement.TryGetProperty("pvUnit", out _).Should().BeFalse();

        var longUnit = CpmLoopRegistryService.SerializeRange(new CpmEngineeringRange(PvUnit: new string('x', 60)));
        JsonDocument.Parse(longUnit).RootElement.GetProperty("pvUnit").GetString()!.Length
            .Should().Be(CpmLoopRegistryService.MaxPvUnitLength);
    }

    [Fact]
    public void A_unit_alone_is_worth_storing()
    {
        CpmLoopRegistryService.HasRange(new CpmEngineeringRange(PvUnit: "m3/h")).Should().BeTrue();
        CpmLoopRegistryService.HasRange(new CpmEngineeringRange(PvUnit: " ")).Should().BeFalse();
        CpmLoopRegistryService.HasRange(null).Should().BeFalse();
    }
}

[Trait("Category", "Integration")]
public sealed class EngineeringMergeSqlTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;

    public Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _db.DisposeAsync();

    private async Task<JsonElement> Merge(string incoming, string existing)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var sql = "SELECT (" + CpmLoopRegistryService.EngineeringMerge("@inc::jsonb", "@ex::jsonb") + ")::text";
        var text = await conn.ExecuteScalarAsync<string>(sql, new { inc = incoming, ex = existing, emptyJson = "{}" });
        return JsonDocument.Parse(text!).RootElement;
    }

    [Fact]
    public async Task A_ranges_only_reimport_keeps_the_registered_unit()
    {
        var r = await Merge("""{"pvMin":0,"pvMax":900}""", """{"pvMin":0,"pvMax":800,"pvUnit":"kg/h"}""");
        r.GetProperty("pvMax").GetDouble().Should().Be(900, "the re-import is the new truth for the ranges");
        r.GetProperty("pvUnit").GetString().Should().Be("kg/h", "a row without a unit must not wipe one");
    }

    [Fact]
    public async Task A_row_with_a_unit_replaces_it_and_an_empty_block_keeps_everything()
    {
        (await Merge("""{"pvUnit":"t/h"}""", """{"pvMin":0,"pvMax":800,"pvUnit":"kg/h"}"""))
            .GetProperty("pvUnit").GetString().Should().Be("t/h");
        var kept = await Merge("{}", """{"pvMin":0,"pvMax":800,"pvUnit":"kg/h"}""");
        kept.GetProperty("pvMax").GetDouble().Should().Be(800);
        kept.GetProperty("pvUnit").GetString().Should().Be("kg/h");
    }

    [Fact]
    public async Task Without_a_stored_unit_the_incoming_block_is_taken_as_is()
    {
        var r = await Merge("""{"pvMin":1,"pvMax":2}""", """{"pvMin":0,"pvMax":800}""");
        r.TryGetProperty("pvUnit", out _).Should().BeFalse();
        r.GetProperty("pvMin").GetDouble().Should().Be(1);
    }
}
