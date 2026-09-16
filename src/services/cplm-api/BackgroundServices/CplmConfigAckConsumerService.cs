using System.Text.Json;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// v2.5 Task 3B.3 / 3A.2: consumes traverse.cpa.context.gate-config.acks.v1 - CAPABILITY records
/// (what each running job can be configured with; newest per job kept) and the workers' PREPARE /
/// APPLY ACK / NACK records, which advance the deployment state machine. Own group, one member.
/// A 30 s timer also re-evaluates open deployments (probe, ACK window).
/// </summary>
public sealed class CplmConfigAckConsumerService : BackgroundService
{
    private const string Name = "config-acks";
    private readonly ILogger<CplmConfigAckConsumerService> _logger;
    private readonly NpgsqlDataSource _db;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    private readonly IServiceScopeFactory _scopes;

    public CplmConfigAckConsumerService(ILogger<CplmConfigAckConsumerService> logger, IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions, ConsumerHeartbeat heartbeat, SingleMemberGuard guard, IServiceScopeFactory scopes,
        [FromKeyedServices("cplm")] NpgsqlDataSource db)
    {
        _logger = logger; _db = db; _options = cplmOptions.Value; _heartbeat = heartbeat; _guard = guard; _scopes = scopes;
        _consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = _options.ConsumerGroupId + "-" + Name,
            GroupInstanceId = _options.ConsumerGroupId + "-" + Name + "-sole",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false,
        }).SetPartitionsAssignedHandler((_, parts) => _guard.VerifySoleMembership(Name, parts)).Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        _consumer.Subscribe(_options.GateConfigAcksTopic);
        _logger.LogInformation("CplmConfigAckConsumerService subscribed to {Topic}", _options.GateConfigAcksTopic);
        var lastSweep = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(Name, "CONSUMING");
            try
            {
                var result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is not null)
                {
                    if (!string.IsNullOrWhiteSpace(result.Message.Value)) await ApplyAsync(result.Message.Value, stoppingToken);
                    _consumer.StoreOffset(result);
                }
                if (DateTimeOffset.UtcNow - lastSweep > TimeSpan.FromSeconds(30))
                {
                    lastSweep = DateTimeOffset.UtcNow;
                    await SweepAsync(stoppingToken);
                }
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in CplmConfigAckConsumerService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying a gate-config ACK record; offset not stored");
                try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); } catch (OperationCanceledException) { break; }
            }
        }
        _consumer.Close();
    }

    /// <summary>Pure dispatch (tests call it): CAPABILITY → capability table; ACK / NACK → the deployment service.</summary>
    public async Task ApplyAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement.Clone(); }
        catch (JsonException) { _logger.LogWarning("Skipping unparseable gate-config ACK record: {Snippet}", json.Length <= 160 ? json : json[..160] + "…"); return; }
        var kind = root.TryGetProperty("record_kind", out var k) ? k.GetString() : null;
        if (kind == "CAPABILITY")
        {
            await using var conn = await _db.OpenConnectionAsync(ct);
            await conn.ExecuteAsync("""
                INSERT INTO cpm.config_worker_capability (job_name, jar_sha256, source_commit, catalogue_hash, readable_property_ids, unsupported, execution_plan_capacity, payload, announced_at_ms)
                VALUES (@job, @jar, @commit, @catalogue, @readable::jsonb, @unsupported::jsonb, @capacity::jsonb, @payload::jsonb, @announced)
                ON CONFLICT (job_name) DO UPDATE SET jar_sha256 = EXCLUDED.jar_sha256, source_commit = EXCLUDED.source_commit, catalogue_hash = EXCLUDED.catalogue_hash,
                    readable_property_ids = EXCLUDED.readable_property_ids, unsupported = EXCLUDED.unsupported, execution_plan_capacity = EXCLUDED.execution_plan_capacity,
                    payload = EXCLUDED.payload, announced_at_ms = EXCLUDED.announced_at_ms, received_at = now()
                WHERE EXCLUDED.announced_at_ms >= cpm.config_worker_capability.announced_at_ms
                """, new
            {
                job = root.GetProperty("job_name").GetString(), jar = S(root, "jar_sha256") ?? "unknown", commit = S(root, "source_commit"), catalogue = S(root, "catalogue_hash") ?? "",
                readable = root.TryGetProperty("readable_property_ids", out var r) ? r.GetRawText() : "[]", unsupported = root.TryGetProperty("unsupported_property_reasons", out var u) ? u.GetRawText() : "{}",
                capacity = root.TryGetProperty("execution_plan_capacity", out var c) ? c.GetRawText() : "{}", payload = root.GetRawText(),
                announced = root.TryGetProperty("emitted_at_ms", out var e) && e.ValueKind == JsonValueKind.Number ? e.GetInt64() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            });
            return;
        }
        if (kind == "ACK" || kind == "NACK")
        {
            if (!Guid.TryParse(S(root, "deployment_id"), out var deploymentId)) { _logger.LogWarning("gate-config {Kind} without a deployment_id ignored", kind); return; }
            using var scope = _scopes.CreateScope();
            var deployments = scope.ServiceProvider.GetRequiredService<ConfigDeploymentService>();
            await deployments.RecordAckAsync(deploymentId, S(root, "job_name") ?? "?", root.TryGetProperty("subtask_index", out var si) && si.ValueKind == JsonValueKind.Number ? si.GetInt32() : 0,
                S(root, "phase") ?? "PREPARE", kind, S(root, "bundle_hash") ?? "", S(root, "jar_sha256") ?? "unknown", S(root, "source_commit"), S(root, "topology_generation"), S(root, "reason"), ct);
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var deployments = scope.ServiceProvider.GetRequiredService<ConfigDeploymentService>();
        foreach (var id in await deployments.OpenDeploymentIdsAsync(ct))
        {
            try { await deployments.AdvanceAsync(id, ct); }
            catch (Exception ex) { _logger.LogWarning(ex, "Deployment {Id} could not be advanced", id); }
        }
    }

    private static string? S(JsonElement el, string name) => el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
