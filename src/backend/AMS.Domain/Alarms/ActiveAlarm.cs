using AMS.Domain.Common;

namespace AMS.Domain.Alarms;

/// <summary>
/// OPC A&E Alarm Priority - aligned with OPC severity ranges
/// </summary>
public enum AlarmPriority
{
    Critical   = 1,  // Severity 900-1000 (OPC A&E)
    High       = 2,  // Severity 700-899
    Medium     = 3,  // Severity 400-699
    Low        = 4,  // Severity 100-399
    Diagnostic = 5   // Severity 1-99
}

/// <summary>
/// OPC A&E Alarm/Condition lifecycle state machine.
/// Per OPC A&E 1.10 Section 6.3
/// </summary>
public enum AlarmState
{
    UnacknowledgedUncleared,    // Active, not acknowledged
    AcknowledgedUncleared,      // Active, acknowledged
    UnacknowledgedCleared,      // Inactive, not acknowledged
    AcknowledgedCleared,        // Inactive, acknowledged (terminal)
    Shelved,                    // Operator shelved (ISA-18.2)
    SuppressedByDesign,         // Engineering suppression
    OutOfService,               // OOS state (ISA-18.2)
    Inhibited                   // Inhibited by process logic
}

/// <summary>
/// OPC A&E Event Types per specification Section 3.2
/// </summary>
public enum AlarmEventType
{
    Simple    = 1,  // OPC_AE_SIMPLE = 1
    Tracking  = 2,  // OPC_AE_TRACKING = 2
    Condition = 4   // OPC_AE_CONDITION = 4
}

/// <summary>
/// Alarm category aligned with ISA-18.2 classification
/// </summary>
public enum AlarmCategory
{
    Process,
    Equipment,
    Instrument,
    Safety,
    Environmental,
    System,
    OperatorAction,
    Communication
}

/// <summary>
/// Source system type for multi-vendor integration
/// </summary>
public enum SourceType
{
    OpcAe,
    OpcDa,
    OpcUa,
    AvevaSystemPlatform,
    Wonderware,
    PiSystem,
    SqlIntegration,
    Modbus,
    Profibus,
    Internal
}

/// <summary>
/// Core Active Alarm domain entity.
/// Represents a live OPC A&E condition notification.
/// OPC A&E 1.10 compliant.
/// </summary>
public sealed class ActiveAlarm : BaseEntity
{
    // ---- OPC A&E Core Fields ----
    public Guid ServerId { get; private set; }
    public Guid? AlarmTagId { get; private set; }
    public string AlarmId { get; private set; } = string.Empty;
    public string SourceName { get; private set; } = string.Empty;
    public AlarmEventType EventType { get; private set; }
    public string? ConditionName { get; private set; }
    public string? SubConditionName { get; private set; }
    public string? Message { get; private set; }

    /// <summary>Severity 1-1000 per OPC A&E spec</summary>
    public int Severity { get; private set; }
    public AlarmPriority Priority { get; private set; }
    public AlarmCategory Category { get; private set; }
    public int Quality { get; private set; }  // OPC quality code
    public bool QualityGood => Quality >= 192;

    // ---- State ----
    public AlarmState State { get; private set; }
    public bool ConditionActive { get; private set; }
    public bool Acknowledged { get; private set; }

    // ---- Timestamps (millisecond precision) ----
    public DateTimeOffset EventTime { get; private set; }    // Source timestamp
    public DateTimeOffset ActiveTime { get; private set; }   // When condition became active
    public DateTimeOffset? AckTime { get; private set; }
    public Guid? AckedBy { get; private set; }
    public string? AckComment { get; private set; }
    public DateTimeOffset ServerReceivedAt { get; private set; }

    // ---- Shelving ----
    public bool IsShelved { get; private set; }
    public DateTimeOffset? ShelvedAt { get; private set; }
    public Guid? ShelvedBy { get; private set; }
    public DateTimeOffset? ShelveUntil { get; private set; }
    public string? ShelveComment { get; private set; }

    // ---- Suppression ----
    public bool IsSuppressed { get; private set; }
    public DateTimeOffset? SuppressedAt { get; private set; }
    public Guid? SuppressedBy { get; private set; }
    public string? SuppressionReason { get; private set; }

    // ---- Out of Service ----
    public bool IsOutOfService { get; private set; }

    // ---- Correlation ----
    public Guid? CorrelationId { get; private set; }
    public Guid? RootCauseAlarmId { get; private set; }
    public bool IsRootCause { get; private set; }

