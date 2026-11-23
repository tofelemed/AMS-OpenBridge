// Worker-runs lookup (retest issue 2): the answer is the bundle of the newest deployment a worker acknowledged, whatever order the ACKs arrived in.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class WorkerRunsOrderTests : IAsyncLifetime
{
    private const string Site = "e2e-runs-site";
    private const string Job = "AMS - CPLM Short Feature Engine";
    private NpgsqlDataSource _db = null!;
    private ConfigStore _store = null!;
    private ConfigDeploymentService _deployments = null!;

    private sealed class Pub : IGateConfigPublisher
    {
        public Task PublishAsync(string bundleId, string message, CancellationToken ct) => Task.CompletedTask;
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
        _deployments = new ConfigDeploymentService(_db, _store, new Pub(), new NullAudit(), config, NullLogger<ConfigDeploymentService>.Instance);
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        await _db.DisposeAsync();
    }

    private static Task<int> Cleanup(NpgsqlConnection conn) => conn.ExecuteAsync("""
        DELETE FROM cpm.config_active WHERE site = @site;
        DELETE FROM cpm.config_worker_ack WHERE deployment_id IN (SELECT deployment_id FROM cpm.config_deployment WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site));
        DELETE FROM cpm.config_deployment WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.config_approval WHERE bundle_id IN (SELECT bundle_id FROM cpm.gate_config_bundle WHERE site = @site);
        DELETE FROM cpm.gate_config_bundle WHERE site = @site
        """, new { site = Site });

    private async Task<(BundleView Bundle, DeploymentView Dep)> ActiveAsync(double warnRatio)
    {
        var d = await _store.CreateDraftAsync(Site, "LOOP", "RUNS_FIC1", null, "FLOW_FAST_SELF_REG", "alice", null, default);
        d = await _store.PatchAsync(d.BundleId, d.Etag, new[] { new ConfigStore.PatchOp("set", "G4.activity_warn_ratio", JsonDocument.Parse(warnRatio.ToString(System.Globalization.CultureInfo.InvariantCulture)).RootElement) }, "alice", default);
        d = await _store.ValidateAsync(d.BundleId, default);
        var b = await _store.ApproveAsync(d.BundleId, "bob", "Supervisor", null, TimeSpan.FromHours(1), false, new[] { "Supervisor" }, default);
        var dep = await _deployments.CreateAsync(b.BundleId, "ACTIVATE", null, null, "carol", default);
        await _deployments.RecordAckAsync(dep.DeploymentId, Job, 0, "PREPARE", "ACK", b.ContentHash, "jar-A", "abc", "gen-1", null, default);
        await _deployments.RecordAckAsync(dep.DeploymentId, Job, 0, "APPLY", "ACK", b.ContentHash, "jar-A", "abc", "gen-1", null, default);
        return (b, dep);
    }

    [Fact]
    public async Task A_restarted_worker_re_acknowledging_an_old_deployment_does_not_make_it_the_one_that_runs()
    {
        var (v1, d1) = await ActiveAsync(2.1);
        await ActiveAsync(2.2);
        var (v3, _) = await ActiveAsync(2.3);
        // the worker restarts and replays the old deployments: the old APPLY ACKs now carry the newest received_at
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE cpm.config_worker_ack SET received_at = now() + interval '5 minutes' WHERE deployment_id = @id", new { id = d1.DeploymentId });

        var runs = await _deployments.WorkerRunsAsync(Site, "RUNS_FIC1", "FLOW_FAST_SELF_REG", default);

        runs[Job].BundleId.Should().Be(v3.BundleId, "the newest deployment the worker acknowledged wins, not the last ACK to arrive");
        runs[Job].BundleId.Should().NotBe(v1.BundleId);
    }
}
