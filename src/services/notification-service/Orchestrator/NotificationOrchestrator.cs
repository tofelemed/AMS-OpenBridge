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
