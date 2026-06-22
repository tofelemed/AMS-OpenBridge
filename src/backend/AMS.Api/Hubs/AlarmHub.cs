using AMS.Application.Alarms.Commands;
using AMS.Domain.Alarms;
using AMS.Infrastructure.Kafka;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace AMS.Api.Hubs;

/// <summary>
/// Real-time alarm SignalR hub.
/// 
/// Groups:
///   - "alarms-{priority}"   : Priority-based subscription (CRITICAL, HIGH, etc.)
///   - "server-{serverId}"   : Server-specific alarms
///   - "area-{areaId}"       : Area-specific alarms
///   - "role-{role}"         : Role-based filtered streams
///   - "station-{stationId}" : Operator station-specific stream
/// 
/// Supports ~10,000 concurrent connections via SignalR scale-out.
/// </summary>
[Authorize]
public sealed class AlarmHub : Hub<IAlarmHubClient>
{
    private readonly ILogger<AlarmHub> _logger;
    
    // Track connections: connectionId → subscription metadata
    private static readonly ConcurrentDictionary<string, AlarmHubConnection> _connections = new();

    public AlarmHub(ILogger<AlarmHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId   = Context.UserIdentifier ?? "anonymous";
        var role     = Context.User?.FindFirst("role")?.Value ?? "VIEWER";
        var station  = Context.User?.FindFirst("operator_station")?.Value;
        var connId   = Context.ConnectionId;

        _connections[connId] = new AlarmHubConnection(
            ConnectionId:     connId,
            UserId:           userId,
            Role:             role,
            OperatorStation:  station,
            ConnectedAt:      DateTimeOffset.UtcNow
        );

        // Auto-subscribe to role group
        await Groups.AddToGroupAsync(connId, $"role-{role}");

        // Auto-subscribe to operator station group
        if (!string.IsNullOrEmpty(station))
            await Groups.AddToGroupAsync(connId, $"station-{station}");

        _logger.LogInformation(
            "AlarmHub: User {UserId} connected [{ConnId}] | Role: {Role} | Station: {Station}",
            userId, connId, role, station);

        // Send current alarm snapshot on connect
        await Clients.Caller.OnConnected(new HubConnectionInfo(
            ConnectionId: connId,
            UserId:       userId,
            Role:         role,
            ConnectedAt:  DateTimeOffset.UtcNow,
            ServerTime:   DateTimeOffset.UtcNow
        ));

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _connections.TryRemove(Context.ConnectionId, out _);

        if (exception is not null)
            _logger.LogWarning(exception,
                "AlarmHub: Connection {ConnId} disconnected with error", Context.ConnectionId);
        else
            _logger.LogDebug("AlarmHub: Connection {ConnId} disconnected", Context.ConnectionId);

        await base.OnDisconnectedAsync(exception);
    }

    // ---- Client-invokable methods ----

    /// <summary>Subscribe to a specific server's alarm stream</summary>
    public async Task SubscribeToServer(string serverId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"server-{serverId}");
        _logger.LogDebug("Connection {ConnId} subscribed to server {ServerId}", Context.ConnectionId, serverId);
    }

    /// <summary>Unsubscribe from a server stream</summary>
    public async Task UnsubscribeFromServer(string serverId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"server-{serverId}");
    }

    /// <summary>Subscribe to alarms from a specific area</summary>
    public async Task SubscribeToArea(string areaId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"area-{areaId}");
    }

    /// <summary>Subscribe to priority-filtered alarm stream</summary>
    public async Task SubscribeToPriority(string priority)
    {
        var valid = new[] { "CRITICAL", "HIGH", "MEDIUM", "LOW", "DIAGNOSTIC" };
        if (!valid.Contains(priority.ToUpper())) return;
        await Groups.AddToGroupAsync(Context.ConnectionId, $"alarms-{priority.ToUpper()}");
    }

    /// <summary>Ping for connection health check</summary>
    public Task<string> Ping() => Task.FromResult($"pong:{DateTimeOffset.UtcNow:O}");

    public static int TotalConnections => _connections.Count;
}

