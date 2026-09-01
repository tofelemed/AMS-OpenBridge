using AMS.Domain.Alarms;
using AMS.Domain.Repositories;
using MediatR;
using Microsoft.Extensions.Logging;

namespace AMS.Application.Alarms.Queries;

// ============================================================
// Get Active Alarms Query (CQRS)
// ============================================================

public record GetActiveAlarmsQuery(
    Guid? ServerId = null,
    AlarmPriority? Priority = null,
    AlarmState? State = null,
    AlarmCategory? Category = null,
    string? SourceNameContains = null,
    bool? IsAcknowledged = null,
    bool? IsShelved = null,
    bool? IsSuppressed = null,
    int PageNumber = 1,
    int PageSize = 100,
    string SortBy = "EventTime",
    bool SortDescending = true
) : IRequest<ActiveAlarmListResult>;

public record ActiveAlarmDto(
    Guid Id,
    Guid ServerId,
    string ServerName,
    string SourceName,
    string? ConditionName,
    string? SubConditionName,
    string? Message,
    int Severity,
    AlarmPriority Priority,
    AlarmCategory Category,
    string PriorityLabel,
    string StateLabel,
    AlarmState State,
    bool ConditionActive,
    bool Acknowledged,
    bool IsShelved,
    bool IsSuppressed,
    bool IsOutOfService,
    bool QualityGood,
    DateTimeOffset EventTime,
    DateTimeOffset ActiveTime,
    DateTimeOffset? AckTime,
    string? AckedByUsername,
    string? AckComment,
    DateTimeOffset? ShelveUntil,
    string? ShelveComment,
    string? SuppressionReason,
    Guid? CorrelationId,
    bool IsRootCause,
    double? ProcessValue,
    string? ProcessUnit,
    Dictionary<string, object> OpcAttributes,
    TimeSpan? TimeInAlarm,
    string? AreaPath,
    DateTimeOffset ServerReceivedAt,
    string LogicalAlarmFamilyId,
    int InstanceKeySchemaVersion,
    /// <summary>Ack-lifecycle projection (ackLifecycleState, …) — the frontend
    /// mapper already read customAttributes.ackLifecycleState; the DTO just
    /// never carried it, so the ACK column reset on every rehydrate (F-3).</summary>
    Dictionary<string, object>? CustomAttributes = null
);

public record ActiveAlarmListResult(
    IReadOnlyList<ActiveAlarmDto> Items,
    long TotalCount,
    int PageNumber,
    int PageSize,
    AlarmStatsSummary Summary
);

public record AlarmStatsSummary(
    long TotalActive,
    long TotalCritical,
    long TotalHigh,
    long TotalMedium,
    long TotalLow,
    long Unacknowledged,
    long Shelved,
    long Suppressed,
    double AlarmsPerTenMin,
    bool FloodActive
);

public class GetActiveAlarmsQueryHandler : IRequestHandler<GetActiveAlarmsQuery, ActiveAlarmListResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IAlarmEnricher _enricher;
    private readonly ILogger<GetActiveAlarmsQueryHandler> _logger;

    public GetActiveAlarmsQueryHandler(
        IUnitOfWork uow,
        IAlarmEnricher enricher,
        ILogger<GetActiveAlarmsQueryHandler> logger)
    {
        _uow      = uow;
        _enricher = enricher;
        _logger   = logger;
    }

    public async Task<ActiveAlarmListResult> Handle(GetActiveAlarmsQuery request, CancellationToken ct)
    {
        var query = new ActiveAlarmQuery(
            ServerId:           request.ServerId,
            Priority:           request.Priority,
            State:              request.State,
            Category:           request.Category,
            SourceNameContains: request.SourceNameContains,
            IsAcknowledged:     request.IsAcknowledged,
            IsShelved:          request.IsShelved,
            IsSuppressed:       request.IsSuppressed,
            PageNumber:         request.PageNumber,
            PageSize:           Math.Min(request.PageSize, 1000),
            SortBy:             request.SortBy,
            SortDescending:     request.SortDescending
        );

        var alarms = await _uow.ActiveAlarms.GetActiveAlarmsAsync(query, ct);
        // DATA-10: count with the same filters as the list — X-Total-Count previously
        // reported the unfiltered total whenever any filter was set.
        var total  = await _uow.ActiveAlarms.CountActiveAsync(query, ct);

        // Enrich with server names, area paths
        var dtos = await _enricher.EnrichAsync(alarms, ct);

        var summary = await _enricher.GetStatsSummaryAsync(request.ServerId, ct);

        return new ActiveAlarmListResult(dtos, total, request.PageNumber, query.PageSize, summary);
    }
}

