using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json.Serialization;

namespace AMS.Api.Hubs;

public interface IObservabilityHubClient
{
    // OnDriftAlertReceived removed (audit-jobs.md Phase G): StateDriftDetectionJob
    // retired — its input topics never had a producer.
    Task OnAlarmStateDeltaReceived(AlarmStateDeltaPayload payload);
    Task OnReplayDeltaReceived(ReplayStateDeltaPayload payload);
}

public sealed record ReplayStateDeltaPayload(
    [property: JsonPropertyName("replay_id")] string ReplayId,
    [property: JsonPropertyName("correlation_id")] string CorrelationId,
    [property: JsonPropertyName("change_type")] string ChangeType,
    [property: JsonPropertyName("timestamp")] long Timestamp,
    [property: JsonPropertyName("current_state")] object? CurrentState
);

public sealed record AlarmStateDeltaPayload(
    [property: JsonPropertyName("correlation_id")] string CorrelationId,
    [property: JsonPropertyName("change_type")] string ChangeType,
    [property: JsonPropertyName("timestamp")] long Timestamp,
    [property: JsonPropertyName("previous_state")] object? PreviousState,
    [property: JsonPropertyName("current_state")] object? CurrentState
);

// Drift alerts, alarm-state deltas, and replay streams are engineering/diagnostic surfaces, not
// operator data. Previously this hub carried no [Authorize] at all, so it pushed to any client that
// connected. Gated to system.manage — the same admin/engineering policy that guards the observability
// REST controllers (AUTH-04).
[Authorize(Policy = "system.manage")]
public sealed class ObservabilityHub : Hub<IObservabilityHubClient>
{
    private readonly ILogger<ObservabilityHub> _logger;

    public ObservabilityHub(ILogger<ObservabilityHub> logger)
    {
        _logger = logger;
    }

    public override Task OnConnectedAsync()
    {
        _logger.LogInformation("Observability client connected: {ConnectionId}", Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Observability client disconnected: {ConnectionId}", Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}