/// <summary>
/// Strongly-typed client interface for AlarmHub
/// </summary>
public interface IAlarmHubClient
{
    /// <summary>Called when a new alarm is created</summary>
    Task OnNewAlarm(AlarmHubPayload alarm);

    /// <summary>Called when alarm state changes (ack, shelve, clear, etc.)</summary>
    Task OnAlarmUpdated(AlarmHubPayload alarm);

    /// <summary>ACK orchestration lifecycle transition (real-time operational transparency)</summary>
    Task OnAckLifecycleUpdated(AckLifecyclePayload lifecycle);

    /// <summary>Called when alarm is cleared/archived</summary>
    Task OnAlarmCleared(AlarmClearedPayload cleared);

    /// <summary>Bulk update for batch operations</summary>
    Task OnBulkAlarmsUpdated(AlarmBulkUpdatePayload bulk);

    /// <summary>Alarm flood alert</summary>
    Task OnFloodAlert(FloodAlertPayload flood);

    /// <summary>OPC server connection status change</summary>
    Task OnServerStatusChanged(ServerStatusPayload status);

    /// <summary>SOE event for real-time SOE panel</summary>
    Task OnSoeEvent(SoeEventPayload soe);

    /// <summary>Analytics update (KPI refresh)</summary>
    Task OnAnalyticsUpdate(AnalyticsUpdatePayload analytics);

    /// <summary>Connection established acknowledgement</summary>
    Task OnConnected(HubConnectionInfo info);

    /// <summary>Server heartbeat</summary>
    Task OnHeartbeat(HeartbeatPayload heartbeat);

    Task OnLoopKpiUpdate(object payload);
    Task OnAlarmKpiUpdate(object payload);
}

// ---- Payload types ----

public record AlarmHubPayload(
    Guid Id,
    string ServerId,
    string ServerName,
    string SourceName,
    string? ConditionName,
    string? SubConditionName,
    string? Message,
    int Severity,
    string Priority,
    string Category,
    string State,
    bool ConditionActive,
    bool Acknowledged,
    bool IsShelved,
    bool IsSuppressed,
    long EventTimeEpochMs,
    long ActiveTimeEpochMs,
    long? AckTimeEpochMs,
    string? AckedByUsername,
    long? ShelveUntilEpochMs,
    Guid? CorrelationId,
    bool IsRootCause,
    double? ProcessValue,
    string? ProcessUnit,
    long ServerReceivedEpochMs,
    string LogicalAlarmFamilyId,
    int InstanceKeySchemaVersion,
    string? AckComment = null,
    IReadOnlyDictionary<string, object>? OpcAttributes = null
);

public record AckLifecyclePayload(
    Guid AlarmId,
    string CommandId,
    string CorrelationId,
    string? LifecycleId,
    string? DcsSequenceId,
    string LifecycleState,
    string? Detail,
    long TimestampEpochMs,
    long? LatencyMs,
    long? AckRequestedAtEpochMs,
    string? ActionId = null
);

public record AlarmClearedPayload(
    Guid AlarmId,
    string SourceName,
    long ClearedTimeEpochMs
);

public record AlarmBulkUpdatePayload(
    Guid[] AlarmIds,
    string Action,   // "ACKNOWLEDGED", "SHELVED", etc.
    long TimestampEpochMs,
    int Count
);

public record FloodAlertPayload(
    string ServerId,
    double AlarmsPerTenMin,
    bool IsFlood,
    long DetectedAtEpochMs
);

public record ServerStatusPayload(
    string ServerId,
    string ServerName,
    bool IsConnected,
    string? Error,
    long TimestampEpochMs
);

public record SoeEventPayload(
    long Id,
    string SourceName,
    string ServerId,
    long SourceTimestampEpochMs,
    int Severity,
    string Priority,
    string Message,
    bool ConditionActive,
    bool IsOutOfOrder
);

