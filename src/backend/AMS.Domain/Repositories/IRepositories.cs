using AMS.Domain.Alarms;

namespace AMS.Domain.Repositories;

/// <summary>
/// Repository contract for active alarms.
/// Follows Repository pattern from DDD.
/// </summary>
public interface IActiveAlarmRepository
{
    Task<ActiveAlarm?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<ActiveAlarm>> GetActiveAlarmsAsync(
        ActiveAlarmQuery query, CancellationToken ct = default);
    /// <summary>Counts with the SAME filters as GetActiveAlarmsAsync so totals match the page (DATA-10).</summary>
    Task<int> CountActiveAsync(ActiveAlarmQuery query, CancellationToken ct = default);
    Task<ActiveAlarm> AddAsync(ActiveAlarm alarm, CancellationToken ct = default);
    Task UpdateAsync(ActiveAlarm alarm, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
    /// <summary>Removes lab/storm-injected rows (Autonomous storm, hierarchical StreamPipes paths).</summary>
    Task<int> PurgeLabInjectedAlarmsAsync(Guid? serverId = null, CancellationToken ct = default);
    Task<IReadOnlyList<ActiveAlarm>> GetBySourceNameAsync(
        Guid serverId, string sourceName, CancellationToken ct = default);
    /// <summary>Tracked load for Kafka ingest (mutates opc_attributes).</summary>
    Task<IReadOnlyList<ActiveAlarm>> GetBySourceNameForIngestAsync(
        Guid serverId, string sourceName, CancellationToken ct = default);
    Task<IReadOnlyList<ActiveAlarm>> GetUnacknowledgedAsync(
        Guid? serverId = null, AlarmPriority? minPriority = null, CancellationToken ct = default);
    Task<IReadOnlyList<ActiveAlarm>> GetShelvedExpiredAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ActiveAlarm>> GetByCorrelationIdAsync(Guid correlationId, CancellationToken ct = default);
}

/// <summary>
/// Repository contract for historical alarms.
/// Optimized for TimescaleDB time-range queries.
/// </summary>
public interface IHistoricalAlarmRepository
{
    Task<HistoricalAlarmQueryResult> QueryAsync(
        HistoricalAlarmQuery query, CancellationToken ct = default);
    Task<long> CountAsync(HistoricalAlarmQuery query, CancellationToken ct = default);
    Task BulkInsertAsync(IEnumerable<object> records, CancellationToken ct = default);
    IAsyncEnumerable<object> StreamAsync(HistoricalAlarmQuery query, CancellationToken ct = default);

    /// <summary>
    /// Appends processed alarm events to alarms.alarm_history (DATA-06).
    /// Until this existed the table had readers — the KPI dashboard and history
    /// search — but no writer anywhere in the repository, so both surfaces read
    /// a permanently empty table.
    /// </summary>
    Task AppendHistoryAsync(IReadOnlyList<AlarmHistoryRecord> records, CancellationToken ct = default);
}

/// <summary>One row of the append-only alarm event log (alarms.alarm_history).</summary>
public record AlarmHistoryRecord(
    string AlarmId,
    string Source,
    int Severity,
    string? Message,
    string? Condition,
    string? SubCondition,
    DateTimeOffset EventTime,
    string State,
    bool AckStatus,
    DateTimeOffset? ClearedTime);

/// <summary>
/// Repository contract for SOE events.
/// </summary>
public interface ISoeEventRepository
{
    Task<SoeEventQueryResult> QueryAsync(SoeEventQuery query, CancellationToken ct = default);
    IAsyncEnumerable<object> StreamReplayAsync(
        DateTimeOffset from, DateTimeOffset to, Guid[] serverIds, CancellationToken ct = default);
}

/// <summary>
/// Repository for OPC server configurations.
/// </summary>
public interface IOpcServerRepository
{
    Task<IReadOnlyList<OpcServerConfig>> GetAllEnabledAsync(CancellationToken ct = default);
    Task<OpcServerConfig?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<OpcServerConfig> AddAsync(OpcServerConfig server, CancellationToken ct = default);
    Task UpdateAsync(OpcServerConfig server, CancellationToken ct = default);
    Task UpdateConnectionStateAsync(Guid id, bool isConnected, string? error, CancellationToken ct = default);
    Task UpdateHeartbeatAsync(Guid id, CancellationToken ct = default);
}

/// <summary>
/// Unit of Work pattern - wraps all repositories in single transaction.
/// </summary>
public interface IUnitOfWork
{
    IActiveAlarmRepository ActiveAlarms { get; }
    IHistoricalAlarmRepository HistoricalAlarms { get; }
    ISoeEventRepository SoeEvents { get; }
    IOpcServerRepository OpcServers { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
    Task BeginTransactionAsync(CancellationToken ct = default);
    Task CommitTransactionAsync(CancellationToken ct = default);
    Task RollbackTransactionAsync(CancellationToken ct = default);
}

// ---- Query parameter records ----

public record ActiveAlarmQuery(
    Guid? ServerId = null,
    AlarmPriority? Priority = null,
    AlarmState? State = null,
    AlarmCategory? Category = null,
    string? SourceNameContains = null,
    bool? IsAcknowledged = null,
    bool? IsShelved = null,
    bool? IsSuppressed = null,
    Guid? CorrelationId = null,
    int PageNumber = 1,
    int PageSize = 100,
    string SortBy = "EventTime",
    bool SortDescending = true,
    Guid[]? AreaIds = null
);

public record HistoricalAlarmQuery(
    DateTimeOffset From,
    DateTimeOffset To,
    Guid? ServerId = null,
    AlarmPriority? Priority = null,
    AlarmCategory? Category = null,
    AlarmState? State = null,
    string? SourceNameContains = null,
    bool? IsAcknowledged = null,
    int PageNumber = 1,
    int PageSize = 200,
    string SortBy = "EventTime",
    bool SortDescending = true
);

public record HistoricalAlarmQueryResult(
    IReadOnlyList<object> Items,
    long TotalCount,
    int PageNumber,
    int PageSize
);

public record SoeEventQuery(
    DateTimeOffset From,
    DateTimeOffset To,
    Guid? ServerId = null,
    string[]? SourceNames = null,
    int PageNumber = 1,
    int PageSize = 500
);

public record SoeEventQueryResult(
    IReadOnlyList<object> Items,
    long TotalCount,
    int PageNumber,
    int PageSize,
    bool HasSequenceGaps
);

// Placeholder record — OpcServerConfig lives in Infrastructure
public record OpcServerConfig(Guid Id);