    // ---- Process Values ----
    public double? ProcessValue { get; private set; }
    public string? ProcessUnit { get; private set; }

    // ---- OPC Attributes ----
    public Dictionary<string, object> OpcAttributes { get; private set; } = new();
    public Dictionary<string, object> CustomAttributes { get; private set; } = new();

    // ---- Kafka Tracking ----
    public long? KafkaOffset { get; private set; }
    public int? KafkaPartition { get; private set; }
    public string? KafkaTopic { get; private set; }

    // EF Core constructor
    private ActiveAlarm() { }

    /// <summary>
    /// Factory: Create from OPC A&E event notification
    /// </summary>
    public static ActiveAlarm CreateFromOpcEvent(
        Guid serverId,
        string sourceName,
        AlarmEventType eventType,
        string? conditionName,
        string? subConditionName,
        string? message,
        int severity,
        AlarmPriority priority,
        AlarmCategory category,
        bool conditionActive,
        DateTimeOffset eventTime,
        DateTimeOffset activeTime,
        int quality = 192,
        double? processValue = null,
        string? processUnit = null,
        Dictionary<string, object>? opcAttributes = null,
        Guid? alarmTagId = null)
    {
        if (severity is < 1 or > 1000)
            throw new ArgumentOutOfRangeException(nameof(severity), "OPC A&E severity must be 1-1000");
        if (string.IsNullOrWhiteSpace(sourceName))
            throw new ArgumentException("Source name is required", nameof(sourceName));

        var alarm = new ActiveAlarm
        {
            ServerId          = serverId,
            AlarmTagId        = alarmTagId,
            SourceName        = sourceName.Trim(),
            EventType         = eventType,
            ConditionName     = conditionName,
            SubConditionName  = subConditionName,
            Message           = message,
            Severity          = severity,
            Priority          = priority,
            Category          = category,
            ConditionActive   = conditionActive,
            Quality           = quality,
            EventTime         = eventTime,
            ActiveTime        = activeTime,
            ServerReceivedAt  = DateTimeOffset.UtcNow,
            State             = AlarmState.UnacknowledgedUncleared,
            ProcessValue      = processValue,
            ProcessUnit       = processUnit,
            OpcAttributes     = opcAttributes ?? new(),
        };

        alarm.AddDomainEvent(new AlarmActivatedEvent(alarm.Id, serverId, sourceName, priority, eventTime));
        return alarm;
    }

    /// <summary>Assign stable identity from stream projection (HTTP feed or Flink alarmId).</summary>
    public void SetAlarmIdentity(Guid id, string alarmId)
    {
        Id = id;
        AlarmId = alarmId;
        SetUpdated();
    }

    /// <summary>Acknowledge this alarm per ISA-18.2 operator interaction</summary>
    public Result Acknowledge(Guid userId, string? comment, DateTimeOffset ackTime)
    {
        if (Acknowledged) return Result.Failure("Alarm is already acknowledged");
        if (IsShelved) return Result.Failure("Cannot acknowledge a shelved alarm directly");

        Acknowledged   = true;
        AckedBy        = userId;
        AckComment     = comment;
        AckTime        = ackTime;
        State          = ConditionActive
                            ? AlarmState.AcknowledgedUncleared
                            : AlarmState.AcknowledgedCleared;
        SetUpdated();

        AddDomainEvent(new AlarmAcknowledgedEvent(Id, ServerId, SourceName, userId, ackTime));
        return Result.Success();
    }

    /// <summary>Shelve alarm per ISA-18.2. Max duration enforced by tag configuration.</summary>
    public Result Shelve(Guid userId, int durationMinutes, string comment, int maxDurationMinutes = 480)
    {
        if (IsShelved) return Result.Failure("Alarm is already shelved");
        if (durationMinutes > maxDurationMinutes)
            return Result.Failure($"Shelve duration exceeds maximum allowed ({maxDurationMinutes} minutes)");
        if (string.IsNullOrWhiteSpace(comment))
            return Result.Failure("Shelve comment is required per ISA-18.2");

        IsShelved     = true;
        ShelvedAt     = DateTimeOffset.UtcNow;
        ShelvedBy     = userId;
        ShelveUntil   = DateTimeOffset.UtcNow.AddMinutes(durationMinutes);
        ShelveComment = comment;
        State         = AlarmState.Shelved;
        SetUpdated();

        AddDomainEvent(new AlarmShelvedEvent(Id, ServerId, SourceName, userId, ShelveUntil.Value));
        return Result.Success();
    }