public record AnalyticsUpdatePayload(
    string ServerId,
    double AlarmsPerTenMin,
    int TotalActive,
    int TotalCritical,
    int TotalUnacknowledged,
    bool FloodActive,
    long TimestampEpochMs
);

public record HubConnectionInfo(
    string ConnectionId,
    string UserId,
    string Role,
    DateTimeOffset ConnectedAt,
    DateTimeOffset ServerTime
);

public record HeartbeatPayload(
    long ServerTimeEpochMs,
    int ConnectedClients
);

public record AlarmHubConnection(
    string ConnectionId,
    string UserId,
    string Role,
    string? OperatorStation,
    DateTimeOffset ConnectedAt
);

/// <summary>
/// SignalR publisher service — bridges domain events → real-time clients
/// </summary>
public sealed class AlarmSignalRPublisher : IAlarmSignalRPublisher
{
    private readonly IHubContext<AlarmHub, IAlarmHubClient> _hub;
    private readonly ILogger<AlarmSignalRPublisher> _logger;

    public AlarmSignalRPublisher(
        IHubContext<AlarmHub, IAlarmHubClient> hub,
        ILogger<AlarmSignalRPublisher> logger)
    {
        _hub    = hub;
        _logger = logger;
    }

    public async Task PublishNewAlarmAsync(ActiveAlarm alarm, CancellationToken ct = default)
    {
        var payload = MapToPayload(alarm);

        // Broadcast to all connections
        await _hub.Clients.All.OnNewAlarm(payload);

        // Priority group
        await _hub.Clients.Group($"alarms-{alarm.Priority.ToString().ToUpper()}")
            .OnNewAlarm(payload);

        // Server group
        await _hub.Clients.Group($"server-{alarm.ServerId}")
            .OnNewAlarm(payload);
    }

    public async Task PublishAlarmUpdatedAsync(ActiveAlarm alarm, CancellationToken ct = default)
    {
        var payload = MapToPayload(alarm);
        await _hub.Clients.All.OnAlarmUpdated(payload);
        await _hub.Clients.Group($"server-{alarm.ServerId}").OnAlarmUpdated(payload);
    }

    public async Task PublishBulkAlarmsUpdatedAsync(IEnumerable<ActiveAlarm> alarms, CancellationToken ct = default)
    {
        var list  = alarms.ToList();
        var ids   = list.Select(a => a.Id).ToArray();
        var bulk  = new AlarmBulkUpdatePayload(ids, "ACKNOWLEDGED", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ids.Length);
        await _hub.Clients.All.OnBulkAlarmsUpdated(bulk);
    }

    public async Task PublishAlarmClearedAsync(Guid alarmId, string sourceName, DateTimeOffset clearedTime, CancellationToken ct = default)
    {
        var payload = new AlarmClearedPayload(alarmId, sourceName, clearedTime.ToUnixTimeMilliseconds());
        await _hub.Clients.All.OnAlarmCleared(payload);
    }

