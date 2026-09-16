// v2.5 Task 2D.1 (spec §3.1; R13) - GET /api/v1/cpm/gate-catalogue: the 17 gates as THIS build knows
// them - definition, role in fusion, installed method and version, the evidence artifact kinds the
// engine emits (2C.1c, verbatim), capability state. The UI's static GATE_ROLES / calcCatalogue are
// replaced by this in 2E.3. Pure: no DB.
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class GateCatalogueTests
{
    [Fact]
    public void Lists_the_seventeen_gates_once_in_evaluation_order_with_role_and_method()
    {
        var entries = GateCatalog.Catalogue();
        entries.Select(e => e.Gate).Should().Equal("G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15");
        foreach (var e in entries)
        {
            e.Name.Should().NotBeNullOrWhiteSpace();
            e.Definition.Should().NotBeNullOrWhiteSpace(e.Gate);
            e.Role.Should().BeOneOf("BLOCKING", "ELIGIBILITY", "PERFORMANCE", "PRIMARY", "SUPPORTING", "CONTEXT", "CONFIRMATION", "FUSION");
            e.Method.MethodId.Should().StartWith(e.Gate + ".");
            e.Tier.Should().BeOneOf("short", "long", "fusion", "response");
        }
    }

    [Fact]
    public void Installed_gates_name_their_artifact_kinds_and_G13_is_the_aligned_peer_analysis()
    {
        var entries = GateCatalog.Catalogue().ToDictionary(e => e.Gate);
        foreach (var g in new[] { "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15" })
        {
            entries[g].CapabilityState.Should().Be("INSTALLED", g);
            entries[g].ArtifactKinds.Should().NotBeEmpty(g);
        }
        entries["G0"].ArtifactKinds.Should().Contain("role_qualification");
        entries["G6"].ArtifactKinds.Should().Contain("psd");
        entries["G7"].ArtifactKinds.Should().Contain("cycle_fit");
        entries["G10"].ArtifactKinds.Should().Contain(new[] { "actuator_limits", "dwell_events" });
        entries["G11"].ArtifactKinds.Should().Contain(new[] { "measurement", "freeze_events", "eligibility_intervals" });
        entries["G12"].ArtifactKinds.Should().Contain(new[] { "response_event", "y_fit", "residuals", "candidate_models" });
        entries["G13"].Method.MethodId.Should().Be("G13.ALIGNED_PEER_ANALYSIS_V1");
        entries["G13"].Tier.Should().Be("long", because: "the long tier analyses peers; the fused row shares the run id");
        entries["G13"].ArtifactKinds.Should().Equal("interaction", "aligned_series", "cross_correlation", "coherence");
        entries["G8"].Method.MethodId.Should().Be("G8.XCORR_ASYMMETRY_V1");
        entries["G8"].Definition.Should().Contain("not an odd-harmonic");
    }

    [Fact]
    public void The_endpoint_serves_the_same_catalogue_and_the_manifest_derives_its_methods_from_it()
    {
        var res = CpmCapabilitiesController.GateCatalogue();
        var ok = res.Should().BeOfType<OkObjectResult>().Subject;
        var json = System.Text.Json.JsonSerializer.SerializeToElement(ok.Value);
        json.GetProperty("count").GetInt32().Should().Be(17);
        json.GetProperty("gates").GetArrayLength().Should().Be(17);
        var manifest = CapabilityManifest.Build(Array.Empty<EngineVersionRow>(), new ServiceIdentity("1.0.0", "x"));
        manifest.Methods.Select(m => (m.Gate, m.MethodId, m.Version, m.State))
            .Should().Equal(GateCatalog.Catalogue().Select(e => (e.Gate, e.Method.MethodId, e.Method.Version, e.Method.State)));
    }
}
