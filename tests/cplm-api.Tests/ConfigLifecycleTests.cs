// v2.5 Task 3B.3 (spec v6 §5.6; NR-047..055): the governed lifecycle against the lab database - a draft
// is requested changes on its own layer (If-Match), validation names fields, approval is independent
// and bound to the content hash (expires), a deployment is ACTIVE_VERIFIED only when every required
// worker ACKed PREPARE and APPLY with the hash on ONE jar (mixed jars never verify, NR-051), a
// rollback is a new deployment of the previously active bundle and old results stay (NR-054).
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

[Collection("instrument-bindings-lab")]
public sealed class ConfigLifecycleTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    private ConfigDeploymentService _deployments = null!;
    private ConfigDeploymentService _impatient = null!;
    private readonly FakePublisher _publisher = new();
    private readonly FakeAudit _audit = new();
    private const string Site = "e2e-config-site";
    private static readonly string[] Jobs = { "AMS - CPLM Short Feature Engine", "AMS - CPLM Long Diagnostics Engine", "AMS - CPLM Gate Fusion Engine" };

    private sealed class FakePublisher : IGateConfigPublisher
    {
        public List<(string Key, JsonElement Message)> Sent { get; } = new();
        public Task PublishAsync(string bundleId, string message, CancellationToken ct) { Sent.Add((bundleId, JsonDocument.Parse(message).RootElement.Clone())); return Task.CompletedTask; }
    }

    private sealed class FakeAudit : ICplmAuditEmitter
    {
        public List<(string Type, string Actor, string Entity)> Events { get; } = new();
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) => Events.Add((eventType, userId, entityId));
    }

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new ConfigStore(_db);
        // a realistic ACK window (workers answer within minutes) and an immediate probe (no pinned result needed once every APPLY ACK is in)
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:ServiceKey"] = "test-key", ["Cpm:ConfigAckWindowMinutes"] = "5", ["Cpm:ConfigProbeWindowMinutes"] = "0" }).Build();
        _deployments = new ConfigDeploymentService(_db, _store, _publisher, _audit, config, NullLogger<ConfigDeploymentService>.Instance);
        var impatient = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:ServiceKey"] = "test-key", ["Cpm:ConfigAckWindowMinutes"] = "0", ["Cpm:ConfigProbeWindowMinutes"] = "0" }).Build();
        _impatient = new ConfigDeploymentService(_db, _store, _publisher, _audit, impatient, NullLogger<ConfigDeploymentService>.Instance);
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        foreach (var job in Jobs)
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.config_worker_capability (job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids, unsupported, execution_plan_capacity, payload, announced_at_ms)
                VALUES (@job, 'jar-A', 'abc', @catalogue, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1)
                ON CONFLICT (job_name) DO UPDATE SET jar_sha256 = 'jar-A', catalogue_hash = EXCLUDED.catalogue_hash, announced_at_ms = 1
                """, new { job, catalogue = PropertyCatalogue.Current.CatalogueHash });
        }
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        await _db.DisposeAsync();
    }

    private static Task<int> Cleanup(NpgsqlConnection conn) => conn.ExecuteAsync("""
        DELETE FROM cpm.config_active WHERE site = @site;
        DELETE FROM cpm.config_deployment WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.gate_config_bundle WHERE site = @site
        """, new { site = Site });

    private async Task<BundleView> ApprovedDraftAsync(double warnRatio, string author = "alice", string approver = "bob")
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", "FIC10302", null, "FLOW_FAST_SELF_REG", author, null, default);
        d.State.Should().Be("DRAFT");
        d.Layers.EnumerateArray().Select(l => l.GetProperty("kind").GetString()).Should().Equal("FACTORY", "SITE", "PROFILE", "LOOP");
        d = await _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse(warnRatio.ToString(System.Globalization.CultureInfo.InvariantCulture)).RootElement) }, author, default);
        d = await _store.ValidateAsync(d.BundleId, default);
        d.State.Should().Be("VALIDATED", d.Validation?.GetRawText());
        return await _store.ApproveAsync(d.BundleId, approver, "Supervisor", "ok", TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
    }

    private async Task AckAllAsync(Guid deploymentId, string phase, string hash, string jar = "jar-A")
    {
        foreach (var job in Jobs) await _deployments.RecordAckAsync(deploymentId, job, 0, phase, "ACK", hash, jar, "abc", "gen-1", null, default);
    }

    [Fact]
    public async Task Nr047_a_draft_edit_keeps_the_factory_values_and_is_promoted_by_the_classifier()
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", "FIC10302", null, "FLOW_FAST_SELF_REG", "alice", "first", default);
        var props = d.Resolved.GetProperty("properties");
        props.GetProperty("G4.activity_high_ratio").GetDouble().Should().Be(8.0, because: "the factory layer restates the pack");
        props.GetProperty("G5.period_min_s").GetDouble().Should().BeGreaterThan(0);
        d.Resolved.GetProperty("sources").GetProperty("G5.period_min_s").GetString().Should().Be("PROFILE");
        var edited = await _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", "G2.stability_band_pv_eu", JsonDocument.Parse("0.7").RootElement) }, "alice", default);
        edited.Resolved.GetProperty("properties").GetProperty("G2.stability_band_pv_eu").GetDouble().Should().Be(0.7);
        edited.Resolved.GetProperty("properties").GetProperty("G4.activity_high_ratio").GetDouble().Should().Be(8.0);
        edited.ChangeClass.Should().Be("STATE_BOUNDARY", because: "the band feeds the event detector's threshold");
        edited.ContentHash.Should().NotBe(d.ContentHash);
        edited.Etag.Should().NotBe(d.Etag);
        // stale etag -> 409; unknown field -> named; NR-048
        var stale = async () => await _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse("4").RootElement) }, "alice", default);
        await stale.Should().ThrowAsync<ConfigConflictException>();
        var unknown = async () => await _store.PatchAsync(d.BundleId, edited.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratioo", JsonDocument.Parse("4").RootElement) }, "alice", default);
        (await unknown.Should().ThrowAsync<ArgumentException>()).WithMessage("*G4.activity_warn_ratioo*");
        // reset removes the loop override: back to the pack's value
        var reset = await _store.PatchAsync(d.BundleId, edited.Etag, new[] { new ConfigStore.PatchOp("reset", "G2.stability_band_pv_eu", null) }, "alice", default);
        reset.Resolved.GetProperty("sources").GetProperty("G2.stability_band_pv_eu").GetString().Should().NotBe("LOOP");
    }

    [Fact]
    public async Task Nr049_validation_rejects_a_bad_value_naming_the_field_and_the_state_is_rejected()
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", "FIC10302", null, "FLOW_FAST_SELF_REG", "alice", null, default);
        d = await _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", "G6.overlap_fraction", JsonDocument.Parse("50").RootElement) }, "alice", default);
        d = await _store.ValidateAsync(d.BundleId, default);
        d.State.Should().Be("REJECTED");
        d.Validation!.Value.GetProperty("errors").EnumerateArray().Select(e => e.GetString()).Should().Contain(e => e!.Contains("G6.overlap_fraction") && e.Contains("fraction"));
        var approve = async () => await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", null, TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
        await approve.Should().ThrowAsync<ConfigStateException>();
    }

    [Fact]
    public async Task Self_approval_is_refused_and_an_expired_approval_cannot_deploy()
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", "FIC10302", null, "FLOW_FAST_SELF_REG", "alice", null, default);
        d = await _store.ValidateAsync(d.BundleId, default);
        var self = async () => await _store.ApproveAsync(d.BundleId, "alice", "Supervisor", null, TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
        await self.Should().ThrowAsync<ConfigForbiddenException>();
        var authority = async () => await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", null, TimeSpan.FromHours(1), true, new[] { "Supervisor" }, default);
        (await authority.Should().ThrowAsync<ConfigForbiddenException>()).WithMessage("*ControlAuthority*");
        var expired = await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", null, TimeSpan.FromHours(-1), false, new[] { "Supervisor" }, default);
        expired.State.Should().Be("APPROVED");
        var deploy = async () => await _deployments.CreateAsync(d.BundleId, "ACTIVATE", null, null, "carol", default);
        (await deploy.Should().ThrowAsync<ConfigConflictException>()).WithMessage("*expired*");
    }

    [Fact]
    public async Task The_happy_path_prepare_apply_probe_reaches_active_verified_and_a_rollback_restores_the_previous_bundle()
    {
        var first = await ApprovedDraftAsync(4.5);
        var dep1 = await _deployments.CreateAsync(first.BundleId, "ACTIVATE", null, null, "carol", default);
        dep1.State.Should().Be("PREPARING");
        _publisher.Sent.Should().ContainSingle(m => m.Message.GetProperty("phase").GetString() == "PREPARE" && m.Message.GetProperty("hash").GetString() == first.ContentHash);
        _publisher.Sent[0].Message.GetProperty("signature").GetString().Should().MatchRegex("^[0-9a-f]{64}$");
        _publisher.Sent[0].Message.GetProperty("bundle").GetProperty("resolved").GetProperty("properties").GetProperty("G4.activity_warn_ratio").GetDouble().Should().Be(4.5);
        // one PREPARE ACK of three: still PREPARING within the window; once the window has passed with the matrix incomplete it is PARTIALLY_ACKNOWLEDGED (never "pending" for ever)
        await _deployments.RecordAckAsync(dep1.DeploymentId, Jobs[0], 0, "PREPARE", "ACK", first.ContentHash, "jar-A", null, null, null, default);
        (await _deployments.GetAsync(dep1.DeploymentId, default))!.State.Should().Be("PREPARING");
        (await _impatient.AdvanceAsync(dep1.DeploymentId, default))!.State.Should().Be("PARTIALLY_ACKNOWLEDGED");
        // a NEW deployment is the honest path once a matrix went partial
        var dep1b = await _deployments.CreateAsync(first.BundleId, "ACTIVATE", null, null, "carol", default);
        await AckAllAsync(dep1b.DeploymentId, "PREPARE", first.ContentHash);
        var afterPrepare = (await _deployments.GetAsync(dep1b.DeploymentId, default))!;
        afterPrepare.State.Should().Be("APPLYING");
        _publisher.Sent.Last().Message.GetProperty("phase").GetString().Should().Be("APPLY");
        await AckAllAsync(dep1b.DeploymentId, "APPLY", first.ContentHash);
        var verified = (await _deployments.GetAsync(dep1b.DeploymentId, default))!;
        verified.State.Should().Be("ACTIVE_VERIFIED");
        (await _store.GetAsync(first.BundleId, default))!.State.Should().Be("ACTIVE_VERIFIED");
        (await _store.ActiveForLoopAsync(Site, "FIC10302", "FLOW_FAST_SELF_REG", default))!.BundleId.Should().Be(first.BundleId);
        _audit.Events.Should().Contain(e => e.Type == "CONFIG_ACTIVE_VERIFIED");

        // a second bundle supersedes the first
        var second = await ApprovedDraftAsync(6.0);
        var dep2 = await _deployments.CreateAsync(second.BundleId, "ACTIVATE", null, null, "carol", default);
        await AckAllAsync(dep2.DeploymentId, "PREPARE", second.ContentHash);
        await AckAllAsync(dep2.DeploymentId, "APPLY", second.ContentHash);
        (await _deployments.GetAsync(dep2.DeploymentId, default))!.State.Should().Be("ACTIVE_VERIFIED");
        (await _store.GetAsync(first.BundleId, default))!.State.Should().Be("SUPERSEDED");

        // NR-054: rollback = a new deployment of the previous bundle; history retained
        var rb = await _deployments.RollbackAsync(dep2.DeploymentId, "carol", default);
        rb.Kind.Should().Be("ROLLBACK");
        rb.BundleId.Should().Be(first.BundleId);
        await AckAllAsync(rb.DeploymentId, "PREPARE", first.ContentHash);
        await AckAllAsync(rb.DeploymentId, "APPLY", first.ContentHash);
        (await _deployments.GetAsync(rb.DeploymentId, default))!.State.Should().Be("ACTIVE_VERIFIED");
        (await _deployments.GetAsync(dep2.DeploymentId, default))!.State.Should().Be("ROLLED_BACK");
        (await _store.ActiveForLoopAsync(Site, "FIC10302", "FLOW_FAST_SELF_REG", default))!.BundleId.Should().Be(first.BundleId);
        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM cpm.config_deployment WHERE bundle_id IN (@a, @b)", new { a = first.BundleId, b = second.BundleId })).Should().Be(4, because: "every deployment stays in history");
    }

    [Fact]
    public async Task Nr051_mixed_jar_hashes_or_a_nack_never_verify()
    {
        var b = await ApprovedDraftAsync(5.0);
        var dep = await _deployments.CreateAsync(b.BundleId, "ACTIVATE", null, null, "carol", default);
        await _deployments.RecordAckAsync(dep.DeploymentId, Jobs[0], 0, "PREPARE", "ACK", b.ContentHash, "jar-A", null, null, null, default);
        await _deployments.RecordAckAsync(dep.DeploymentId, Jobs[1], 0, "PREPARE", "ACK", b.ContentHash, "jar-B", null, null, null, default);
        await _deployments.RecordAckAsync(dep.DeploymentId, Jobs[2], 0, "PREPARE", "ACK", b.ContentHash, "jar-A", null, null, null, default);
        var d = (await _deployments.GetAsync(dep.DeploymentId, default))!;
        d.State.Should().Be("ACTIVATION_FAILED");
        d.Error.Should().Contain("mixed jars");
        _audit.Events.Should().Contain(e => e.Type == "CONFIG_REJECTED");

        var b2 = await ApprovedDraftAsync(5.5);
        var dep2 = await _deployments.CreateAsync(b2.BundleId, "ACTIVATE", null, null, "carol", default);
        await _deployments.RecordAckAsync(dep2.DeploymentId, Jobs[0], 0, "PREPARE", "NACK", b2.ContentHash, "jar-A", null, null, "UNKNOWN_PROPERTY G4.activity_warn_ratio", default);
        (await _deployments.GetAsync(dep2.DeploymentId, default))!.State.Should().Be("ACTIVATION_FAILED");
        (await _store.GetAsync(b2.BundleId, default))!.State.Should().Be("ACTIVATION_FAILED");
    }
}
