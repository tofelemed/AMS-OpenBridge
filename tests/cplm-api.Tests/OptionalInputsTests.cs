// SME review #23 (CHG-059): an optional input has five states, not one "missing" — only an expected-but-unmapped
// input is a configuration gap; a drive has no valve; a valve without a positioner is a plant fact; a mapped tag
// that went quiet is a data problem. Applicability is the engineer's word, else derived from the command path.
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Registry;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class OptionalInputsTests
{
    private static JsonElement Eng(string json) => JsonDocument.Parse(json).RootElement;

    [Theory]
    [InlineData("OP_TO_VALVE", InputApplicability.Expected)]
    [InlineData("OP_TO_VFD", InputApplicability.NotApplicable)]
    [InlineData("OP_TO_PV", InputApplicability.NotApplicable)]
    [InlineData("UNKNOWN", InputApplicability.Expected)]
    [InlineData(null, InputApplicability.Expected)]
    public void Vp_applicability_defaults_from_the_command_path(string? path, InputApplicability expected) =>
        OptionalInputs.VpApplicability(Eng("{}"), path).Should().Be(expected);

    [Fact]
    public void The_engineers_statement_wins_over_the_default()
    {
        OptionalInputs.VpApplicability(Eng("""{"vpApplicability":"not_installed"}"""), "OP_TO_VALVE").Should().Be(InputApplicability.NotInstalled);
        OptionalInputs.VpApplicability(Eng("""{"vpApplicability":"EXPECTED"}"""), "OP_TO_VFD").Should().Be(InputApplicability.Expected);
        OptionalInputs.VpApplicability(Eng("""{"vpApplicability":"rubbish"}"""), "OP_TO_VFD").Should().Be(InputApplicability.NotApplicable);
        OptionalInputs.PeerApplicability(Eng("""{"peerApplicability":"NOT_APPLICABLE"}""")).Should().Be(InputApplicability.NotApplicable);
        OptionalInputs.PeerApplicability(Eng("null")).Should().Be(InputApplicability.Expected);
    }

    [Theory]
    [InlineData(InputApplicability.Expected, true, true, InputState.Available)]
    [InlineData(InputApplicability.Expected, true, null, InputState.Available)]
    [InlineData(InputApplicability.Expected, true, false, InputState.TemporarilyUnavailable)]
    [InlineData(InputApplicability.Expected, false, null, InputState.ExpectedUnmapped)]
    [InlineData(InputApplicability.NotInstalled, false, false, InputState.NotInstalled)]
    [InlineData(InputApplicability.NotApplicable, false, false, InputState.NotApplicable)]
    public void The_state_combines_applicability_mapping_and_the_latest_window(InputApplicability a, bool mapped, bool? seen, InputState expected) =>
        OptionalInputs.State(a, mapped, seen).Should().Be(expected);

    [Fact]
    public void Only_the_three_words_are_stored()
    {
        OptionalInputs.IsApplicability("Not_Applicable").Should().BeTrue();
        OptionalInputs.IsApplicability("maybe").Should().BeFalse();
        var json = CpmLoopRegistryService.SerializeRange(new CpmEngineeringRange(VpApplicability: "not_installed", PeerApplicability: "<b>"));
        var e = JsonDocument.Parse(json).RootElement;
        e.GetProperty("vpApplicability").GetString().Should().Be("NOT_INSTALLED");
        e.TryGetProperty("peerApplicability", out _).Should().BeFalse("free text is never stored");
        CpmLoopRegistryService.HasRange(new CpmEngineeringRange(VpApplicability: "NOT_INSTALLED")).Should().BeTrue();
    }
}

/// <summary>CHG-059: the fleet counts' SQL rule and the readiness C# rule must never disagree.</summary>
[Trait("Category", "Integration")]
public sealed class OptionalInputsSqlTests
{
    [Theory]
    [InlineData("{}", "OP_TO_VALVE")] [InlineData("{}", "OP_TO_VFD")] [InlineData("{}", "OP_TO_PV")] [InlineData("{}", "UNKNOWN")] [InlineData("{}", null)]
    [InlineData("""{"vpApplicability":"not_installed"}""", "OP_TO_VALVE")] [InlineData("""{"vpApplicability":"EXPECTED"}""", "OP_TO_VFD")]
    [InlineData("""{"vpApplicability":" "}""", "OP_TO_VFD")] [InlineData("""{"peerApplicability":"NOT_APPLICABLE"}""", "OP_TO_VALVE")]
    public async Task The_sql_and_the_csharp_rules_agree(string engineering, string? commandPath)
    {
        await using var db = Npgsql.NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await db.OpenConnectionAsync();
        var row = await Dapper.SqlMapper.QueryFirstAsync<(string Vp, string Peer)>(conn,
            $"SELECT {OptionalInputs.VpApplicabilitySql} AS vp, {OptionalInputs.PeerApplicabilitySql} AS peer FROM (SELECT @e::jsonb AS engineering, @p::text AS command_path) r",
            new { e = engineering, p = commandPath });
        var e = JsonDocument.Parse(engineering).RootElement;
        row.Vp.Should().Be(OptionalInputs.Code(OptionalInputs.VpApplicability(e, commandPath)));
        row.Peer.Should().Be(OptionalInputs.Code(OptionalInputs.PeerApplicability(e)));
    }

    // CHG-077: the registry's NO_VP / NO_UPSTREAM_LINKS (and so its "Degraded") only where the loop declares the input
    [Theory]
    [InlineData("{}", null, true)]
    [InlineData("{\"vpApplicability\":\"EXPECTED\"}", null, true)]
    [InlineData("{\"vpApplicability\":\"NOT_APPLICABLE\"}", null, false)]
    [InlineData("{\"vpApplicability\":\"NOT_INSTALLED\"}", null, false)]
    [InlineData("{}", "OP_TO_VFD", false)]
    public void Registry_flags_NO_VP_only_for_a_loop_declared_with_a_valve_position(string engineering, string? commandPath, bool noVp)
    {
        var flags = CpmLoopRegistryReads.BuildObservabilityFlags(new[] { "PV", "SP", "OP" }, Array.Empty<CpmLoopLinkDto>(), JsonDocument.Parse(engineering).RootElement, commandPath);
        flags.Contains("NO_VP").Should().Be(noVp);
        CpmLoopRegistryReads.BuildObservabilityFlags(new[] { "PV", "VP" }, Array.Empty<CpmLoopLinkDto>(), JsonDocument.Parse(engineering).RootElement, commandPath)
            .Should().NotContain("NO_VP", "a mapped VP is never missing");
    }

    [Fact]
    public void Registry_flags_no_peer_links_only_where_peers_are_expected()
    {
        var none = Array.Empty<CpmLoopLinkDto>();
        CpmLoopRegistryReads.BuildObservabilityFlags(new[] { "VP" }, none, JsonDocument.Parse("{}").RootElement).Should().Contain("NO_UPSTREAM_LINKS");
        CpmLoopRegistryReads.BuildObservabilityFlags(new[] { "VP" }, none, JsonDocument.Parse("{\"peerApplicability\":\"NOT_APPLICABLE\"}").RootElement)
            .Should().NotContain("NO_UPSTREAM_LINKS");
    }
}