    /// <summary>Unshelve alarm, returning to appropriate state</summary>
    public Result Unshelve(Guid userId, string reason)
    {
        if (!IsShelved) return Result.Failure("Alarm is not shelved");

        IsShelved     = false;
        ShelvedAt     = null;
        ShelvedBy     = null;
        ShelveUntil   = null;
        ShelveComment = null;
        State         = DetermineNormalState();
        SetUpdated();

        AddDomainEvent(new AlarmUnshelvedEvent(Id, ServerId, SourceName, userId));
        return Result.Success();
    }

    /// <summary>Suppress alarm (engineering / design suppression)</summary>
    public Result Suppress(Guid userId, string reason)
    {
        if (IsSuppressed) return Result.Failure("Alarm is already suppressed");

        IsSuppressed      = true;
        SuppressedAt      = DateTimeOffset.UtcNow;
        SuppressedBy      = userId;
        SuppressionReason = reason;
        State             = AlarmState.SuppressedByDesign;
        SetUpdated();

        AddDomainEvent(new AlarmSuppressedEvent(Id, ServerId, SourceName, userId, reason));
        return Result.Success();
    }

    /// <summary>Set alarm out of service (ISA-18.2).</summary>
    public Result SetOutOfService(Guid userId, string reason)
    {
        if (IsOutOfService) return Result.Failure("Alarm is already out of service");
        if (string.IsNullOrWhiteSpace(reason)) return Result.Failure("Reason is required");

        IsOutOfService = true;
        State          = AlarmState.OutOfService;
        SetUpdated();
        return Result.Success();
    }

    /// <summary>Apply ACK lifecycle from stream (materialized view projection — not authoritative).</summary>
    public void ApplyAckLifecycle(
        string lifecycleState,
        string? commandId = null,
        long? requestedAtEpochMs = null,
        string? detail = null,
        string? correlationId = null,
        string? lifecycleId = null,
        string? dcsSequenceId = null)
    {
        CustomAttributes["ackLifecycleState"] = lifecycleState;
        if (commandId is not null)
        {
            CustomAttributes["pendingAckCommandId"] = commandId;
            CustomAttributes["pendingAckActionId"] = commandId;
        }
        if (correlationId is not null)
            CustomAttributes["ackCorrelationId"] = correlationId;
        if (lifecycleId is not null)
            CustomAttributes["ackLifecycleId"] = lifecycleId;
        if (dcsSequenceId is not null)
            CustomAttributes["dcsSequenceId"] = dcsSequenceId;
        if (requestedAtEpochMs.HasValue)
            CustomAttributes["ackRequestedAtEpochMs"] = requestedAtEpochMs.Value;
        if (detail is not null)
            CustomAttributes["ackLifecycleDetail"] = detail;

        if (lifecycleState == "ACK_CONFIRMED")
        {
            var ackTime = DateTimeOffset.UtcNow;
            if (!Acknowledged)
            {
                Acknowledged = true;
                AckTime      = ackTime;
                // alarm_current lab schema does not persist condition_active; infer from state.
                State        = (ConditionActive || State == AlarmState.UnacknowledgedUncleared)
                    ? AlarmState.AcknowledgedUncleared
                    : AlarmState.AcknowledgedCleared;
            }
            CustomAttributes.Remove("pendingAckActionId");
        }
        else if (lifecycleState is "ACK_FAILED" or "ACK_TIMEOUT")
        {
            CustomAttributes.Remove("pendingAckActionId");
        }

        SetUpdated();
    }

    public string? GetAckLifecycleState() =>
        CustomAttributes.TryGetValue("ackLifecycleState", out var v) ? v?.ToString() : null;

    public long? GetAckRequestedAtEpochMs()
    {
        if (!CustomAttributes.TryGetValue("ackRequestedAtEpochMs", out var v)) return null;
        return v switch
        {
            long l => l,
            int i => i,
            _ => long.TryParse(v?.ToString(), out var p) ? p : null
        };
    }

    /// <summary>Reconcile acknowledged state from operator ACK confirmation (not OPC ingest).</summary>
    public void ReconcileAcknowledgement(DateTimeOffset ackTime, Guid? userId = null, string? comment = null)
    {
        if (Acknowledged) return;

        Acknowledged = true;
        AckedBy      = userId;
        AckComment   = comment;
        AckTime      = ackTime;
        State        = ConditionActive
            ? AlarmState.AcknowledgedUncleared
            : AlarmState.AcknowledgedCleared;
        SetUpdated();
    }

