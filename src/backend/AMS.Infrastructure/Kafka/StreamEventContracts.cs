namespace AMS.Infrastructure.Kafka;

/// <summary>Current schema version for all Kafka stream contracts (increment before Flink migration).</summary>
public static class StreamSchemaVersion
{
    /// <summary>ACK / lifecycle stream contracts.</summary>
    public const int Current = 1;

    /// <summary>HTTP API traverse.alarm.raw-alarms envelope.</summary>
    public const int RawAlarms = 2;
}

/// <summary>Kafka event type discriminators (versioned contracts).</summary>
public static class StreamEventTypes
{
    public const string OperatorAckCommand     = "OPERATOR_ACK_COMMAND";
    public const string LifecycleTransition    = "LIFECYCLE_TRANSITION";
    public const string AckWritebackCommand    = "ACK_WRITEBACK_COMMAND";
    public const string AckResult              = "ACK_RESULT";
    public const string RawAlarmEvent          = "RAW_ALARM_EVENT";
    public const string AlarmStateUpsert       = "ALARM_STATE_UPSERT";
    /// <summary>Emitted by Flink when conditionActive=false — row must be deleted from alarm_current.</summary>
    public const string AlarmStateDelete       = "ALARM_STATE_DELETE";
    /// <summary>Emitted by Flink ACK confirmation — only updates ack fields, never conditionActive.</summary>
    public const string AckStateUpdate         = "ACK_STATE_UPDATE";
}

/// <summary>
/// End-to-end ACK trace identifiers (distributed tracing, replay, CEP lineage, audit).
/// </summary>
public sealed record AckCorrelationContext(
    string CommandId,
    string CorrelationId,
    string? DcsSequenceId = null)
{
    /// <summary>New lifecycleId per state transition event.</summary>
    public string NewLifecycleId() => Guid.NewGuid().ToString();

    public static AckCorrelationContext CreateNew() =>
        new(Guid.NewGuid().ToString(), Guid.NewGuid().ToString());

    public static AckCorrelationContext FromCommand(string commandId, string? correlationId = null) =>
        new(commandId, correlationId ?? commandId);

    public AckCorrelationContext WithDcsSequence(string dcsSequenceId) =>
        this with { DcsSequenceId = dcsSequenceId };
}

/// <summary>Shared envelope fields on every versioned Kafka payload.</summary>
public interface IVersionedStreamEvent
{
    int SchemaVersion { get; }
    string EventType { get; }
}

/// <summary>ACK-scoped correlation on versioned events.</summary>
public interface IAckCorrelatedEvent : IVersionedStreamEvent
{
    string CommandId { get; }
    string CorrelationId { get; }
    string? LifecycleId { get; }
    string? DcsSequenceId { get; }
}