    public async Task PublishFloodAlertAsync(Guid serverId, double rate, CancellationToken ct = default)
    {
        var payload = new FloodAlertPayload(
            serverId.ToString(), rate, rate > 10, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await _hub.Clients.All.OnFloodAlert(payload);
    }

    public async Task PublishConnectionStatusAsync(Guid serverId, bool connected, CancellationToken ct = default)
    {
        var payload = new ServerStatusPayload(
            serverId.ToString(), string.Empty, connected, null,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await _hub.Clients.All.OnServerStatusChanged(payload);
    }

    public async Task PublishAckLifecycleAsync(
        Guid alarmId,
        string commandId,
        string correlationId,
        string? lifecycleId,
        string? dcsSequenceId,
        string lifecycleState,
        string? detail,
        long timestampEpochMs,
        long? latencyMs,
        CancellationToken ct = default)
    {
        var payload = new AckLifecyclePayload(
            alarmId, commandId, correlationId, lifecycleId, dcsSequenceId,
            lifecycleState, detail, timestampEpochMs, latencyMs, null, commandId);
        await _hub.Clients.All.OnAckLifecycleUpdated(payload);
    }

    public async Task PublishLoopKpiAsync(object payload, CancellationToken ct = default)
    {
        await _hub.Clients.All.OnLoopKpiUpdate(payload);
    }

    public async Task PublishAlarmKpiAsync(object payload, CancellationToken ct = default)
    {
        await _hub.Clients.All.OnAlarmKpiUpdate(payload);
    }

    private static AlarmHubPayload MapToPayload(ActiveAlarm a) => new(
        Id:                    a.Id,
        ServerId:              a.ServerId.ToString(),
        ServerName:            string.Empty,
        SourceName:            a.SourceName,
        ConditionName:         a.ConditionName,
        SubConditionName:      a.SubConditionName,
        Message:               a.Message,
        Severity:              a.Severity,
        Priority:              a.Priority.ToString().ToUpper(),
        Category:              a.Category.ToString().ToUpper(),
        State:                 ConvertState(a.State),
        ConditionActive:       a.ConditionActive,
        Acknowledged:          a.Acknowledged,
        IsShelved:             a.IsShelved,
        IsSuppressed:          a.IsSuppressed,
        EventTimeEpochMs:      a.EventTime.ToUnixTimeMilliseconds(),
        ActiveTimeEpochMs:     a.ActiveTime.ToUnixTimeMilliseconds(),
        AckTimeEpochMs:        a.AckTime?.ToUnixTimeMilliseconds(),
        AckedByUsername:       null,
        ShelveUntilEpochMs:    a.ShelveUntil?.ToUnixTimeMilliseconds(),
        CorrelationId:         a.CorrelationId,
        IsRootCause:           a.IsRootCause,
        ProcessValue:          a.ProcessValue,
        ProcessUnit:           a.ProcessUnit,
        ServerReceivedEpochMs: a.ServerReceivedAt.ToUnixTimeMilliseconds(),
        LogicalAlarmFamilyId:  AlarmPartitionKeys.LogicalAlarmFamilyId(
            a.ServerId, a.SourceName, a.ConditionName ?? "", a.SubConditionName),
        InstanceKeySchemaVersion: AlarmPartitionKeys.InstanceKeySchemaVersion,
        AckComment:            a.AckComment
    );

    private static string ConvertState(AlarmState s) => s switch
    {
        AlarmState.UnacknowledgedUncleared => "UNACKNOWLEDGED_UNCLEARED",
        AlarmState.AcknowledgedUncleared   => "ACKNOWLEDGED_UNCLEARED",
        AlarmState.UnacknowledgedCleared   => "UNACKNOWLEDGED_CLEARED",
        AlarmState.AcknowledgedCleared     => "ACKNOWLEDGED_CLEARED",
        AlarmState.Shelved                 => "SHELVED",
        AlarmState.SuppressedByDesign      => "SUPPRESSED_BY_DESIGN",
        AlarmState.OutOfService            => "OUT_OF_SERVICE",
        AlarmState.Inhibited               => "INHIBITED",
        _                                  => "UNKNOWN"
    };
}


// using AMS.Application.Alarms.Queries;
// using AMS.Domain.Alarms;
// using AMS.Infrastructure.Kafka;
// using Microsoft.AspNetCore.Authorization;
// using Microsoft.AspNetCore.SignalR;
// using System.Collections.Concurrent;

// namespace AMS.Api.Hubs;

// /// <summary>
// /// Real-time alarm SignalR hub.
// /// 
// /// Groups:
// ///   - "alarms-{priority}"   : Priority-based subscription (CRITICAL, HIGH, etc.)
// ///   - "server-{serverId}"   : Server-specific alarms
// ///   - "area-{areaId}"       : Area-specific alarms
// ///   - "role-{role}"         : Role-based filtered streams
// ///   - "station-{stationId}" : Operator station-specific stream
// /// 
// /// Supports ~10,000 concurrent connections via SignalR scale-out.
// /// </summary>
// [Authorize]
// public sealed class AlarmHub : Hub<IAlarmHubClient>
// {
//     private readonly ILogger<AlarmHub> _logger;
    
//     // Track connections: connectionId → subscription metadata
//     private static readonly ConcurrentDictionary<string, AlarmHubConnection> _connections = new();

//     public AlarmHub(ILogger<AlarmHub> logger)
//     {
//         _logger = logger;
//     }

//     public override async Task OnConnectedAsync()
//     {
//         var userId   = Context.UserIdentifier ?? "anonymous";
//         var role     = Context.User?.FindFirst("role")?.Value ?? "VIEWER";
//         var station  = Context.User?.FindFirst("operator_station")?.Value;
//         var connId   = Context.ConnectionId;

//         _connections[connId] = new AlarmHubConnection(
//             ConnectionId:     connId,
//             UserId:           userId,
//             Role:             role,
//             OperatorStation:  station,
//             ConnectedAt:      DateTimeOffset.UtcNow
//         );

//         // Auto-subscribe to role group
//         await Groups.AddToGroupAsync(connId, $"role-{role}");

//         // Auto-subscribe to operator station group
//         if (!string.IsNullOrEmpty(station))
//             await Groups.AddToGroupAsync(connId, $"station-{station}");

//         _logger.LogInformation(
//             "AlarmHub: User {UserId} connected [{ConnId}] | Role: {Role} | Station: {Station}",
//             userId, connId, role, station);

//         // Send current alarm snapshot on connect
//         await Clients.Caller.OnConnected(new HubConnectionInfo(
//             ConnectionId: connId,
//             UserId:       userId,
//             Role:         role,
//             ConnectedAt:  DateTimeOffset.UtcNow,
//             ServerTime:   DateTimeOffset.UtcNow
//         ));

//         await base.OnConnectedAsync();
//     }

//     public override async Task OnDisconnectedAsync(Exception? exception)
//     {
//         _connections.TryRemove(Context.ConnectionId, out _);

//         if (exception is not null)
//             _logger.LogWarning(exception,
//                 "AlarmHub: Connection {ConnId} disconnected with error", Context.ConnectionId);
//         else
//             _logger.LogDebug("AlarmHub: Connection {ConnId} disconnected", Context.ConnectionId);

//         await base.OnDisconnectedAsync(exception);
//     }

//     // ---- Client-invokable methods ----

//     /// <summary>Subscribe to a specific server's alarm stream</summary>
//     public async Task SubscribeToServer(string serverId)
//     {
//         await Groups.AddToGroupAsync(Context.ConnectionId, $"server-{serverId}");
//         _logger.LogDebug("Connection {ConnId} subscribed to server {ServerId}", Context.ConnectionId, serverId);
//     }

//     /// <summary>Unsubscribe from a server stream</summary>
//     public async Task UnsubscribeFromServer(string serverId)
//     {
//         await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"server-{serverId}");
//     }

//     /// <summary>Subscribe to alarms from a specific area</summary>
//     public async Task SubscribeToArea(string areaId)
//     {
//         await Groups.AddToGroupAsync(Context.ConnectionId, $"area-{areaId}");
//     }

//     /// <summary>Subscribe to priority-filtered alarm stream</summary>
//     public async Task SubscribeToPriority(string priority)
//     {
//         var valid = new[] { "CRITICAL", "HIGH", "MEDIUM", "LOW", "DIAGNOSTIC" };
//         if (!valid.Contains(priority.ToUpper())) return;
//         await Groups.AddToGroupAsync(Context.ConnectionId, $"alarms-{priority.ToUpper()}");
//     }

//     /// <summary>Ping for connection health check</summary>
//     public Task<string> Ping() => Task.FromResult($"pong:{DateTimeOffset.UtcNow:O}");

//     public static int TotalConnections => _connections.Count;
// }

// /// <summary>
// /// Strongly-typed client interface for AlarmHub
// /// </summary>
// public interface IAlarmHubClient
// {
//     /// <summary>Called when a new alarm is created</summary>
//     Task OnNewAlarm(AlarmHubPayload alarm);

//     /// <summary>Called when alarm state changes (ack, shelve, clear, etc.)</summary>
//     Task OnAlarmUpdated(AlarmHubPayload alarm);

//     /// <summary>ACK orchestration lifecycle transition (real-time operational transparency)</summary>
//     Task OnAckLifecycleUpdated(AckLifecyclePayload lifecycle);

//     /// <summary>Called when alarm is cleared/archived</summary>
//     Task OnAlarmCleared(AlarmClearedPayload cleared);

//     /// <summary>Bulk update for batch operations</summary>
//     Task OnBulkAlarmsUpdated(AlarmBulkUpdatePayload bulk);

//     /// <summary>Alarm flood alert</summary>
//     Task OnFloodAlert(FloodAlertPayload flood);

//     /// <summary>OPC server connection status change</summary>
//     Task OnServerStatusChanged(ServerStatusPayload status);

//     /// <summary>SOE event for real-time SOE panel</summary>
//     Task OnSoeEvent(SoeEventPayload soe);

//     /// <summary>Analytics update (KPI refresh)</summary>
//     Task OnAnalyticsUpdate(AnalyticsUpdatePayload analytics);

//     /// <summary>Connection established acknowledgement</summary>
//     Task OnConnected(HubConnectionInfo info);

//     /// <summary>Server heartbeat</summary>
//     Task OnHeartbeat(HeartbeatPayload heartbeat);

//     Task OnLoopKpiUpdate(AMS.Api.BackgroundServices.LoopKpiPayload payload);
//     Task OnAlarmKpiUpdate(AMS.Api.BackgroundServices.AlarmKpiPayload payload);
// }

// // ---- Payload types ----

// public record AlarmHubPayload(
//     Guid Id,
//     string ServerId,
//     string ServerName,
//     string SourceName,
//     string? ConditionName,
//     string? SubConditionName,
//     string? Message,
//     int Severity,
//     string Priority,
//     string Category,
//     string State,
//     bool ConditionActive,
//     bool Acknowledged,
//     bool IsShelved,
//     bool IsSuppressed,
//     long EventTimeEpochMs,
//     long ActiveTimeEpochMs,
//     long? AckTimeEpochMs,
//     string? AckedByUsername,
//     long? ShelveUntilEpochMs,
//     Guid? CorrelationId,
//     bool IsRootCause,
//     double? ProcessValue,
//     string? ProcessUnit,
//     long ServerReceivedEpochMs,
//     string LogicalAlarmFamilyId,
//     int InstanceKeySchemaVersion,
//     string? AckComment = null,
//     IReadOnlyDictionary<string, object>? OpcAttributes = null
// );

// public record AckLifecyclePayload(
//     Guid AlarmId,
//     string CommandId,
//     string CorrelationId,
//     string? LifecycleId,
//     string? DcsSequenceId,
//     string LifecycleState,
//     string? Detail,
//     long TimestampEpochMs,
//     long? LatencyMs,
//     long? AckRequestedAtEpochMs,
//     string? ActionId = null
// );

// public record AlarmClearedPayload(
//     Guid AlarmId,
//     string SourceName,
//     long ClearedTimeEpochMs
// );

// public record AlarmBulkUpdatePayload(
//     Guid[] AlarmIds,
//     string Action,   // "ACKNOWLEDGED", "SHELVED", etc.
//     long TimestampEpochMs,
//     int Count
// );

// public record FloodAlertPayload(
//     string ServerId,
//     double AlarmsPerTenMin,
//     bool IsFlood,
//     long DetectedAtEpochMs
// );

// public record ServerStatusPayload(
//     string ServerId,
//     string ServerName,
//     bool IsConnected,
//     string? Error,
//     long TimestampEpochMs
// );

// public record SoeEventPayload(
//     long Id,
//     string SourceName,
//     string ServerId,
//     long SourceTimestampEpochMs,
//     int Severity,
//     string Priority,
//     string Message,
//     bool ConditionActive,
//     bool IsOutOfOrder
// );

// public record AnalyticsUpdatePayload(
//     string ServerId,
//     double AlarmsPerTenMin,
//     int TotalActive,
//     int TotalCritical,
//     int TotalUnacknowledged,
//     bool FloodActive,
//     long TimestampEpochMs
// );

// public record HubConnectionInfo(
//     string ConnectionId,
//     string UserId,
//     string Role,
//     DateTimeOffset ConnectedAt,
//     DateTimeOffset ServerTime
// );

// public record HeartbeatPayload(
//     long ServerTimeEpochMs,
//     int ConnectedClients
// );

// public record AlarmHubConnection(
//     string ConnectionId,
//     string UserId,
//     string Role,
//     string? OperatorStation,
//     DateTimeOffset ConnectedAt
// );

// /// <summary>
// /// SignalR publisher service — bridges domain events → real-time clients
// /// </summary>
// public sealed class AlarmSignalRPublisher : AMS.Application.Alarms.Commands.IAlarmSignalRPublisher
// {
//     private readonly IHubContext<AlarmHub, IAlarmHubClient> _hub;
//     private readonly ILogger<AlarmSignalRPublisher> _logger;

//     public AlarmSignalRPublisher(
//         IHubContext<AlarmHub, IAlarmHubClient> hub,
//         ILogger<AlarmSignalRPublisher> logger)
//     {
//         _hub    = hub;
//         _logger = logger;
//     }

//     public async Task PublishNewAlarmAsync(ActiveAlarm alarm, CancellationToken ct = default)
//     {
//         var payload = MapToPayload(alarm);

//         // Broadcast to all connections
//         await _hub.Clients.All.OnNewAlarm(payload);

//         // Priority group
//         await _hub.Clients.Group($"alarms-{alarm.Priority.ToString().ToUpper()}")
//             .OnNewAlarm(payload);

//         // Server group
//         await _hub.Clients.Group($"server-{alarm.ServerId}")
//             .OnNewAlarm(payload);
//     }

//     public async Task PublishAlarmUpdatedAsync(ActiveAlarm alarm, CancellationToken ct = default)
//     {
//         var payload = MapToPayload(alarm);
//         await _hub.Clients.All.OnAlarmUpdated(payload);
//         await _hub.Clients.Group($"server-{alarm.ServerId}").OnAlarmUpdated(payload);
//     }

//     public async Task PublishBulkAlarmsUpdatedAsync(IEnumerable<ActiveAlarm> alarms, CancellationToken ct = default)
//     {
//         var list  = alarms.ToList();
//         var ids   = list.Select(a => a.Id).ToArray();
//         var bulk  = new AlarmBulkUpdatePayload(ids, "ACKNOWLEDGED", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ids.Length);
//         await _hub.Clients.All.OnBulkAlarmsUpdated(bulk);
//     }

//     public async Task PublishAlarmClearedAsync(Guid alarmId, string sourceName, DateTimeOffset clearedTime, CancellationToken ct = default)
//     {
//         var payload = new AlarmClearedPayload(alarmId, sourceName, clearedTime.ToUnixTimeMilliseconds());
//         await _hub.Clients.All.OnAlarmCleared(payload);
//     }

//     public async Task PublishFloodAlertAsync(Guid serverId, double rate, CancellationToken ct = default)
//     {
//         var payload = new FloodAlertPayload(
//             serverId.ToString(), rate, rate > 10, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
//         await _hub.Clients.All.OnFloodAlert(payload);
//     }

//     public async Task PublishConnectionStatusAsync(Guid serverId, bool connected, CancellationToken ct = default)
//     {
//         var payload = new ServerStatusPayload(
//             serverId.ToString(), string.Empty, connected, null,
//             DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
//         await _hub.Clients.All.OnServerStatusChanged(payload);
//     }

//     public async Task PublishAckLifecycleAsync(
//         Guid alarmId,
//         string commandId,
//         string correlationId,
//         string? lifecycleId,
//         string? dcsSequenceId,
//         string lifecycleState,
//         string? detail,
//         long timestampEpochMs,
//         long? latencyMs,
//         CancellationToken ct = default)
//     {
//         var payload = new AckLifecyclePayload(
//             alarmId, commandId, correlationId, lifecycleId, dcsSequenceId,
//             lifecycleState, detail, timestampEpochMs, latencyMs, null, commandId);
//         await _hub.Clients.All.OnAckLifecycleUpdated(payload);
//     }

//     public async Task PublishLoopKpiAsync(AMS.Api.BackgroundServices.LoopKpiPayload payload, CancellationToken ct = default)
//     {
//         await _hub.Clients.All.OnLoopKpiUpdate(payload);
//     }

//     public async Task PublishAlarmKpiAsync(AMS.Api.BackgroundServices.AlarmKpiPayload payload, CancellationToken ct = default)
//     {
//         await _hub.Clients.All.OnAlarmKpiUpdate(payload);
//     }

//     private static AlarmHubPayload MapToPayload(ActiveAlarm a) => new(
//         Id:                    a.Id,
//         ServerId:              a.ServerId.ToString(),
//         ServerName:            string.Empty,
//         SourceName:            a.SourceName,
//         ConditionName:         a.ConditionName,
//         SubConditionName:      a.SubConditionName,
//         Message:               a.Message,
//         Severity:              a.Severity,
//         Priority:              a.Priority.ToString().ToUpper(),
//         Category:              a.Category.ToString().ToUpper(),
//         State:                 ConvertState(a.State),
//         ConditionActive:       a.ConditionActive,
//         Acknowledged:          a.Acknowledged,
//         IsShelved:             a.IsShelved,
//         IsSuppressed:          a.IsSuppressed,
//         EventTimeEpochMs:      a.EventTime.ToUnixTimeMilliseconds(),
//         ActiveTimeEpochMs:     a.ActiveTime.ToUnixTimeMilliseconds(),
//         AckTimeEpochMs:        a.AckTime?.ToUnixTimeMilliseconds(),
//         AckedByUsername:       null,
//         ShelveUntilEpochMs:    a.ShelveUntil?.ToUnixTimeMilliseconds(),
//         CorrelationId:         a.CorrelationId,
//         IsRootCause:           a.IsRootCause,
//         ProcessValue:          a.ProcessValue,
//         ProcessUnit:           a.ProcessUnit,
//         ServerReceivedEpochMs: a.ServerReceivedAt.ToUnixTimeMilliseconds(),
//         LogicalAlarmFamilyId:  AlarmPartitionKeys.LogicalAlarmFamilyId(
//             a.ServerId, a.SourceName, a.ConditionName ?? "", a.SubConditionName),
//         InstanceKeySchemaVersion: AlarmPartitionKeys.InstanceKeySchemaVersion,
//         AckComment:            a.AckComment
//     );

//     private static string ConvertState(AlarmState s) => s switch
//     {
//         AlarmState.UnacknowledgedUncleared => "UNACKNOWLEDGED_UNCLEARED",
//         AlarmState.AcknowledgedUncleared   => "ACKNOWLEDGED_UNCLEARED",
//         AlarmState.UnacknowledgedCleared   => "UNACKNOWLEDGED_CLEARED",
//         AlarmState.AcknowledgedCleared     => "ACKNOWLEDGED_CLEARED",
//         AlarmState.Shelved                 => "SHELVED",
//         AlarmState.SuppressedByDesign      => "SUPPRESSED_BY_DESIGN",
//         AlarmState.OutOfService            => "OUT_OF_SERVICE",
//         AlarmState.Inhibited               => "INHIBITED",
//         _                                  => "UNKNOWN"
//     };
// }

