// CHG-223 "Use plant-wide settings": a LOOP version that drops a loop's own settings (resolved.inherit) - its content, the
// refused edit, the endpoint rows, the batch approve + deploy + ACKs + probe that leaves the loop with no active LOOP row (every
// read then shows the PROFILE / SITE bundle or none), a later region edit on the plant-wide base, and a rollback to the marker.
// Against the lab database, in its own site.
using System.Security.Claims;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class LoopInheritTests : IAsyncLifetime
{
    private const string Site = "e2e-inherit-site";
    private const string Profile = "FLOW_FAST_SELF_REG";
    private static readonly string[] Jobs = { "AMS - CPLM Short Feature Engine", "AMS - CPLM Response Engine" };
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    private ConfigDeploymentService _deployments = null!;
    private RegionBulkService _regions = null!;
    private ConfigBatchService _batches = null!;
    private LoopSettingsService _loopSettings = null!;
    private RegistryStub _registryStub = null!;
    private ICpmLoopRegistryService _registry = null!;
    private readonly CapturingPublisher _publisher = new();
    private List<dynamic> _capabilities = new();

    private sealed class CapturingPublisher : IGateConfigPublisher
    {
        public List<JsonElement> Messages { get; } = new();
        public Task PublishAsync(string bundleId, string message, CancellationToken ct)
        {
            Messages.Add(JsonDocument.Parse(message).RootElement.Clone());
            return Task.CompletedTask;
        }
    }

    private sealed class NullAudit : ICplmAuditEmitter
    {
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) { }
    }

    private static CpmLoopDto Loop(string id, string type, bool active = true, string site = Site) =>
        new(id, null, id, site, null, null, type, "LOW", active, true, new Dictionary<string, string>(), Array.Empty<string>(),
            Array.Empty<CpmLoopLinkDto>(), false, null);

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new ConfigStore(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Auth:ServiceKey"] = "test-key", ["Cpm:ConfigAckWindowMinutes"] = "5", ["Cpm:ConfigProbeWindowMinutes"] = "0" }).Build();
        _deployments = new ConfigDeploymentService(_db, _store, _publisher, new NullAudit(), config, NullLogger<ConfigDeploymentService>.Instance);
        (_registry, _registryStub) = RegistryStub.Create();
        _registryStub.Loops["IN_FIC1"] = Loop("IN_FIC1", "FIC");
        _registryStub.Loops["IN_FIC2"] = Loop("IN_FIC2", "FIC");
        _registryStub.Loops["IN_OLD"] = Loop("IN_OLD", "FIC", active: false);
        _registryStub.Loops["IN_FAR"] = Loop("IN_FAR", "FIC", site: "e2e-inherit-other");
        _regions = new RegionBulkService(_store, _registry, new NullAudit());
        _batches = new ConfigBatchService(_store, _deployments, new NullAudit());
        _loopSettings = new LoopSettingsService(_store, _registry, new NullAudit());
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        // the deployments need announced workers; the shared lab table is snapshotted and restored (as the other Config tests do)
        _capabilities = (await conn.QueryAsync("SELECT job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids::text AS r, unsupported::text AS u, execution_plan_capacity::text AS e, payload::text AS p, announced_at_ms FROM cpm.config_worker_capability")).ToList();
        await conn.ExecuteAsync("DELETE FROM cpm.config_worker_capability");
        foreach (var job in Jobs)
            await conn.ExecuteAsync("""
                INSERT INTO cpm.config_worker_capability (job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids, unsupported, execution_plan_capacity, payload, announced_at_ms)
                VALUES (@job, 'jar-A', 'abc', @catalogue, '["G2r.pv_region_min","G2r.pv_region_max","G4.activity_warn_ratio"]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1)
                """, new { job, catalogue = PropertyCatalogue.Current.CatalogueHash });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        await conn.ExecuteAsync("DELETE FROM cpm.config_worker_capability");
        foreach (var r in _capabilities)
            await conn.ExecuteAsync("""
                INSERT INTO cpm.config_worker_capability (job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids, unsupported, execution_plan_capacity, payload, announced_at_ms)
                VALUES (@job_name, @jar_sha256, @source_commit, @catalogue_hash, @r::jsonb, @u::jsonb, @e::jsonb, @p::jsonb, @announced_at_ms) ON CONFLICT (job_name) DO NOTHING
                """, new { job_name = (string)r.job_name, jar_sha256 = (string)r.jar_sha256, source_commit = (string?)r.source_commit, catalogue_hash = (string)r.catalogue_hash,
                    r = (string)r.r, u = (string)r.u, e = (string)r.e, p = (string)r.p, announced_at_ms = (long)r.announced_at_ms });
        await _db.DisposeAsync();
    }

    private static Task<int> Cleanup(NpgsqlConnection conn) => conn.ExecuteAsync("""
        DELETE FROM cpm.config_active WHERE site = @site;
        DELETE FROM cpm.config_worker_ack WHERE deployment_id IN (SELECT deployment_id FROM cpm.config_deployment WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site));
        DELETE FROM cpm.config_deployment WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.config_approval WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.gate_config_bundle WHERE site = @site
        """, new { site = Site });

    // ── helpers ─────────────────────────────────────────────────────────────
    private async Task<DeploymentView> AckAllAsync(Guid deploymentId, string hash)
    {
        foreach (var phase in new[] { "PREPARE", "APPLY" })
            foreach (var job in Jobs) await _deployments.RecordAckAsync(deploymentId, job, 0, phase, "ACK", hash, "jar-A", "abc", "gen-1", null, default);
        return (await _deployments.GetAsync(deploymentId, default))!;
    }

    /// <summary>frank approves and deploys the batch, every worker acknowledges each deployment: ACTIVE_VERIFIED (probe window 0).</summary>
    private async Task<IReadOnlyList<ConfigBatchService.RowResult>> DeployBatchAsync(Guid batch)
    {
        (await _batches.ApproveAsync(Site, batch, "frank", new[] { "Supervisor" }, null, TimeSpan.FromHours(1), default)).Should().OnlyContain(r => r.Error == null);
        var deployed = await _batches.DeployAsync(Site, batch, "frank", default);
        foreach (var row in deployed)
        {
            var b = (await _store.GetAsync(row.BundleId!.Value, default))!;
            (await AckAllAsync(row.DeploymentId!.Value, b.ContentHash)).State.Should().Be("ACTIVE_VERIFIED");
        }
        return deployed;
    }

    /// <summary>The loop's own LOOP bundle with a region, deployed and verified.</summary>
    private async Task<BundleView> OwnRegionAsync(string loopId, double min, double max)
    {
        var (batch, _) = await _regions.CreateAsync(new[] { new RegionBulkService.RegionRow(loopId, min, max) }, null, "erin", default);
        var rows = await DeployBatchAsync(batch);
        return (await _store.GetAsync(rows.Single().BundleId!.Value, default))!;
    }

    /// <summary>A plant-wide PROFILE bundle (G4.activity_warn_ratio = <paramref name="warnRatio"/>), deployed and verified.</summary>
    private async Task<BundleView> ActiveProfileAsync(double warnRatio)
    {
        var p = await _store.CreateDraftAsync(Site, "PROFILE", Profile, null, null, "erin", null, default);
        p = await _store.PatchAsync(p.BundleId, p.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio",
            JsonDocument.Parse(warnRatio.ToString(System.Globalization.CultureInfo.InvariantCulture)).RootElement) }, "erin", default);
        p = await _store.ValidateAsync(p.BundleId, default);
        p = await _store.ApproveAsync(p.BundleId, "frank", "Supervisor", null, TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
        var d = await _deployments.CreateAsync(p.BundleId, "ACTIVATE", null, null, "frank", default);
        (await AckAllAsync(d.DeploymentId, p.ContentHash)).State.Should().Be("ACTIVE_VERIFIED");
        return (await _store.GetAsync(p.BundleId, default))!;
    }

    /// <summary>The marker for the loop, approved, deployed and verified; returns it and its deployment.</summary>
    private async Task<(BundleView Marker, DeploymentView Deployment)> InheritDeployedAsync(string loopId)
    {
        var (batch, rows) = await _loopSettings.InheritAsync(Site, new[] { loopId }, null, "erin", default);
        rows.Single().Error.Should().BeNull();
        var deployed = await DeployBatchAsync(batch);
        return ((await _store.GetAsync(rows[0].BundleId!.Value, default))!, (await _deployments.GetAsync(deployed[0].DeploymentId!.Value, default))!);
    }

    private async Task<int> LoopRowsAsync(string loopId)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM cpm.config_active WHERE site = @site AND scope_kind = 'LOOP' AND scope_ref = @loopId", new { site = Site, loopId });
    }

    private CpmConfigRegionsController RegionsApi(string user, params string[] roles) => WithUser(new CpmConfigRegionsController(_regions, _loopSettings, _batches), user, roles);

    private CpmConfigurationController ConfigApi() => WithUser(new CpmConfigurationController(_store, _deployments, _registry, null!, new NullAudit(), null!), "erin");

    private static T WithUser<T>(T controller, string user, params string[] roles) where T : ControllerBase
    {
        var claims = new List<Claim> { new("preferred_username", user) };
        claims.AddRange(roles.Select(r => new Claim("role", r)));
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) } };
        return controller;
    }

    private static JsonElement Body(IActionResult r)
    {
        r.Should().BeOfType<OkObjectResult>();
        return JsonSerializer.SerializeToElement(((OkObjectResult)r).Value, Web);
    }

    private static int Status(IActionResult r) => r is ObjectResult o ? o.StatusCode ?? 200 : 0;

    private static string[] Kinds(BundleView b) => b.Layers.EnumerateArray().Select(l => l.GetProperty("kind").GetString()!).ToArray();

    // ── tests ───────────────────────────────────────────────────────────────
    [Fact]
    public async Task The_marker_holds_the_plant_wide_layers_with_no_loop_layer_and_the_inherit_object_inside_its_hash()
    {
        var own = await OwnRegionAsync("IN_FIC1", 10, 20);
        var profile = await ActiveProfileAsync(2.5);
        var (batch, rows) = await _loopSettings.InheritAsync(Site, new[] { "IN_FIC1" }, "back to the plant", "erin", default);
        var row = rows.Single();
        row.Error.Should().BeNull();
        row.State.Should().Be("VALIDATED");
        row.Inherits.Should().BeTrue();
        (row.PvMin, row.PvMax).Should().Be(((double?)null, (double?)null), "the plant-wide settings hold no region");
        (row.PreviousMin, row.PreviousMax).Should().Be(((double?)10, (double?)20));

        var m = (await _store.GetAsync(row.BundleId!.Value, default))!;
        m.Inherits.Should().BeTrue();
        (m.ScopeKind, m.ScopeRef, m.ParentBundleId, m.Version).Should().Be(("LOOP", "IN_FIC1", (Guid?)own.BundleId, own.Version + 1));
        m.Note.Should().StartWith(ConfigBatchService.Marker(batch, LoopSettingsService.InheritBatchKind)).And.EndWith("back to the plant");
        Kinds(m).Should().Equal(Kinds(profile)).And.NotContain("LOOP").And.NotContain("REGIME");
        CanonicalJson.Canonicalize(m.Layers).Should().Be(CanonicalJson.Canonicalize(profile.Layers), "the layers are the active PROFILE bundle's");
        m.Resolved.GetProperty("inherit").GetProperty("loop_id").GetString().Should().Be("IN_FIC1");
        m.Resolved.GetProperty("properties").GetProperty("G4.activity_warn_ratio").GetDouble().Should().Be(2.5);
        ConfigBatchService.RegionOf(m.Resolved).Should().Be(((double?)null, (double?)null));

        // the hash a worker recomputes: SHA-256 of canonical {layers, resolved} - the inherit object included
        CanonicalJson.Sha256(JsonSerializer.SerializeToElement(new { layers = m.Layers, resolved = m.Resolved })).Should().Be(m.ContentHash);
        ConfigStore.Resolve(m.Layers, "IN_FIC1").ContentHash.Should().Be(m.ContentHash);
        ConfigStore.Resolve(m.Layers).ContentHash.Should().NotBe(m.ContentHash, "the inherit object is inside the hash");

        // the workers receive the resolved block verbatim
        var envelope = BundleEnvelope.Bundle(m, Array.Empty<(string, string, string, string, DateTimeOffset, DateTimeOffset?, string?)>());
        envelope.GetProperty("resolved").GetProperty("inherit").GetProperty("loop_id").GetString().Should().Be("IN_FIC1");
        envelope.GetProperty("scope").GetProperty("kind").GetString().Should().Be("LOOP");

        // the read shapes: GET drafts/{id}, GET drafts (full and projection=summary)
        JsonSerializer.SerializeToElement(CpmConfigurationController.ShapeWithApprovals(m, Array.Empty<ConfigStore.ApprovalView>()), Web).GetProperty("inherits").GetBoolean().Should().BeTrue();
        JsonSerializer.SerializeToElement(CpmConfigurationController.Shape(m), Web).GetProperty("inherits").GetBoolean().Should().BeTrue();
        JsonSerializer.SerializeToElement(CpmConfigurationController.ShapeSummary(m), Web).GetProperty("inherits").GetBoolean().Should().BeTrue();
        JsonSerializer.SerializeToElement(CpmConfigurationController.ShapeSummary(own), Web).GetProperty("inherits").GetBoolean().Should().BeFalse();
        var listed = await _store.ListAsync(Site, "LOOP", "IN_FIC1", null, default);
        listed.Single(b => b.BundleId == m.BundleId).Inherits.Should().BeTrue();
        listed.Single(b => b.BundleId == own.BundleId).Inherits.Should().BeFalse();
    }

    [Fact]
    public async Task A_marker_has_nothing_to_edit_and_only_a_loop_version_can_be_one()
    {
        await OwnRegionAsync("IN_FIC1", 10, 20);
        var (_, rows) = await _loopSettings.InheritAsync(Site, new[] { "IN_FIC1" }, null, "erin", default);
        var m = (await _store.GetAsync(rows[0].BundleId!.Value, default))!;
        var edit = () => _store.PatchAsync(m.BundleId, m.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse("2.0").RootElement) }, "erin", default);
        (await edit.Should().ThrowAsync<ConfigStateException>()).Which.Message.Should().Be("this version uses the plant-wide settings: it has nothing of its own to edit");

        var profileMarker = () => _store.CreateDraftAsync(Site, "PROFILE", Profile, null, null, "erin", null, default, m.Layers, inherit: true);
        await profileMarker.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task The_endpoint_makes_one_batch_and_gives_every_other_loop_its_reason()
    {
        await OwnRegionAsync("IN_FIC1", 10, 20);
        var api = RegionsApi("erin", "Engineer");
        Status(await api.Inherit(new(null, new[] { "IN_FIC1" }, null), default)).Should().Be(400);
        Status(await api.Inherit(new(Site, Array.Empty<string>(), null), default)).Should().Be(400);
        Status(await api.Inherit(new(Site, Enumerable.Range(0, 201).Select(i => $"L{i}").ToArray(), null), default)).Should().Be(400);

        var body = Body(await api.Inherit(new(Site, new[] { "IN_FIC1", "IN_FIC2", "IN_OLD", "NOPE", "in_fic1", "IN_FAR" }, "plant"), default));
        (body.GetProperty("count").GetInt32(), body.GetProperty("drafts").GetInt32(), body.GetProperty("failed").GetInt32()).Should().Be((6, 1, 5));
        var rows = body.GetProperty("rows").EnumerateArray().ToDictionary(r => r.GetProperty("loopId").GetString()!);
        rows["IN_FIC1"].GetProperty("state").GetString().Should().Be("VALIDATED");
        rows["IN_FIC1"].GetProperty("inherits").GetBoolean().Should().BeTrue();
        rows["IN_FIC1"].GetProperty("previousMin").GetDouble().Should().Be(10);
        rows["IN_FIC1"].GetProperty("pvMin").ValueKind.Should().Be(JsonValueKind.Null);
        rows["IN_FIC2"].GetProperty("error").GetString().Should().Be("the loop already uses the plant-wide settings", "a loop with no own bundle never gets a marker");
        rows["IN_OLD"].GetProperty("error").GetString().Should().Contain("retired");
        rows["NOPE"].GetProperty("error").GetString().Should().Contain("not registered");
        rows["in_fic1"].GetProperty("error").GetString().Should().Contain("twice");
        rows["IN_FAR"].GetProperty("error").GetString().Should().Contain("belongs to site");

        var batch = Body(await RegionsApi("frank", "Supervisor").Batch(body.GetProperty("batchId").GetGuid(), Site, default));
        batch.GetProperty("createdBy").GetString().Should().Be("erin");
        batch.GetProperty("rows").EnumerateArray().Should().ContainSingle().Which.GetProperty("inherits").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Deploying_the_batch_drops_the_loops_own_row_and_every_read_shows_the_profile_bundle()
    {
        var own = await OwnRegionAsync("IN_FIC1", 10, 20);
        var profile = await ActiveProfileAsync(2.5);
        var ownDeployment = (await _deployments.ListAsync(own.BundleId, null, 1, default)).Single();
        (await _loopSettings.StaleAsync(Site, default)).Should().ContainSingle("the loop's own bundle sits on the factory base");

        var (batch, rows) = await _loopSettings.InheritAsync(Site, new[] { "IN_FIC1" }, null, "erin", default);
        var markerId = rows.Single().BundleId!.Value;
        // the batch endpoints, unchanged
        var api = RegionsApi("frank", "Supervisor");
        Body(await api.Approve(batch, Site, null, default)).GetProperty("approved").GetInt32().Should().Be(1);
        var deployed = Body(await api.Deploy(batch, Site, default));
        deployed.GetProperty("scheduled").GetInt32().Should().Be(1);
        var deploymentId = deployed.GetProperty("rows")[0].GetProperty("deploymentId").GetGuid();
        _publisher.Messages.Last().GetProperty("bundle").GetProperty("resolved").GetProperty("inherit").GetProperty("loop_id").GetString().Should().Be("IN_FIC1");
        var marker = (await _store.GetAsync(markerId, default))!;
        var d = await AckAllAsync(deploymentId, marker.ContentHash);
        d.State.Should().Be("ACTIVE_VERIFIED");
        d.ProbeResults!.Value.GetProperty("verifiedBy").GetString().Should().Be("ACK_WINDOW", "no result ever carries the marker's hash");

        (await LoopRowsAsync("IN_FIC1")).Should().Be(0);
        (await _store.GetAsync(own.BundleId, default))!.State.Should().Be("SUPERSEDED");
        (await _store.GetAsync(markerId, default))!.State.Should().Be("ACTIVE_VERIFIED");
        (await _store.ActiveForLoopAsync(Site, "IN_FIC1", Profile, default))!.BundleId.Should().Be(profile.BundleId);

        var region = (await _regions.CurrentAsync(Site, default)).Single(c => c.LoopId == "IN_FIC1");
        (region.Source, region.BundleId, region.RegionMin, region.RegionMax).Should().Be(("PROFILE", (Guid?)profile.BundleId, (double?)null, (double?)null));
        var summary = EffectiveSummary.Resolve(new[] { _registryStub.Loops["IN_FIC1"] },
            new Dictionary<string, IReadOnlyList<ConfigStore.ActiveRow>> { [Site] = await _store.ActiveAsync(Site, default) }).Single();
        (summary.ScopeKind, summary.BundleId).Should().Be(("PROFILE", (Guid?)profile.BundleId));
        (await _loopSettings.StaleAsync(Site, default)).Should().BeEmpty();

        var effective = Body(await ConfigApi().Effective("IN_FIC1", null, null, default));
        effective.GetProperty("bundle").GetProperty("scopeKind").GetString().Should().Be("PROFILE");
        effective.GetProperty("bundle").GetProperty("bundleId").GetGuid().Should().Be(profile.BundleId);
        effective.GetProperty("workers").EnumerateArray().Should().OnlyContain(w => w.GetProperty("runs").GetProperty("bundleId").GetGuid() == profile.BundleId,
            "a worker whose newest LOOP apply is the marker runs the PROFILE bundle");

        var batchRow = (await _batches.GetAsync(Site, batch, default)).Single();
        (batchRow.State, batchRow.DeploymentState, batchRow.Inherits).Should().Be(("ACTIVE_VERIFIED", "ACTIVE_VERIFIED", true));
        (await _deployments.IsCurrentAsync(d, default)).Should().BeFalse("no LOOP row names it");
        (await _deployments.RollbackTargetAsync(d, default)).Should().BeNull("nothing rolls back from a marker");
        (await _deployments.IsCurrentAsync(ownDeployment, default)).Should().BeFalse();
    }

    [Fact]
    public async Task Without_a_plant_wide_bundle_the_marker_holds_the_factory_layers_and_the_loop_runs_under_none()
    {
        await OwnRegionAsync("IN_FIC1", 10, 20);
        var (marker, _) = await InheritDeployedAsync("IN_FIC1");
        Kinds(marker).Should().Equal("FACTORY", "SITE", "PROFILE");
        (await LoopRowsAsync("IN_FIC1")).Should().Be(0);
        (await _regions.CurrentAsync(Site, default)).Single(c => c.LoopId == "IN_FIC1").Source.Should().Be("NONE");
        Body(await ConfigApi().Effective("IN_FIC1", null, null, default)).GetProperty("state").GetString().Should().Be("NO_ACTIVE_BUNDLE");
    }

    [Fact]
    public async Task A_later_region_edit_builds_on_the_plant_wide_base_and_a_restack_never_makes_a_marker()
    {
        await OwnRegionAsync("IN_FIC1", 10, 20);
        var profile = await ActiveProfileAsync(2.5);
        await InheritDeployedAsync("IN_FIC1");
        (await _loopSettings.RestackAsync(Site, null, null, "erin", default)).Rows.Should().BeEmpty("the loop has no own bundle to re-stack");

        var (_, rows) = await _regions.CreateAsync(new[] { new RegionBulkService.RegionRow("IN_FIC1", 30, 40) }, null, "erin", default);
        rows[0].Inherits.Should().BeFalse();
        (rows[0].PreviousMin, rows[0].PreviousMax).Should().Be(((double?)null, (double?)null), "it ran under the plant-wide settings");
        var draft = (await _store.GetAsync(rows[0].BundleId!.Value, default))!;
        draft.Inherits.Should().BeFalse();
        draft.Resolved.TryGetProperty("inherit", out _).Should().BeFalse();
        draft.ParentBundleId.Should().Be(profile.BundleId);
        Kinds(draft).Should().Equal("FACTORY", "SITE", "PROFILE", "LOOP");
        draft.Resolved.GetProperty("properties").GetProperty("G4.activity_warn_ratio").GetDouble().Should().Be(2.5);
        ConfigBatchService.RegionOf(draft.Resolved).Should().Be(((double?)30, (double?)40));
    }

    [Fact]
    public async Task Rolling_back_a_later_own_version_re_deploys_the_marker_and_drops_the_row_again()
    {
        await OwnRegionAsync("IN_FIC1", 10, 20);
        var profile = await ActiveProfileAsync(2.5);
        var (marker, _) = await InheritDeployedAsync("IN_FIC1");
        var v3 = await OwnRegionAsync("IN_FIC1", 30, 40);
        (await LoopRowsAsync("IN_FIC1")).Should().Be(1);
        (await _store.GetAsync(marker.BundleId, default))!.State.Should().Be("SUPERSEDED", "the marker no longer governs once an own version verifies");

        var d3 = (await _deployments.ListAsync(v3.BundleId, null, 1, default)).Single();
        (await _deployments.RollbackTargetAsync(d3, default))!.BundleId.Should().Be(marker.BundleId);
        var back = await _deployments.RollbackAsync(d3.DeploymentId, "frank", default);
        (back.BundleId, back.Kind).Should().Be((marker.BundleId, "ROLLBACK"));
        (await AckAllAsync(back.DeploymentId, marker.ContentHash)).State.Should().Be("ACTIVE_VERIFIED");

        (await LoopRowsAsync("IN_FIC1")).Should().Be(0);
        (await _store.GetAsync(marker.BundleId, default))!.State.Should().Be("ACTIVE_VERIFIED");
        (await _store.GetAsync(v3.BundleId, default))!.State.Should().Be("ROLLED_BACK");
        (await _deployments.GetAsync(d3.DeploymentId, default))!.State.Should().Be("ROLLED_BACK");
        (await _store.ActiveForLoopAsync(Site, "IN_FIC1", Profile, default))!.BundleId.Should().Be(profile.BundleId);
    }
}
