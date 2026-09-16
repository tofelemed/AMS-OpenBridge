// v2.5 Task 0.4 — GET /api/v1/cpm/capabilities: the installed build's truth (spec v6 R26/C07,
// §5.3 capability manifest). Pure builder, no DB: the controller feeds it the observed engine
// identities and the static catalogues.
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class CapabilityManifestTests
{
    private static readonly EngineVersionRow Engine = new(
        CalculationVersion: "3.0.0", DynamicsProfileVersion: "2.0.0",
        SourceCommit: "0123456789abcdef0123456789abcdef01234567",
        JarSha256: new string('a', 64), ContractVersion: "v1",
        LastSeen: new DateTime(2026, 9, 16, 12, 0, 0, DateTimeKind.Utc));

    [Fact]
    public void Lists_every_gate_exactly_once_including_G2r_in_evaluation_order()
    {
        var m = CapabilityManifest.Build(new[] { Engine }, new ServiceIdentity("1.0.0", "deadbeef"));

        m.Methods.Select(x => x.Gate).Should().Equal(
            "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15");
        m.Methods.Should().HaveCount(17);
    }

    [Fact]
    public void Flag_only_gates_are_declared_legacy_not_installed()
    {
        // v2.5: G12 is the system-response analysis (2A/2B) and G14 the fault-scoped confirmation (1E);
        // G13 stays a link flag until the interaction analysis ships (2F).
        var m = CapabilityManifest.Build(new[] { Engine }, new ServiceIdentity("1.0.0", "deadbeef"));

        m.Methods.Single(x => x.Gate == "G13").State.Should().Be("LEGACY_FLAG_ONLY", because: "G13 is a boolean link flag until 2F");
        m.Methods.Single(x => x.Gate == "G12").Should().BeEquivalentTo(new { MethodId = "G12.SYSTEM_RESPONSE", Version = "1.0.0", State = "INSTALLED" });
        m.Methods.Single(x => x.Gate == "G14").Should().BeEquivalentTo(new { MethodId = "G14.FAULT_SCOPED_CONFIRMATION", State = "INSTALLED" });
        m.Methods.Single(x => x.Gate == "G6").MethodId.Should().Be("G6.WELCH_PSD");
        m.Methods.Where(x => x.State == "INSTALLED").Select(x => x.Gate)
            .Should().BeEquivalentTo(new[] { "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G14", "G15" });
    }

    [Fact]
    public void Observed_engine_identities_are_passed_through_verbatim_and_never_invented()
    {
        var m = CapabilityManifest.Build(new[] { Engine }, new ServiceIdentity("1.0.0", "deadbeef"));

        m.Engine.Observed.Should().ContainSingle().Which.Should().BeEquivalentTo(Engine);
        m.Service.Version.Should().Be("1.0.0");
        m.Service.SourceCommit.Should().Be("deadbeef");

        var none = CapabilityManifest.Build(Array.Empty<EngineVersionRow>(), new ServiceIdentity("1.0.0", "deadbeef"));
        none.Engine.Observed.Should().BeEmpty();
    }

    [Fact]
    public void Declares_the_wire_contracts_and_topics_the_build_speaks()
    {
        var m = CapabilityManifest.Build(Array.Empty<EngineVersionRow>(), new ServiceIdentity("1.0.0", "deadbeef"));

        m.Schemas["tuple"].Should().Be("1.0");
        m.Schemas["gateResult"].Should().Be("v1");
        m.Topics["samples"].Should().Be("traverse.cpa.loop.samples.v1");
        m.Topics["gateResults"].Should().Be("traverse.cpa.clpm.gate.results.v1");
        m.Windows.Should().NotBeNull();
    }
}
