using System;
using System.Collections.Generic;

namespace AMS.NotificationService.Models;

/// <summary>
/// RootCause event structure as emitted by Flink CEP.
/// </summary>
public class RootCauseEvent
{
    public string RootCauseId { get; set; } = string.Empty;
    public string InitiatingAlarmId { get; set; } = string.Empty;
    public string RootEquipmentId { get; set; } = string.Empty;
    public string RootEquipmentName { get; set; } = string.Empty;
    public List<string> CorrelatedAlarmIds { get; set; } = new();
    public List<string> AffectedAreas { get; set; } = new();
    public long DetectedAtEpochMs { get; set; }
    public long PropagationDurationMs { get; set; }
    public string RuleName { get; set; } = string.Empty;
}

/// <summary>
/// Defines who receives what and via which channels.
/// </summary>
public class NotificationPolicy
{
    public string PolicyId { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public List<string> TargetAreas { get; set; } = new();
    public List<NotificationChannel> Channels { get; set; } = new();
    public bool IsActive { get; set; } = true;
    public ShiftSchedule? Schedule { get; set; }
}

public class NotificationChannel
{
    public string Type { get; set; } = string.Empty; // "EMAIL", "TEAMS", "SMS"
    public string TargetEndpoint { get; set; } = string.Empty; // email address, webhook url, or phone number
}

public class ShiftSchedule
{
    public string Timezone { get; set; } = "UTC";
    public string StartTime { get; set; } = "00:00";
    public string EndTime { get; set; } = "23:59";
    public List<DayOfWeek> DaysOfWeek { get; set; } = new();
}