    /// <summary>Remove OPC/DCS ack bit mistakenly applied before operator action.</summary>
    public void ClearOpcInferredAcknowledgement()
    {
        if (!Acknowledged) return;

        if (CustomAttributes.ContainsKey("ackCorrelationId")) return;

        var lifecycle = GetAckLifecycleState();
        if (lifecycle is "ACK_REQUESTED" or "ACK_QUEUED" or "ACK_PROCESSING" or "ACK_DISPATCHED"
            or "ACK_PENDING_DCS" or "ACK_RETRYING")
            return;

        Acknowledged = false;
        AckTime      = null;
        AckedBy      = null;
        AckComment   = null;
        State        = ConditionActive
            ? AlarmState.UnacknowledgedUncleared
            : AlarmState.UnacknowledgedCleared;
        CustomAttributes.Remove("ackLifecycleState");
        CustomAttributes.Remove("pendingAckActionId");
        CustomAttributes.Remove("pendingAckCommandId");
        SetUpdated();
    }

    /// <summary>Process incoming OPC A&E condition state change</summary>
    public void ApplyConditionChange(bool conditionActive, string? message, int severity, DateTimeOffset eventTime)
    {
        var wasActive = ConditionActive;
        ConditionActive = conditionActive;
        Message         = message;
        Severity        = severity;
        EventTime       = eventTime;

        if (!conditionActive && wasActive)
        {
            // Condition cleared
            State = Acknowledged ? AlarmState.AcknowledgedCleared : AlarmState.UnacknowledgedCleared;
            AddDomainEvent(new AlarmClearedEvent(Id, ServerId, SourceName, eventTime));
        }
        else if (conditionActive && !wasActive)
        {
            // Condition re-activated
            Acknowledged = false;
            AckTime      = null;
            AckedBy      = null;
            ActiveTime   = eventTime;
            State        = AlarmState.UnacknowledgedUncleared;
            AddDomainEvent(new AlarmActivatedEvent(Id, ServerId, SourceName, Priority, eventTime));
        }

        SetUpdated();
    }

    /// <summary>Keep OPC active time in sync for DCS AcknowledgeCondition (E_INVALIDTIME if stale).</summary>
    public void SyncOpcActiveTime(DateTimeOffset activeTime)
    {
        if (ConditionActive)
            ActiveTime = activeTime;
        MergeOpcAttributes(activeTime.ToUnixTimeMilliseconds(), null, null);
    }

    /// <summary>Replace opc_attributes snapshot so EF persists JSONB mutations.</summary>
    public void MergeOpcAttributes(
        long? activeTimeEpochMs,
        int? cookieOffset,
        string? alarmEventKind,
        bool? opcAckWriteable = null,
        string? feed = null,
        string? ackPath = null,
        string? sourceEventId = null)
    {
        var next = new Dictionary<string, object>(OpcAttributes);
        if (activeTimeEpochMs.HasValue)
            next["activeTimeEpochMs"] = activeTimeEpochMs.Value;
        if (cookieOffset is > 0)
            next["cookieOffset"] = cookieOffset.Value;
        if (!string.IsNullOrEmpty(alarmEventKind))
            next["alarmEventKind"] = alarmEventKind;
        if (opcAckWriteable.HasValue)
            next["opcAckWriteable"] = opcAckWriteable.Value;
        if (!string.IsNullOrEmpty(feed))
            next["feed"] = feed;
        if (!string.IsNullOrEmpty(ackPath))
            next["ackPath"] = ackPath;
        if (!string.IsNullOrWhiteSpace(sourceEventId))
            next["sourceEventId"] = sourceEventId.Trim();
        OpcAttributes = next;
        SetUpdated();
    }

    /// <summary>Set correlation (Flink correlation engine result)</summary>
    public void SetCorrelation(Guid correlationId, Guid? rootCauseId, bool isRootCause)
    {
        CorrelationId   = correlationId;
        RootCauseAlarmId = rootCauseId;
        IsRootCause     = isRootCause;
        SetUpdated();
    }

    private AlarmState DetermineNormalState()
    {
        if (ConditionActive && !Acknowledged) return AlarmState.UnacknowledgedUncleared;
        if (ConditionActive && Acknowledged) return AlarmState.AcknowledgedUncleared;
        if (!ConditionActive && !Acknowledged) return AlarmState.UnacknowledgedCleared;
        return AlarmState.AcknowledgedCleared;
    }
}

/// <summary>Simple result type for domain operations</summary>
public record Result(bool IsSuccess, string? Error)
{
    public static Result Success() => new(true, null);
    public static Result Failure(string error) => new(false, error);
    public bool IsFailure => !IsSuccess;
}
