using Confluent.Kafka;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.OnDemand;

namespace Traverse.CplmApi.BackgroundServices;

/// <summary>
/// CHG-102 Phase 5c — consumes the on-demand job's status topic (traverse.cpa.clpm.evaluation.status.v1) and moves the
/// EVALUATE analysis runs on: RUNNING, SUCCEEDED (stored FINISHED) or FAILED, the job's figures merged into the run's
/// manifest. Applying is idempotent and order-safe (EvaluationRunStore.ApplyStatusAsync), so a redelivery or a late
/// RUNNING changes nothing. Consumers instance only, own group (Cplm:OnDemand:ConsumerGroupId), one member. A minute
/// timer also fails runs nobody answered (Cplm:OnDemand:TimeoutMinutes).
/// </summary>
public sealed class EvaluationStatusConsumerService : BackgroundService
{
    private const string Name = "evaluation-status";
    private readonly ILogger<EvaluationStatusConsumerService> _logger;
    private readonly EvaluationRunStore _runs;
    private readonly EvaluationOptions _options;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    private readonly string _brokers;

    public EvaluationStatusConsumerService(ILogger<EvaluationStatusConsumerService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafka, IOptions<EvaluationOptions> options,
        ConsumerHeartbeat heartbeat, SingleMemberGuard guard, [FromKeyedServices("cplm")] NpgsqlDataSource db)
    {
        _logger = logger;
        _options = options.Value;
        _heartbeat = heartbeat;
        _guard = guard;
        _brokers = kafka.Value.BootstrapServers;
        _runs = new EvaluationRunStore(db);
    }

    /// <summary>One record (tests call it). False = skipped (not ours, or a state that may not follow the stored one).</summary>
    public async Task<bool> ApplyAsync(string json, CancellationToken ct)
    {
        var status = EvaluationStatus.Parse(json);
        if (status is null)
        {
            _logger.LogWarning("Skipping an unreadable evaluation status record: {Snippet}", json.Length <= 160 ? json : json[..160] + "…");
            return false;
        }
        var applied = await _runs.ApplyStatusAsync(status, ct);
        if (applied && status.State is "SUCCEEDED" or "FAILED")
            _logger.LogInformation("Evaluation {Run} {State} ({Samples} samples, {Artifacts} artifacts, {Elapsed} ms){Error}",
                status.AnalysisRunId, status.State, status.Samples, status.Artifacts, status.ElapsedMs,
                status.Error is null ? "" : ": " + status.Error);
        return applied;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!_options.Enabled) { _logger.LogInformation("On-demand evaluation disabled by Cplm:OnDemand:Enabled"); return; }
        using var consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = _brokers,
            GroupId = _options.ConsumerGroupId,
            GroupInstanceId = _options.ConsumerGroupId + "-sole",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false,
            // the status topic may not exist yet on a cluster the job has never started on
            AllowAutoCreateTopics = false,
        }).SetPartitionsAssignedHandler((_, parts) => _guard.VerifySoleMembership(Name, parts)).Build();
        consumer.Subscribe(_options.StatusTopic);
        _logger.LogInformation("EvaluationStatusConsumerService subscribed to {Topic} (group {Group})", _options.StatusTopic, _options.ConsumerGroupId);
        var lastSweep = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(Name, "CONSUMING");
            try
            {
                var result = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is not null)
                {
                    if (!string.IsNullOrWhiteSpace(result.Message.Value)) await ApplyAsync(result.Message.Value, stoppingToken);
                    consumer.StoreOffset(result);
                }
                if (DateTimeOffset.UtcNow - lastSweep > TimeSpan.FromMinutes(1))
                {
                    lastSweep = DateTimeOffset.UtcNow;
                    var expired = await _runs.ExpireStaleAsync(_options.TimeoutMinutes, null, stoppingToken);
                    if (expired > 0)
                        _logger.LogWarning("{Count} evaluation run(s) had no answer from the on-demand job within {Minutes} min - FAILED {Code}",
                            expired, _options.TimeoutMinutes, EvaluationStates.NoResponse);
                }
            }
            catch (ConsumeException ex) when (ex.Error.Code == ErrorCode.UnknownTopicOrPart)
            {
                // not created yet (no job has run): wait for it instead of logging a stack per poll
                try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch (OperationCanceledException) { break; }
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in EvaluationStatusConsumerService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error applying an evaluation status record; offset not stored");
                try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); } catch (OperationCanceledException) { break; }
            }
        }
        consumer.Close();
    }
}
