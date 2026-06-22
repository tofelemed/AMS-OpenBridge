using AMS.Domain.Common;

namespace AMS.Domain.Alarms;

// ============================================================
// Domain Events - all alarm lifecycle events
// Published via MediatR INotification
// ============================================================

/// <summary>Raised when an OPC A&E alarm condition becomes active</summary>
public record AlarmActivatedEvent(
    Guid AlarmId,
    Guid ServerId,
    string SourceName,
    AlarmPriority Priority,
    DateTimeOffset EventTime
) : DomainEventBase;

/// <summary>Raised when an operator acknowledges an alarm</summary>
public record AlarmAcknowledgedEvent(
    Guid AlarmId,
    Guid ServerId,
    string SourceName,
    Guid UserId,
    DateTimeOffset AckTime
) : DomainEventBase;

/// <summary>Raised when an OPC A&E condition is cleared (returns to normal)</summary>
public record AlarmClearedEvent(
    Guid AlarmId,
    Guid ServerId,
    string SourceName,
    DateTimeOffset ClearedTime
) : DomainEventBase;

/// <summary>Raised when an alarm is shelved by an operator</summary>
public record AlarmShelvedEvent(
    Guid AlarmId,
    Guid ServerId,
    string SourceName,
    Guid UserId,
    DateTimeOffset ShelveUntil
) : DomainEventBase;

/// <summary>Raised when a shelved alarm is unshelved or auto-expires</summary>
public record AlarmUnshelvedEvent(
    Guid AlarmId,
    Guid ServerId,
    string SourceName,
    Guid UserId
) : DomainEventBase;

/// <summary>Raised when an alarm is suppressed by design or operator</summary>
public record AlarmSuppressedEvent(
    Guid AlarmId,
    Guid ServerId,
    string SourceName,
    Guid UserId,
    string Reason
) : DomainEventBase;

/// <summary>Raised when alarm flood is detected (per ISA-18.2 / EEMUA-191)</summary>
public record AlarmFloodDetectedEvent(
    Guid ServerId,
    double AlarmsPerTenMin,
    int TotalAlarms,
    DateTimeOffset DetectedAt
) : DomainEventBase;

/// <summary>Raised when a chattering alarm is detected</summary>
public record ChatteringAlarmDetectedEvent(
    Guid AlarmTagId,
    Guid ServerId,
    string SourceName,
    int TransitionCount,
    int WindowMinutes,
    DateTimeOffset DetectedAt
) : DomainEventBase;

/// <summary>Raised when OPC server connection state changes</summary>
public record OpcServerConnectionChangedEvent(
    Guid ServerId,
    string ServerName,
    bool IsConnected,
    string? Error,
    DateTimeOffset ChangedAt
) : DomainEventBase;

/// <summary>Raised when a new alarm tag is auto-discovered on the OPC server</summary>
public record AlarmTagDiscoveredEvent(
    Guid ServerId,
    string SourceName,
    string? ConditionName,
    DateTimeOffset DiscoveredAt
) : DomainEventBase;