// ============================================================
// Get Historical Alarms Query
// ============================================================

public record GetHistoricalAlarmsQuery(
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
) : IRequest<HistoricalAlarmListResult>;

public record HistoricalAlarmListResult(
    IReadOnlyList<object> Items,
    long TotalCount,
    int PageNumber,
    int PageSize
);

/// <summary>
/// Handles historical alarm query requests.
/// </summary>
public class GetHistoricalAlarmsQueryHandler : IRequestHandler<GetHistoricalAlarmsQuery, HistoricalAlarmListResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ILogger<GetHistoricalAlarmsQueryHandler> _logger;

    /// <summary>
    /// Creates a new <see cref="GetHistoricalAlarmsQueryHandler"/> instance.
    /// </summary>
    public GetHistoricalAlarmsQueryHandler(IUnitOfWork uow, ILogger<GetHistoricalAlarmsQueryHandler> logger)
    {
        _uow    = uow;
        _logger = logger;
    }

    /// <summary>
    /// Executes historical alarm retrieval for the requested filter window.
    /// </summary>
    public async Task<HistoricalAlarmListResult> Handle(GetHistoricalAlarmsQuery request, CancellationToken ct)
    {
        // Validate time range
        if (request.To <= request.From)
            throw new ArgumentException("'To' must be after 'From'");
        if ((request.To - request.From).TotalDays > 365)
            throw new ArgumentException("Time range cannot exceed 365 days in a single query");

        var query = new HistoricalAlarmQuery(
            From:                request.From,
            To:                  request.To,
            ServerId:            request.ServerId,
            Priority:            request.Priority,
            Category:            request.Category,
            State:               request.State,
            SourceNameContains:  request.SourceNameContains,
            IsAcknowledged:      request.IsAcknowledged,
            PageNumber:          request.PageNumber,
            PageSize:            Math.Min(request.PageSize, 5000),
            SortBy:              request.SortBy,
            SortDescending:      request.SortDescending
        );

        var result = await _uow.HistoricalAlarms.QueryAsync(query, ct);

        return new HistoricalAlarmListResult(
            result.Items, result.TotalCount, result.PageNumber, result.PageSize);
    }
}

// ============================================================
// Get Alarm Statistics Query
// ============================================================

/// <summary>
/// Query to fetch alarm statistics summary.
/// </summary>
/// <param name="ServerId">Optional server filter. When null, returns global statistics.</param>
public record GetAlarmStatisticsQuery(Guid? ServerId = null) : IRequest<AlarmStatsSummary>;

/// <summary>
/// Handles alarm statistics summary requests.
/// </summary>
public class GetAlarmStatisticsHandler : IRequestHandler<GetAlarmStatisticsQuery, AlarmStatsSummary>
{
    private readonly IAlarmEnricher _enricher;
    /// <summary>
    /// Creates a new <see cref="GetAlarmStatisticsHandler"/> instance.
    /// </summary>
    public GetAlarmStatisticsHandler(IAlarmEnricher enricher) => _enricher = enricher;

    /// <summary>
    /// Returns the current alarm statistics summary.
    /// </summary>
    public Task<AlarmStatsSummary> Handle(GetAlarmStatisticsQuery request, CancellationToken ct)
        => _enricher.GetStatsSummaryAsync(request.ServerId, ct);
}

/// <summary>
/// Alarm enrichment service - fetches related data (server names, area paths, user names)
/// </summary>
public interface IAlarmEnricher
{
    /// <summary>
    /// Enriches alarms with related metadata such as server names and area paths.
    /// </summary>
    Task<IReadOnlyList<ActiveAlarmDto>> EnrichAsync(IEnumerable<ActiveAlarm> alarms, CancellationToken ct = default);

    /// <summary>
    /// Gets aggregate alarm statistics for a specific server or for all servers.
    /// </summary>
    Task<AlarmStatsSummary> GetStatsSummaryAsync(Guid? serverId, CancellationToken ct = default);
}
