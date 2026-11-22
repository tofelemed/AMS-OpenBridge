// CHG-108: operating regions for many loops at once - one governed LOOP draft per loop, batch approval and deployment, update /
// clear, a draft built on the bundle the loop runs under, and the current-regions table. Against the lab database.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class RegionBulkServiceTests : IAsyncLifetime
{
    private const string Site = "e2e-region-site";
    private static readonly string[] Jobs = { "AMS - CPLM Short Feature Engine", "AMS - CPLM Response Engine" };
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    private RegionBulkService _svc = null!;
    private ConfigBatchService _batches = null!;
    private LoopSettingsService _loopSettings = null!;
    private RegistryStub _registry = null!;
    private List<dynamic> _capabilities = new();

    private sealed class NullPublisher : IGateConfigPublisher
    {
        public Task PublishAsync(string bundleId, string message, CancellationToken ct) => Task.CompletedTask;
    }

    private sealed class NullAudit : ICplmAuditEmitter
    {
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) { }
    }

    private static CpmLoopDto Loop(string id, string type, bool active = true, double? pvMin = null, double? pvMax = null) =>
        new(id, null, id, Site, null, null, type, "LOW", active, true, new Dictionary<string, string>(), Array.Empty<string>(),
            Array.Empty<CpmLoopLinkDto>(), false, null, pvMin is null ? null : new CpmEngineeringRange(PvMin: pvMin, PvMax: pvMax));

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new ConfigStore(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:ServiceKey"] = "test-key" }).Build();
        var deployments = new ConfigDeploymentService(_db, _store, new NullPublisher(), new NullAudit(), config, NullLogger<ConfigDeploymentService>.Instance);
        var (registry, stub) = RegistryStub.Create();
        _registry = stub;
        _registry.Loops["RG_FIC1"] = Loop("RG_FIC1", "FIC", pvMin: 0, pvMax: 100);
        _registry.Loops["RG_LIC1"] = Loop("RG_LIC1", "LIC");
        _registry.Loops["RG_OLD"] = Loop("RG_OLD", "FIC", active: false);
        _svc = new RegionBulkService(_store, registry, new NullAudit());
        _batches = new ConfigBatchService(_store, deployments, new NullAudit());
        _loopSettings = new LoopSettingsService(_store, registry, new NullAudit());
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        // the deployment needs announced workers; the shared lab table is snapshotted and restored (as ConfigLifecycleTests does)
        _capabilities = (await conn.QueryAsync("SELECT job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids::text AS r, unsupported::text AS u, execution_plan_capacity::text AS e, payload::text AS p, announced_at_ms FROM cpm.config_worker_capability")).ToList();
        await conn.ExecuteAsync("DELETE FROM cpm.config_worker_capability");
        foreach (var job in Jobs)
            await conn.ExecuteAsync("""
                INSERT INTO cpm.config_worker_capability (job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids, unsupported, execution_plan_capacity, payload, announced_at_ms)
                VALUES (@job, 'jar-A', 'abc', @catalogue, '["G2r.pv_region_min","G2r.pv_region_max"]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1)
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
        DELETE FROM cpm.config_deployment WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.config_approval WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.gate_config_bundle WHERE site = @site
        """, new { site = Site });

    /// <summary>Marks a bundle as the active one of its scope (what a verified deployment leaves behind).</summary>
    private async Task ActivateAsync(BundleView b)
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE cpm.gate_config_bundle SET state = 'ACTIVE_VERIFIED' WHERE bundle_id = @id", new { id = b.BundleId });
        await conn.ExecuteAsync("""
            INSERT INTO cpm.config_active (site, scope_kind, scope_ref, bundle_id, content_hash, since) VALUES (@site, @kind, @ref, @id, @hash, now())
            ON CONFLICT (site, scope_kind, scope_ref) DO UPDATE SET bundle_id = EXCLUDED.bundle_id, content_hash = EXCLUDED.content_hash, since = EXCLUDED.since
            """, new { site = Site, kind = b.ScopeKind, @ref = b.ScopeRef ?? "", id = b.BundleId, hash = b.ContentHash });
    }

    private static RegionBulkService.RegionRow R(string loop, double? min, double? max) => new(loop, min, max);

    [Fact]
    public async Task A_table_becomes_one_validated_loop_draft_per_good_row_and_an_error_for_each_bad_one()
    {
        var (batch, rows) = await _svc.CreateAsync(new[]
        {
            R("RG_FIC1", 10, 20), R("RG_LIC1", 5, 8), R("RG_OLD", 1, 2), R("NOPE", 1, 2), R("rg_fic1", 1, 2), R("RG_X", 5, 5), R("RG_Y", 5, null),
        }, "first regions", "alice", default);
        rows.Single(r => r.LoopId == "RG_FIC1").State.Should().Be("VALIDATED");
        rows.Single(r => r.LoopId == "RG_LIC1").State.Should().Be("VALIDATED");
        rows.Single(r => r.LoopId == "RG_OLD").Error.Should().Contain("retired");
        rows.Single(r => r.LoopId == "NOPE").Error.Should().Contain("not registered");
        rows.Single(r => r.LoopId == "rg_fic1").Error.Should().Contain("twice");
        rows.Single(r => r.LoopId == "RG_X").Error.Should().Contain("below");
        rows.Single(r => r.LoopId == "RG_Y").Error.Should().Contain("both bounds");

        var drafts = await _batches.GetAsync(Site, batch, default);
        drafts.Select(d => d.LoopId).Should().Equal("RG_FIC1", "RG_LIC1");
        drafts.Should().OnlyContain(d => d.CreatedBy == "alice", "the screen needs the author to offer the right Approve button");
        rows.Where(r => r.BundleId != null).Should().OnlyContain(r => r.CreatedBy == "alice");
        drafts[0].PvMin.Should().Be(10);
        drafts[0].PvMax.Should().Be(20);
        var b = (await _store.GetAsync(drafts[0].BundleId!.Value, default))!;
        b.ScopeKind.Should().Be("LOOP");
        b.Note.Should().StartWith(ConfigBatchService.Marker(batch, RegionBulkService.BatchKind)).And.EndWith("first regions");
        b.Validation!.Value.GetProperty("edited").EnumerateArray().Select(e => e.GetString())
            .Should().BeEquivalentTo(new[] { ConfigBatchService.MinProperty, ConfigBatchService.MaxProperty }, "only the region changes");
    }

    [Fact]
    public async Task The_batch_is_approved_by_someone_else_and_deployed_one_deployment_per_loop()
    {
        var (batch, _) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20), R("RG_LIC1", 5, 8) }, null, "alice", default);
        var self = await _batches.ApproveAsync(Site, batch, "alice", new[] { "Supervisor" }, null, TimeSpan.FromHours(1), default);
        self.Should().OnlyContain(r => r.Error != null && r.Error.Contains("self-approval"));

        var ok = await _batches.ApproveAsync(Site, batch, "bob", new[] { "Supervisor" }, "SME to confirm", TimeSpan.FromHours(1), default);
        ok.Should().OnlyContain(r => r.State == "APPROVED" && r.Error == null);

        var deployed = await _batches.DeployAsync(Site, batch, "bob", default);
        deployed.Should().HaveCount(2).And.OnlyContain(r => r.DeploymentId != null && r.Error == null);
        (await _batches.GetAsync(Site, batch, default)).Should().OnlyContain(r => r.DeploymentId != null && r.State == "SCHEDULED");
        (await _batches.DeployAsync(Site, batch, "bob", default)).Should().OnlyContain(r => r.Error != null, "a scheduled bundle is not deployed twice");
    }

    [Fact]
    public async Task An_update_builds_on_the_active_loop_bundle_and_an_empty_row_clears_the_region()
    {
        var (b1, r1) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20) }, null, "alice", default);
        await ActivateAsync((await _store.GetAsync(r1[0].BundleId!.Value, default))!);

        var (_, r2) = await _svc.CreateAsync(new[] { R("RG_FIC1", 12, 22) }, "widened", "alice", default);
        r2[0].PreviousMin.Should().Be(10);
        r2[0].PreviousMax.Should().Be(20);
        var v2 = (await _store.GetAsync(r2[0].BundleId!.Value, default))!;
        v2.ParentBundleId.Should().Be(r1[0].BundleId);
        v2.Version.Should().Be(r1[0].Version + 1);

        var (_, r3) = await _svc.CreateAsync(new[] { R("RG_FIC1", null, null) }, "cleared", "alice", default);
        r3[0].State.Should().Be("VALIDATED");
        var v3 = (await _store.GetAsync(r3[0].BundleId!.Value, default))!;
        ConfigBatchService.RegionOf(v3.Resolved).Should().Be(((double?)null, (double?)null));
    }

    [Fact]
    public async Task A_loop_under_an_active_profile_bundle_keeps_that_content_and_only_gains_the_region()
    {
        var profile = await _store.CreateDraftAsync(Site, "PROFILE", "FLOW_FAST_SELF_REG", null, null, "alice", null, default);
        profile = await _store.PatchAsync(profile.BundleId, profile.Etag,
            new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse("2.5").RootElement) }, "alice", default);
        await ActivateAsync(profile);

        var (_, rows) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20) }, null, "alice", default);
        var draft = (await _store.GetAsync(rows[0].BundleId!.Value, default))!;
        draft.ParentBundleId.Should().Be(profile.BundleId);
        draft.Layers.EnumerateArray().Select(l => l.GetProperty("kind").GetString()).Should().EndWith("LOOP");
        var props = draft.Resolved.GetProperty("properties");
        props.GetProperty("G4.activity_warn_ratio").GetDouble().Should().Be(2.5, "the plant-profile edit is kept");
        props.GetProperty(ConfigBatchService.MinProperty).GetDouble().Should().Be(10);
    }

    [Fact]
    public async Task The_current_table_shows_each_active_loop_with_its_range_and_region()
    {
        var (_, r1) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20) }, null, "alice", default);
        await ActivateAsync((await _store.GetAsync(r1[0].BundleId!.Value, default))!);
        var now = await _svc.CurrentAsync(Site, default);
        now.Select(c => c.LoopId).Should().Equal("RG_FIC1", "RG_LIC1");
        var fic = now[0];
        fic.RegionMin.Should().Be(10);
        fic.RegionMax.Should().Be(20);
        fic.Source.Should().Be("LOOP");
        fic.PvRangeMin.Should().Be(0);
        fic.PvRangeMax.Should().Be(100);
        (now[1].RegionMin, now[1].Source).Should().Be(((double?)null, "NONE"));
    }

    // ── re-stack: a plant-wide change reaches the loops that have their own settings ──

    private async Task<BundleView> ActiveProfileAsync(double warnRatio)
    {
        var profile = await _store.CreateDraftAsync(Site, "PROFILE", "FLOW_FAST_SELF_REG", null, null, "alice", null, default);
        profile = await _store.PatchAsync(profile.BundleId, profile.Etag,
            new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse(warnRatio.ToString(System.Globalization.CultureInfo.InvariantCulture)).RootElement) }, "alice", default);
        await ActivateAsync(profile);
        return profile;
    }

    [Fact]
    public async Task A_new_plant_wide_profile_makes_a_loop_with_its_own_region_stale_and_the_restack_keeps_both()
    {
        var (_, r1) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20) }, null, "alice", default);
        var own = (await _store.GetAsync(r1[0].BundleId!.Value, default))!;
        await ActivateAsync(own);
        (await _loopSettings.StaleAsync(Site, default)).Should().BeEmpty("the loop's bundle sits on the factory base it would run under");

        var profile = await ActiveProfileAsync(2.5);
        var stale = await _loopSettings.StaleAsync(Site, default);
        stale.Should().ContainSingle();
        stale[0].LoopId.Should().Be("RG_FIC1");
        stale[0].Base.Should().Be("PROFILE");
        stale[0].BaseBundleId.Should().Be(profile.BundleId);
        stale[0].OwnProperties.Should().BeEquivalentTo(new[] { ConfigBatchService.MinProperty, ConfigBatchService.MaxProperty });

        var (batch, rows) = await _loopSettings.RestackAsync(Site, null, "profile v1", "alice", default);
        rows.Should().ContainSingle(r => r.LoopId == "RG_FIC1" && r.State == "VALIDATED");
        var draft = (await _store.GetAsync(rows[0].BundleId!.Value, default))!;
        draft.ParentBundleId.Should().Be(own.BundleId);
        draft.Note.Should().StartWith(ConfigBatchService.Marker(batch, LoopSettingsService.BatchKind));
        var props = draft.Resolved.GetProperty("properties");
        props.GetProperty("G4.activity_warn_ratio").GetDouble().Should().Be(2.5, "the plant-wide change reaches the loop");
        props.GetProperty(ConfigBatchService.MinProperty).GetDouble().Should().Be(10, "the loop's own region is kept");
        props.GetProperty(ConfigBatchService.MaxProperty).GetDouble().Should().Be(20);

        await ActivateAsync(draft);
        (await _loopSettings.StaleAsync(Site, default)).Should().BeEmpty("once deployed, the loop sits on the current plant-wide base");
    }

    [Fact]
    public async Task A_restack_can_name_the_loops_and_a_loop_without_own_settings_is_never_stale()
    {
        var (_, r1) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20), R("RG_LIC1", 5, 8) }, null, "alice", default);
        foreach (var r in r1) await ActivateAsync((await _store.GetAsync(r.BundleId!.Value, default))!);
        await ActiveProfileAsync(4.5);   // a FLOW profile: only the flow loop's base changed (3.0 = the pack's own value, no change)
        var stale = await _loopSettings.StaleAsync(Site, default);
        stale.Select(s => s.LoopId).Should().Equal("RG_FIC1");
        var (_, none) = await _loopSettings.RestackAsync(Site, new[] { "RG_LIC1" }, null, "alice", default);
        none.Should().BeEmpty("RG_LIC1 is not stale");
    }

    // owner, 22 Nov: two people approve a region change, but an Admin or SuperAdmin may approve their own
    [Fact]
    public async Task An_admin_or_superadmin_may_approve_their_own_batch_and_it_is_recorded_as_a_self_approval()
    {
        var (batch, _) = await _svc.CreateAsync(new[] { R("RG_FIC1", 10, 20) }, null, "carol", default);
        (await _batches.ApproveAsync(Site, batch, "carol", new[] { "Engineer" }, null, TimeSpan.FromHours(1), default))
            .Should().OnlyContain(r => r.Error != null && r.Error.Contains("self-approval"), "an Engineer needs a second person");

        var ok = await _batches.ApproveAsync(Site, batch, "carol", new[] { "Engineer", "Admin" }, "urgent", TimeSpan.FromHours(1), default);
        ok.Should().OnlyContain(r => r.State == "APPROVED" && r.Error == null);
        await using var conn = await _db.OpenConnectionAsync();
        var a = await conn.QueryFirstAsync("SELECT approver, role, note FROM cpm.config_approval WHERE bundle_id = @id", new { id = ok[0].BundleId });
        ((string)a.approver).Should().Be("carol");
        ((string)a.role).Should().Be("Admin");
        ((string)a.note).Should().Be("[self-approved as Admin] urgent");

        var (b2, _) = await _svc.CreateAsync(new[] { R("RG_LIC1", 5, 8) }, null, "dave", default);
        (await _batches.ApproveAsync(Site, b2, "dave", new[] { "SuperAdmin" }, null, TimeSpan.FromHours(1), default))
            .Should().OnlyContain(r => r.State == "APPROVED" && r.Error == null);
    }
}
