namespace AMS.NotificationService.Models;

/// <summary>
/// A message on the <c>traverse.alarm.lifecycle-alerts</c> topic (STR-05).
///
/// Two producers write here, both of them safety-relevant watchdogs in ams-api:
///   TELEMETRY_STALLED — TelemetryDeadmanWatchdogService: no raw OPC events have
///                       arrived within the stall threshold, i.e. the alarm feed
///                       is dead and the console is showing stale reality.
///   ACK_SLA_BREACH    — AckSlaWatchdogService: an operator acknowledgement has
///                       not reached a terminal state inside its SLA.
///
/// Until this consumer existed the topic had no reader at all, so both alerts
/// were published into a void — a dead feed raised nothing an operator could see.
///
/// The shape is deliberately permissive: it is the union of both producers'
/// payloads, so an unknown or newly-added alert type still dispatches with its
/// event type, severity and timestamp rather than being dropped.
/// </summary>
public class LifecycleAlert
{
    public string EventType { get; set; } = "UNKNOWN";
    public string Severity { get; set; } = "WARNING";
    public long TimestampEpochMs { get; set; }

    // TELEMETRY_STALLED
    public string? Topic { get; set; }
    public string? IngestAuthority { get; set; }
    public int? StallThresholdSeconds { get; set; }
    public double? SecondsSinceLastEvent { get; set; }
    public string? Detail { get; set; }

    // ACK_SLA_BREACH
    public string? AlarmId { get; set; }
    public string? CommandId { get; set; }
    public string? CorrelationId { get; set; }
    public string? LifecycleState { get; set; }
    public long? DurationMs { get; set; }

    public bool IsCritical =>
        string.Equals(Severity, "CRITICAL", StringComparison.OrdinalIgnoreCase);

    public string Describe() => EventType switch
    {
        "TELEMETRY_STALLED" =>
            $"No events on '{Topic}' for {SecondsSinceLastEvent:F0}s " +
            $"(threshold {StallThresholdSeconds}s, authority {IngestAuthority}). " +
            $"{Detail}",
        "ACK_SLA_BREACH" =>
            $"Acknowledgement for alarm {AlarmId} stuck in '{LifecycleState}' " +
            $"for {DurationMs}ms (command {CommandId}).",
        _ => Detail ?? "Lifecycle alert raised with no detail."
    };
}
