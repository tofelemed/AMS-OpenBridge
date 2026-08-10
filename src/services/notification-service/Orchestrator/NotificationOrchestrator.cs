using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AMS.NotificationService.Models;
using AMS.NotificationService.Providers;
using Microsoft.Extensions.Logging;

namespace AMS.NotificationService.Orchestrator;

public class NotificationOrchestrator
{
    private readonly ILogger<NotificationOrchestrator> _logger;
    private readonly IEnumerable<INotificationProvider> _providers;

    public NotificationOrchestrator(ILogger<NotificationOrchestrator> logger, IEnumerable<INotificationProvider> providers)
    {
        _logger = logger;
        _providers = providers;
    }

    public async Task ProcessEventAsync(RootCauseEvent rootCause, CancellationToken ct)
    {
        _logger.LogInformation("Processing RootCauseEvent {RootCauseId} for {EquipmentName}", 
            rootCause.RootCauseId, rootCause.RootEquipmentName);

        // In a real implementation, policies are fetched from a PostgreSQL DB or Redis Cache.
        // We mock a policy evaluation here.
        var policies = GetActivePoliciesForArea(rootCause.AffectedAreas);

        if (!policies.Any())
        {
            _logger.LogDebug("No active notification policies found for areas: {Areas}", string.Join(",", rootCause.AffectedAreas));
            return;
        }

        foreach (var policy in policies)
        {
            if (!IsActiveForCurrentShift(policy.Schedule))
            {
                _logger.LogDebug("Policy {PolicyName} is not active for the current shift. Skipping.", policy.Name);
                continue;
            }

            var subject = $"[AMS ROOT CAUSE] {rootCause.RuleName}: {rootCause.RootEquipmentName}";
            var message = GenerateMessageBody(rootCause);

            foreach (var channel in policy.Channels)
            {
                var provider = _providers.FirstOrDefault(p => p.ChannelType.Equals(channel.Type, StringComparison.OrdinalIgnoreCase));
                if (provider != null)
                {
                    try
                    {
                        // Fire and forget or await depending on DLQ strategy. 
                        // Awaiting here to ensure we log failures properly.
                        await provider.SendAsync(channel.TargetEndpoint, subject, message, ct);
                    }
                    catch (Exception ex)
                    {
                        // Here you would push to a Kafka 'notification-failures' DLQ for retry logic
                        _logger.LogError(ex, "Failed to dispatch notification to {ChannelType} endpoint {Endpoint}", channel.Type, channel.TargetEndpoint);
                    }
                }
                else
                {
                    _logger.LogWarning("No provider found for channel type: {ChannelType}", channel.Type);
                }
            }
        }
    }

    /// <summary>
    /// Dispatches a platform lifecycle alert (STR-05). Unlike a root-cause event these are
    /// not tied to a plant area — a stalled telemetry feed or a breached ACK SLA is an
    /// operations-wide condition — so every configured channel is notified.
    /// </summary>
    public async Task ProcessLifecycleAlertAsync(LifecycleAlert alert, CancellationToken ct)
    {
        var severityTag = alert.IsCritical ? "CRITICAL" : alert.Severity.ToUpperInvariant();
        var subject     = $"[AMS {severityTag}] {alert.EventType}";
        var body        = GenerateLifecycleAlertBody(alert);

        var channels = GetActivePoliciesForArea(new List<string>())
            .Where(p => IsActiveForCurrentShift(p.Schedule))
            .SelectMany(p => p.Channels)
            .ToList();

        if (channels.Count == 0)
        {
            _logger.LogWarning(
                "Lifecycle alert {EventType} had no active notification channel; " +
                "it is recorded in logs and metrics only.", alert.EventType);
            return;
        }

        foreach (var channel in channels)
        {
            var provider = _providers.FirstOrDefault(
                p => p.ChannelType.Equals(channel.Type, StringComparison.OrdinalIgnoreCase));

            if (provider is null)
            {
                _logger.LogWarning("No provider for channel type {ChannelType}", channel.Type);
                continue;
            }

            try
            {
                await provider.SendAsync(channel.TargetEndpoint, subject, body, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to dispatch lifecycle alert to {ChannelType} {Endpoint}",
                    channel.Type, channel.TargetEndpoint);
            }
        }
    }

    private static string GenerateLifecycleAlertBody(LifecycleAlert alert)
    {
        var raisedAt = DateTimeOffset.FromUnixTimeMilliseconds(alert.TimestampEpochMs);
        return $@"
            <h3>AMS platform alert: {alert.EventType}</h3>
            <ul>
                <li><b>Severity:</b> {alert.Severity}</li>
                <li><b>Raised:</b> {raisedAt:yyyy-MM-dd HH:mm:ss} UTC</li>
                <li><b>Detail:</b> {alert.Describe()}</li>
            </ul>
            <p>This alert came from an AMS pipeline watchdog, not from a process alarm.
               Check ingest and stream health before trusting the alarm console.</p>";
    }

    private string GenerateMessageBody(RootCauseEvent rootCause)
    {
        return $@"
            <h3>Root Cause Identified</h3>
            <ul>
                <li><b>Equipment:</b> {rootCause.RootEquipmentName}</li>
                <li><b>Rule Triggered:</b> {rootCause.RuleName}</li>
                <li><b>Initiating Alarm ID:</b> {rootCause.InitiatingAlarmId}</li>
                <li><b>Correlated Children Suppressed:</b> {rootCause.CorrelatedAlarmIds.Count}</li>
                <li><b>Affected Areas:</b> {string.Join(", ", rootCause.AffectedAreas)}</li>
                <li><b>Detection Time:</b> {DateTimeOffset.FromUnixTimeMilliseconds(rootCause.DetectedAtEpochMs):yyyy-MM-dd HH:mm:ss} UTC</li>
            </ul>
            <p>Please review the incident in the AMS console immediately.</p>";
    }

    private bool IsActiveForCurrentShift(ShiftSchedule? schedule)
    {
        if (schedule == null) return true; // Always active if no schedule

        // Shift logic evaluation (mock simple logic)
        var utcNow = DateTimeOffset.UtcNow;
        if (!schedule.DaysOfWeek.Contains(utcNow.DayOfWeek)) return false;

        // Note: Real shift schedules must account for complex Timezone math.
        return true;
    }

    private List<NotificationPolicy> GetActivePoliciesForArea(List<string> areas)
    {
        // Mock DB fetch
        return new List<NotificationPolicy>
        {
            new NotificationPolicy
            {
                Name = "Critical Operations Team",
                TargetAreas = new List<string> { "Plant/Area1", "Plant/Area2" }, // Assume it matches
                Channels = new List<NotificationChannel>
                {
                    new NotificationChannel { Type = "EMAIL", TargetEndpoint = "ops-lead@plant.local" },
                    // new NotificationChannel { Type = "TEAMS", TargetEndpoint = "https://outlook.office.com/webhook/..." }
                }
            }
        };
    }
}
