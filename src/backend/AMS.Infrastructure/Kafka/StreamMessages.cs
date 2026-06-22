namespace AMS.Infrastructure.Kafka;

/// <summary>Append-only lifecycle transition (replay log / observability).</summary>
public sealed record LifecycleEventMessage : IAckCorrelatedEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = StreamEventTypes.LifecycleTransition;

    public string CommandId { get; init; } = string.Empty;
    public string CorrelationId { get; init; } = string.Empty;
    public string LifecycleId { get; init; } = string.Empty;
    public string? DcsSequenceId { get; init; }

    /// <summary>Legacy alias — same as CommandId when deserializing older payloads.</summary>
    public string? ActionId { get; init; }

    public string EventId { get; init; } = string.Empty;
    public string AlarmId { get; init; } = string.Empty;
    public string LifecycleState { get; init; } = string.Empty;
    public string? PreviousState { get; init; }
    public string? Detail { get; init; }
    public long TimestampEpochMs { get; init; }

    public string ResolvedCommandId => !string.IsNullOrEmpty(CommandId) ? CommandId : ActionId ?? string.Empty;
    public string ResolvedCorrelationId => !string.IsNullOrEmpty(CorrelationId) ? CorrelationId : ResolvedCommandId;
}

/// <summary>Edge → stream: DCS writeback outcome.</summary>
public sealed record AckResultMessage : IAckCorrelatedEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = StreamEventTypes.AckResult;

    public string CommandId { get; init; } = string.Empty;
    public string CorrelationId { get; init; } = string.Empty;
    public string? LifecycleId { get; init; }
    public string? DcsSequenceId { get; init; }

    public string? ActionId { get; init; }
    public string AlarmId { get; init; } = string.Empty;
    public string ServerId { get; init; } = string.Empty;
    public string SourceName { get; init; } = string.Empty;
    public string? ConditionName { get; init; }
    public long ActiveTimeEpochMs { get; init; }
    public int CookieOffset { get; init; }
    public string ResultState { get; init; } = string.Empty;
    public string? ErrorMessage { get; init; }
    public long TimestampEpochMs { get; init; }

    public string ResolvedCommandId => !string.IsNullOrEmpty(CommandId) ? CommandId : ActionId ?? string.Empty;
}

/// <summary>Operator command (UI → operator-actions).</summary>
public sealed record OperatorActionMessage : IAckCorrelatedEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = StreamEventTypes.OperatorAckCommand;

    public string CommandId { get; init; } = string.Empty;
    public string CorrelationId { get; init; } = string.Empty;
    public string? LifecycleId { get; init; }
    public string? DcsSequenceId { get; init; }

    public string? ActionId { get; init; }
    public string AlarmId { get; init; } = string.Empty;
    /// <summary>Feed correlation id (e.g. BB26-BF402|Alarm high) for HTTP writeback.</summary>
    public string? SourceAlarmId { get; init; }
    public string? SourceEventId { get; init; }
    public string ActionType { get; init; } = string.Empty;
    public string UserId { get; init; } = string.Empty;
    public string Username { get; init; } = string.Empty;
    public string? Comment { get; init; }
    public long ActionTimeEpochMs { get; init; }
    public string ServerId { get; init; } = string.Empty;
    public string SourceName { get; init; } = string.Empty;
    public string? ConditionName { get; init; }
    public string? SubConditionName { get; init; }
    public long ActiveTimeEpochMs { get; init; }
    public long ActiveFileTime { get; init; }
    public int CookieOffset { get; init; }
    public string? OperatorStation { get; init; }

    public string ResolvedCommandId => !string.IsNullOrEmpty(CommandId) ? CommandId : ActionId ?? string.Empty;
    public string ResolvedCorrelationId => !string.IsNullOrEmpty(CorrelationId) ? CorrelationId : ResolvedCommandId;
}

/// <summary>Stream processor → edge DCS writeback orchestration.</summary>
public sealed record AckWritebackMessage : IAckCorrelatedEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = StreamEventTypes.AckWritebackCommand;

    public string CommandId { get; init; } = string.Empty;
    public string CorrelationId { get; init; } = string.Empty;
    public string? LifecycleId { get; init; }
    public string? DcsSequenceId { get; init; }

    public string? ActionId { get; init; }
    public string AlarmId { get; init; } = string.Empty;
    /// <summary>Feed correlation id (e.g. BB26-BF402|Alarm high) for HTTP writeback.</summary>
    public string? SourceAlarmId { get; init; }
    public string? SourceEventId { get; init; }
    public string ServerId { get; init; } = string.Empty;
    public string SourceName { get; init; } = string.Empty;
    public string ConditionName { get; init; } = string.Empty;
    public string? SubConditionName { get; init; }
    public long ActiveTimeEpochMs { get; init; }
    public long ActiveFileTime { get; init; }
    public int CookieOffset { get; init; }
    public string? Comment { get; init; }
    public string? Username { get; init; }
    public string AckState { get; init; } = string.Empty;
    public string? LifecycleState { get; init; }

    public string ResolvedCommandId => !string.IsNullOrEmpty(CommandId) ? CommandId : ActionId ?? string.Empty;
}

/// <summary>Raw alarm event from HTTP API ingest.</summary>
public sealed record RawAlarmStreamEvent : IVersionedStreamEvent
{
    public int SchemaVersion { get; init; } = StreamSchemaVersion.Current;
    public string EventType { get; init; } = StreamEventTypes.RawAlarmEvent;

    public string? CommandId { get; init; }
    public string? CorrelationId { get; init; }
    public string? LifecycleId { get; init; }
    public string? DcsSequenceId { get; init; }

    public string EventId { get; init; } = string.Empty;
    public string ServerId { get; init; } = string.Empty;
    public string ServerName { get; init; } = string.Empty;
    public int OpcEventType { get; init; } = 4;
    public string SourceName { get; init; } = string.Empty;
    public long EventTimeEpochMs { get; init; }
    public long ActiveTimeEpochMs { get; init; }
    public long ServerReceivedMs { get; init; }
    public string? Message { get; init; }
    public int EventCategory { get; init; }
    public int Severity { get; init; }
    public string? ConditionName { get; init; }
    public string? SubConditionName { get; init; }
    public bool ConditionActive { get; init; }
    public bool AckRequired { get; init; }
    public bool Acknowledged { get; init; }
    public int Quality { get; init; } = 192;
    public int CookieOffset { get; init; }
    public string? IngestionId { get; init; }
    public long SequenceNumber { get; init; }
}
