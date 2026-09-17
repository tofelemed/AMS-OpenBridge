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
    public void Every_gate_is_an_installed_method_after_2F()
    {
        // v2.5: G12 is the system-response analysis (2A/2B), G14 the fault-scoped confirmation (1E),
        // G13 the aligned peer analysis (2F) - no flag-only gate remains.
        var m = CapabilityManifest.Build(new[] { Engine }, new ServiceIdentity("1.0.0", "deadbeef"));

        m.Methods.Single(x => x.Gate == "G13").Should().BeEquivalentTo(new { MethodId = "G13.ALIGNED_PEER_ANALYSIS_V1", Version = "1.0.0", State = "INSTALLED" });
        m.Methods.Single(x => x.Gate == "G12").Should().BeEquivalentTo(new { MethodId = "G12.SYSTEM_RESPONSE", Version = "1.0.0", State = "INSTALLED" });
        m.Methods.Single(x => x.Gate == "G14").Should().BeEquivalentTo(new { MethodId = "G14.FAULT_SCOPED_CONFIRMATION", State = "INSTALLED" });
        m.Methods.Single(x => x.Gate == "G6").MethodId.Should().Be("G6.WELCH_PSD");
        m.Methods.Where(x => x.State == "INSTALLED").Select(x => x.Gate)
            .Should().BeEquivalentTo(new[] { "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15" });
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

        m.Schemas["tuple"].Should().Be("1.1", "1A.1 raised the samples tuple to 1.1 (additive roles{})");
        m.Schemas["gateResult"].Should().Be("v1");
        m.Topics["samples"].Should().Be("traverse.cpa.loop.samples.v1");
        m.Topics["gateResults"].Should().Be("traverse.cpa.clpm.gate.results.v1");
        m.Topics["gateConfig"].Should().Be("traverse.cpa.context.gate-config.v1");
        m.Topics["gateConfigAcks"].Should().Be("traverse.cpa.context.gate-config.acks.v1");
        m.Windows.Should().NotBeNull();
    }

    // ---- v2.5 Task 3A.2: the config section - what the RUNNING jobs announced, never the JSON alone ----

    private static WorkerCapabilityRow Worker(string job, string jar, string catalogueHash, params string[] readable) => new(
        job, jar, "0123456789abcdef0123456789abcdef01234567", catalogueHash,
        Payload: System.Text.Json.JsonSerializer.Serialize(new
        {
            record_kind = "CAPABILITY", job_name = job, jar_sha256 = jar, catalogue_hash = catalogueHash,
            readable_property_ids = readable,
            unsupported_property_reasons = new Dictionary<string, string> { ["G8.method"] = "bicoherence not installed" },
            supported_role_mode_combinations = new[] { new { role = "PV", mode = "OPERATIONAL" } },
            execution_plan_capacity = new { scheduler_mode = "FIXED_COMPILED", max_retention_s = 87000, max_active_horizons = 10, supported_slides_s = new[] { 60, 300, 900 } },
        }),
        ReceivedAt: new DateTime(2026, 9, 17, 8, 0, 0, DateTimeKind.Utc));

    [Fact]
    public void Config_section_without_any_announced_worker_states_it_and_reads_nothing()
    {
        var m = CapabilityManifest.Build(Array.Empty<EngineVersionRow>(), new ServiceIdentity("1.0.0", "deadbeef"), Array.Empty<WorkerCapabilityRow>());

        m.Config.CatalogueHash.Should().Be(Traverse.CplmApi.Config.PropertyCatalogue.Current.CatalogueHash);
        m.Config.CatalogueCount.Should().Be(165);
        m.Config.State.Should().Be("NO_WORKER_ANNOUNCED");
        m.Config.Workers.Should().BeEmpty();
        m.Config.ReadablePropertyIds.Should().BeEmpty("readability is what the running jobs announced, not what the JSON says");
        m.Config.ExecutionPlanCapacity.Should().BeNull();
        m.Config.InstalledExecutionPlanHash.Should().MatchRegex("^[0-9a-f]{64}$");
        m.Config.ArtifactKinds.Should().Contain(new[] { "acf_series", "psd", "response_event", "cross_correlation" }).And.OnlyHaveUniqueItems();
        m.Config.Schemas["bundle"].Should().Be("traverse.cpa.gate-config.bundle/v1");
        m.Config.UnsupportedInBuild.Should().ContainKey("G8.method");
    }

    [Fact]
    public void Config_section_unions_what_the_running_jobs_read_and_flags_a_catalogue_mismatch()
    {
        var hash = Traverse.CplmApi.Config.PropertyCatalogue.Current.CatalogueHash;
        var jar = new string('b', 64);
        var m = CapabilityManifest.Build(Array.Empty<EngineVersionRow>(), new ServiceIdentity("1.0.0", "deadbeef"), new[]
        {
            Worker("AMS - CPLM Short Feature Engine", jar, hash, "G0.coverage_min", "G4.activity_warn_ratio"),
            Worker("AMS - CPLM Long Diagnostics Engine", jar, hash, "G5.period_min_s", "G0.coverage_min"),
        });

        m.Config.State.Should().Be("ANNOUNCED");
        m.Config.Workers.Should().HaveCount(2).And.OnlyContain(w => w.CatalogueMatches);
        m.Config.ReadablePropertyIds.Should().Equal("G0.coverage_min", "G4.activity_warn_ratio", "G5.period_min_s");
        m.Config.ReadableBy["G0.coverage_min"].Should().BeEquivalentTo(new[] { "AMS - CPLM Short Feature Engine", "AMS - CPLM Long Diagnostics Engine" });
        m.Config.NotReadByAnyJob.Should().NotContain("G0.coverage_min").And.Contain("G12.lambda_s", "no announced job reads it");
        m.Config.SupportedRoleModeCombinations.Should().ContainSingle();
        m.Config.ExecutionPlanCapacity.Should().NotBeNull();
        m.Config.ExecutionPlanCapacity!.Value.GetProperty("scheduler_mode").GetString().Should().Be("FIXED_COMPILED");
        m.Config.JarSha256s.Should().Equal(jar);

        var mixed = CapabilityManifest.Build(Array.Empty<EngineVersionRow>(), new ServiceIdentity("1.0.0", "deadbeef"), new[]
        {
            Worker("AMS - CPLM Short Feature Engine", jar, hash, "G0.coverage_min"),
            Worker("AMS - CPLM Fusion Engine", new string('c', 64), "stale-catalogue", "G15.recovery_support_s"),
        });
        mixed.Config.State.Should().Be("CATALOGUE_MISMATCH");
        mixed.Config.Workers.Single(w => w.JobName == "AMS - CPLM Fusion Engine").CatalogueMatches.Should().BeFalse();
        mixed.Config.JarSha256s.Should().HaveCount(2, "two jars are running - stated, never averaged away");
    }
}
