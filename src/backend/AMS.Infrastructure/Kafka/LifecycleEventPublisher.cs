using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AMS.Infrastructure.Kafka;

/// <summary>Append-only ACK lifecycle transitions → traverse.alarm.lifecycle-events topic.</summary>
public sealed class LifecycleEventPublisher
{
    private readonly AlarmEventProducer _producer;
    private readonly KafkaOptions _opts;
    private readonly ILogger<LifecycleEventPublisher> _logger;

    public LifecycleEventPublisher(
        AlarmEventProducer producer,
        IOptions<KafkaOptions> opts,
        ILogger<LifecycleEventPublisher> logger)
    {
        _producer = producer;
        _opts     = opts.Value;
        _logger   = logger;
    }

    public Task EmitAsync(
        AckCorrelationContext correlation,
        string alarmId,
        string partitionKey,
        string lifecycleState,
        string? detail = null,
        string? previousState = null,
        CancellationToken ct = default)
    {
        var lifecycleId = correlation.NewLifecycleId();
        var evt = new LifecycleEventMessage
        {
            SchemaVersion    = StreamSchemaVersion.Current,
            EventType        = lifecycleState,
            CommandId        = correlation.CommandId,
            CorrelationId    = correlation.CorrelationId,
            LifecycleId      = lifecycleId,
            DcsSequenceId    = correlation.DcsSequenceId,
            ActionId         = correlation.CommandId,
            EventId          = lifecycleId,
            AlarmId          = alarmId,
            LifecycleState   = lifecycleState,
            PreviousState    = previousState,
            Detail           = detail,
            TimestampEpochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };

        _logger.LogDebug(
            "Lifecycle {State} alarm={AlarmId} command={CommandId} correlation={CorrelationId} lifecycle={LifecycleId}",
            lifecycleState, alarmId, correlation.CommandId, correlation.CorrelationId, lifecycleId);

        return _producer.PublishAsync(_opts.LifecycleEventsTopic, partitionKey, evt, ct);
    }

    public Task EmitAsync(
        AckCorrelationContext correlation,
        string alarmId,
        string lifecycleState,
        string? detail = null,
        string? previousState = null,
        CancellationToken ct = default) =>
        EmitAsync(correlation, alarmId, alarmId, lifecycleState, detail, previousState, ct);

    /// <summary>Backward-compatible overload (maps actionId → commandId).</summary>
    public Task EmitAsync(
        string commandId,
        string alarmId,
        string lifecycleState,
        string? detail = null,
        string? previousState = null,
        CancellationToken ct = default) =>
        EmitAsync(AckCorrelationContext.FromCommand(commandId), alarmId, alarmId, lifecycleState, detail, previousState, ct);
}
