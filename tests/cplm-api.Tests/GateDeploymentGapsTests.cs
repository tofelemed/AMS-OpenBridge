// Gate Configuration gaps 1, 2a, 2b, 4, 7, 9 (owner, 23 Nov: all gaps in this release), against the lab database.
using System.Reflection;
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
public sealed class GateDeploymentGapsTests : IAsyncLifetime
{
    private const string Site = "e2e-gaps-site";
    private static readonly string[] Jobs = { "AMS - CPLM Short Feature Engine", "AMS - CPLM Response Engine" };
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    private ConfigDeploymentService _deployments = null!;
    private readonly FakePublisher _publisher = new();
    private List<dynamic> _capabilities = new();

    private sealed class FakePublisher : IGateConfigPublisher
    {
        public bool Fail { get; set; }
        public List<string> Phases { get; } = new();
        public Task PublishAsync(string bundleId, string message, CancellationToken ct)
        {
            if (Fail) throw new InvalidOperationException("kafka down");
            Phases.Add(JsonDocument.Parse(message).RootElement.GetProperty("phase").GetString()!);
            return Task.CompletedTask;
        }
    }

    private sealed class NullAudit : ICplmAuditEmitter
    {
        public void Emit(string eventType, string userId, string entityType, string entityId, object? after = null) { }
    }

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new ConfigStore(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Auth:ServiceKey"] = "test-key", ["Cpm:ConfigAckWindowMinutes"] = "5", ["Cpm:ConfigProbeWindowMinutes"] = "0" }).Build();
        _deployments = new ConfigDeploymentService(_db, _store, _publisher, new NullAudit(), config, NullLogger<ConfigDeploymentService>.Instance);
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        _capabilities = (await conn.QueryAsync("SELECT job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids::text AS r, unsupported::text AS u, execution_plan_capacity::text AS e, payload::text AS p, announced_at_ms FROM cpm.config_worker_capability")).ToList();
        await conn.ExecuteAsync("DELETE FROM cpm.config_worker_capability");
        foreach (var job in Jobs)
            await conn.ExecuteAsync("""
                INSERT INTO cpm.config_worker_capability (job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids, unsupported, execution_plan_capacity, payload, announced_at_ms)
                VALUES (@job, 'jar-A', 'abc', @catalogue, '["G4.activity_warn_ratio"]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1)
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

    private async Task<BundleView> ApprovedAsync(double warnRatio)
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", "GP_FIC1", null, "FLOW_FAST_SELF_REG", "alice", null, default);
        d = await _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse(warnRatio.ToString(System.Globalization.CultureInfo.InvariantCulture)).RootElement) }, "alice", default);
        d = await _store.ValidateAsync(d.BundleId, default);
        return await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", null, TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
    }

    private async Task AckAsync(Guid deploymentId, string hash, string phase, params string[] jobs)
    {
        foreach (var job in jobs) await _deployments.RecordAckAsync(deploymentId, job, 0, phase, "ACK", hash, "jar-A", "abc", "gen-1", null, default);
    }

    /// <summary>Deploys and lets every worker acknowledge PREPARE and APPLY: ACTIVE_VERIFIED (probe window 0).</summary>
    private async Task<DeploymentView> ActiveAsync(BundleView b)
    {
        var d = await _deployments.CreateAsync(b.BundleId, "ACTIVATE", null, null, "carol", default);
        await AckAsync(d.DeploymentId, b.ContentHash, "PREPARE", Jobs);
        await AckAsync(d.DeploymentId, b.ContentHash, "APPLY", Jobs);
        return (await _deployments.GetAsync(d.DeploymentId, default))!;
    }

    [Fact]
    public async Task Gap1_a_site_bundle_reads_the_loops_class_pack_under_its_own_edits()
    {
        var site = await _store.CreateDraftAsync(Site, "SITE", null, null, null, "alice", null, default);
        site = await _store.PatchAsync(site.BundleId, site.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse("2.75").RootElement) }, "alice", default);
        var factory = FactoryLayers.Factory();
        var pack = FactoryLayers.Profile("FLOW_FAST_SELF_REG")!.Value;
        var differing = pack.EnumerateObject().First(p => p.Name != "G4.activity_warn_ratio" && (!factory.TryGetProperty(p.Name, out var f) || f.GetRawText() != p.Value.GetRawText()));

        var r = LoopEffective.Resolve(site, "FLOW_FAST_SELF_REG");
        r.Properties[differing.Name].GetRawText().Should().Be(differing.Value.GetRawText(), "the engine lays the SITE bundle over the class pack");
        r.Sources[differing.Name].Should().Be("PROFILE");
        r.Properties["G4.activity_warn_ratio"].GetDouble().Should().Be(2.75);
        r.Sources["G4.activity_warn_ratio"].Should().Be("SITE");
        site.Resolved.GetProperty("sources").GetProperty(differing.Name).GetString().Should().BeOneOf(new[] { "FACTORY", "NO_VALUE" },
            "the bundle's own resolution, which the page used to show, never saw the class pack");
    }

    [Fact]
    public async Task Gap2a_a_partial_deployment_shows_which_bundle_each_worker_runs()
    {
        var b = await ApprovedAsync(2.5);
        var d = await _deployments.CreateAsync(b.BundleId, "ACTIVATE", null, null, "carol", default);
        await AckAsync(d.DeploymentId, b.ContentHash, "PREPARE", Jobs);
        await AckAsync(d.DeploymentId, b.ContentHash, "APPLY", Jobs[0]);            // only the first worker applied it
        var runs = await _deployments.WorkerRunsAsync(Site, "GP_FIC1", "FLOW_FAST_SELF_REG", default);
        runs[Jobs[0]].BundleId.Should().Be(b.BundleId);
        runs[Jobs[0]].ScopeKind.Should().Be("LOOP");
        runs.Should().NotContainKey(Jobs[1]);
        (await _store.ActiveForLoopAsync(Site, "GP_FIC1", "FLOW_FAST_SELF_REG", default)).Should().BeNull("config_active moves only at ACTIVE_VERIFIED");
    }

    [Fact]
    public async Task Gap2b_a_bundle_scheduled_for_later_is_not_verified_before_its_time()
    {
        var b = await ApprovedAsync(2.5);
        var d = await _deployments.CreateAsync(b.BundleId, "ACTIVATE", DateTimeOffset.UtcNow.AddHours(1), null, "carol", default);
        await AckAsync(d.DeploymentId, b.ContentHash, "PREPARE", Jobs);
        await AckAsync(d.DeploymentId, b.ContentHash, "APPLY", Jobs);
        (await _deployments.GetAsync(d.DeploymentId, default))!.State.Should().Be("PROBING", "the engine waits for the effective time");
    }

    [Fact]
    public async Task Gap4_rollback_only_from_the_current_deployment_to_the_version_before_it()
    {
        var v1 = await ActiveAsync(await ApprovedAsync(2.5));
        v1.State.Should().Be("ACTIVE_VERIFIED");
        (await _deployments.RollbackTargetAsync(v1, default)).Should().BeNull("the first version has nothing to roll back to");
        await FluentActions.Invoking(() => _deployments.RollbackAsync(v1.DeploymentId, "carol", default)).Should().ThrowAsync<ConfigStateException>();

        var v2 = await ActiveAsync(await ApprovedAsync(2.0));
        (await _deployments.IsCurrentAsync(v2, default)).Should().BeTrue();
        (await _deployments.IsCurrentAsync(v1, default)).Should().BeFalse("an older deployment keeps ACTIVE_VERIFIED but is not current");
        (await _deployments.RollbackTargetAsync(v1, default)).Should().BeNull("only the current deployment rolls back");
        (await _deployments.RollbackTargetAsync(v2, default))!.BundleId.Should().Be(v1.BundleId);

        var back = await _deployments.RollbackAsync(v2.DeploymentId, "carol", default);
        back.BundleId.Should().Be(v1.BundleId);
        (await _deployments.RollbackTargetAsync(v2, default)).Should().BeNull("a rollback of it is already running");
        await FluentActions.Invoking(() => _deployments.RollbackAsync(v2.DeploymentId, "carol", default)).Should().ThrowAsync<ConfigStateException>("a second click does not roll back one more version");
    }

    [Fact]
    public async Task Gap9_a_lost_prepare_is_sent_again_and_given_up_after_the_ack_window()
    {
        var b = await ApprovedAsync(2.5);
        _publisher.Fail = true;
        await FluentActions.Invoking(() => _deployments.CreateAsync(b.BundleId, "ACTIVATE", null, null, "carol", default)).Should().ThrowAsync<InvalidOperationException>();
        _publisher.Fail = false;
        await using var conn = await _db.OpenConnectionAsync();
        var id = await conn.ExecuteScalarAsync<Guid>("SELECT deployment_id FROM cpm.config_deployment WHERE bundle_id = @id", new { id = b.BundleId });
        (await _deployments.GetAsync(id, default))!.State.Should().Be("SCHEDULED");
        (await _deployments.OpenDeploymentIdsAsync(default)).Should().NotContain(id, "not yet a minute old");

        await conn.ExecuteAsync("UPDATE cpm.config_deployment SET updated_at = now() - interval '2 minutes' WHERE deployment_id = @id", new { id });
        (await _deployments.OpenDeploymentIdsAsync(default)).Should().Contain(id);
        (await _deployments.AdvanceAsync(id, default))!.State.Should().Be("PREPARING", "the PREPARE message is sent again");
        _publisher.Phases.Should().Contain("PREPARE");

        await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'SCHEDULED', updated_at = now() - interval '30 minutes' WHERE deployment_id = @id", new { id });
        var failed = await _deployments.AdvanceAsync(id, default);
        failed!.State.Should().Be("ACTIVATION_FAILED");
        failed.Error.Should().Contain("could not be reached");
    }

    [Fact]
    public async Task Gap7_the_comparison_refreshes_the_run_state_first()
    {
        var b = await ApprovedAsync(2.5);
        var runId = Guid.NewGuid();
        await _store.SetStateAsync(b.BundleId, b.State, default, null, JsonSerializer.Serialize(new { analysisRunId = runId, state = "RUNNING" }));
        var (recompute, stub) = RecomputeStub.Create();
        await new ShadowComparison(_db, _store, recompute).CompareAsync(b.BundleId, default);
        stub.Refreshed.Should().Contain(runId, "the run state is refreshed from Flink before the comparison reads it");
    }
}

/// <summary>An interface stub: GetAnalysisRunAsync records the run it was asked to refresh; every other member throws.</summary>
public class RecomputeStub : DispatchProxy
{
    public List<Guid> Refreshed { get; } = new();

    protected override object? Invoke(MethodInfo? m, object?[]? args)
    {
        if (m?.Name == nameof(ICplmRecomputeService.GetAnalysisRunAsync) && args?[0] is Guid id)
        {
            Refreshed.Add(id);
            var resultType = m.ReturnType.GetGenericArguments()[0];
            return typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(resultType).Invoke(null, new object?[] { null });
        }
        throw new NotSupportedException(m?.Name);
    }

    public static (ICplmRecomputeService Service, RecomputeStub Stub) Create()
    {
        var p = DispatchProxy.Create<ICplmRecomputeService, RecomputeStub>();
        return (p, (RecomputeStub)(object)p);
    }
}
