using AMS.Domain.Alarms;
using AMS.Domain.Repositories;
using AMS.Infrastructure.Persistence;
using Dapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace AMS.Infrastructure.Repositories;

/// <summary>
/// Production-grade Active Alarm Repository.
/// Uses EF Core for writes, Dapper for complex reads (performance).
/// </summary>
public sealed class ActiveAlarmRepository : IActiveAlarmRepository
{
    private readonly AmsDbContext _ctx;
    private readonly ILogger<ActiveAlarmRepository> _logger;

    public ActiveAlarmRepository(AmsDbContext ctx, ILogger<ActiveAlarmRepository> logger)
    {
        _ctx    = ctx;
        _logger = logger;
    }

    public async Task<ActiveAlarm?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => await _ctx.ActiveAlarms
            .AsSplitQuery()
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id, ct);

    public async Task<ActiveAlarm?> GetByAlarmKeyAsync(string alarmId, CancellationToken ct = default)
        => await _ctx.ActiveAlarms
            .AsSplitQuery()
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.AlarmId == alarmId, ct);

    /// <summary>
    /// DATA-10: this previously honoured only 3 of the 8 advertised filters — ServerId,
    /// Priority, Category, IsShelved and IsSuppressed were accepted by the API surface
    /// and silently ignored, so an operator's filtered view lied. Every filter applies now.
    /// Defaults are unchanged: with no filters, all Active alarms (incl. shelved/suppressed)
    /// are returned, exactly as before.
    /// </summary>
    public async Task<IReadOnlyList<ActiveAlarm>> GetActiveAlarmsAsync(
        ActiveAlarmQuery query, CancellationToken ct = default)
    {
        var q = ApplyActiveFilters(_ctx.ActiveAlarms.AsNoTracking(), query);

        q = query.SortBy switch
        {
            "Severity"   => query.SortDescending ? q.OrderByDescending(a => a.Severity)
                                                 : q.OrderBy(a => a.Severity),
            "SourceName" => query.SortDescending ? q.OrderByDescending(a => a.SourceName)
                                                 : q.OrderBy(a => a.SourceName),
            "Priority"   => query.SortDescending ? q.OrderByDescending(a => a.Priority)
                                                 : q.OrderBy(a => a.Priority),
            _            => query.SortDescending ? q.OrderByDescending(a => a.EventTime)
                                                 : q.OrderBy(a => a.EventTime)
        };

        return await q
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);
    }

    /// <summary>
    /// DATA-10: counts with the SAME filters as the list, so X-Total-Count matches what
    /// the operator is actually paging through (it previously ignored every filter
    /// including the serverId it was handed).
    /// </summary>
    public async Task<int> CountActiveAsync(ActiveAlarmQuery query, CancellationToken ct = default)
        => await ApplyActiveFilters(_ctx.ActiveAlarms.AsNoTracking(), query).CountAsync(ct);

    private static IQueryable<ActiveAlarm> ApplyActiveFilters(IQueryable<ActiveAlarm> q, ActiveAlarmQuery query)
    {
        // Only Active alarms (the invariant this repository serves).
        q = q.Where(a => a.State == AlarmState.UnacknowledgedUncleared || a.State == AlarmState.AcknowledgedUncleared);

        if (query.ServerId.HasValue)
            q = q.Where(a => a.ServerId == query.ServerId.Value);
        if (query.Priority.HasValue)
            q = q.Where(a => a.Priority == query.Priority.Value);
        if (query.State.HasValue)
            q = q.Where(a => a.State == query.State.Value);
        if (query.Category.HasValue)
            q = q.Where(a => a.Category == query.Category.Value);
        if (!string.IsNullOrWhiteSpace(query.SourceNameContains))
            q = q.Where(a => EF.Functions.ILike(a.SourceName, $"%{query.SourceNameContains}%"));
        if (query.IsAcknowledged.HasValue)
            q = q.Where(a => a.Acknowledged == query.IsAcknowledged.Value);
        if (query.IsShelved.HasValue)
            q = q.Where(a => a.IsShelved == query.IsShelved.Value);
        if (query.IsSuppressed.HasValue)
            q = q.Where(a => a.IsSuppressed == query.IsSuppressed.Value);

        return q;
    }

    public Task<ActiveAlarm> AddAsync(ActiveAlarm alarm, CancellationToken ct = default)
    {
        _ctx.ActiveAlarms.Add(alarm);
        return Task.FromResult(alarm);
    }

    public Task UpdateAsync(ActiveAlarm alarm, CancellationToken ct = default)
    {
        _ctx.ActiveAlarms.Update(alarm);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var alarm = await _ctx.ActiveAlarms.FindAsync(new object[] { id }, ct);
        if (alarm is not null) _ctx.ActiveAlarms.Remove(alarm);
    }

    public async Task<int> PurgeLabInjectedAlarmsAsync(Guid? serverId = null, CancellationToken ct = default)
    {
        var q = _ctx.ActiveAlarms.Where(a =>
            (a.Message != null && EF.Functions.ILike(a.Message, "%Autonomous storm%"))
            || a.SourceName.Contains("/")
            || EF.Functions.ILike(a.SourceName, "Kiln/%")
            || EF.Functions.ILike(a.SourceName, "Separator/%")
            || EF.Functions.ILike(a.SourceName, "Compressor/%"));

        var removed = await q.ExecuteDeleteAsync(ct);
        _logger.LogInformation("Purged {Count} lab-injected active alarms", removed);
        return removed;
    }

    public async Task<IReadOnlyList<ActiveAlarm>> GetBySourceNameAsync(
        Guid serverId, string sourceName, CancellationToken ct = default)
        => await _ctx.ActiveAlarms
            .AsNoTracking()
            .Where(a => a.SourceName == sourceName)
            .ToListAsync(ct);

    /// <summary>
    /// Ingest-path lookup. DATA-01: this MUST filter on serverId — it previously accepted the
    /// parameter and ignored it, so an alarm from one OPC server could match and overwrite a
    /// same-named tag from another. Backed by uq_alarm_current_identity, whose leading columns
    /// are (server_id, source), so this is an index probe rather than a sequential scan.
    /// </summary>
    public async Task<IReadOnlyList<ActiveAlarm>> GetBySourceNameForIngestAsync(
        Guid serverId, string sourceName, CancellationToken ct = default)
        => await _ctx.ActiveAlarms
            .Where(a => a.ServerId == serverId && a.SourceName == sourceName)
            .ToListAsync(ct);

    // Plan 10 A4: GetUnacknowledgedAsync, GetShelvedExpiredAsync and GetByCorrelationIdAsync
    // removed with their interface members — zero callers anywhere in the solution.
}

/// <summary>
/// Historical Alarm Repository - optimized for TimescaleDB time-series queries.
/// Uses Dapper for high-performance bulk reads.
/// </summary>
public sealed class HistoricalAlarmRepository : IHistoricalAlarmRepository
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<HistoricalAlarmRepository> _logger;

    public HistoricalAlarmRepository(NpgsqlDataSource dataSource, ILogger<HistoricalAlarmRepository> logger)
    {
        _dataSource = dataSource;
        _logger     = logger;
    }

    public async Task<HistoricalAlarmQueryResult> QueryAsync(
        HistoricalAlarmQuery query, CancellationToken ct = default)
    {
        var conditions = new List<string>
        {
            "event_time BETWEEN @From AND @To"
        };
        var parameters = new DynamicParameters();
        parameters.Add("From", query.From);
        parameters.Add("To", query.To);
        parameters.Add("Offset", (query.PageNumber - 1) * query.PageSize);
        parameters.Add("Limit", query.PageSize);

        if (query.State.HasValue)
        {
            conditions.Add("state = @State");
            parameters.Add("State", ConvertState(query.State.Value));
        }

        if (!string.IsNullOrWhiteSpace(query.SourceNameContains))
        {
            conditions.Add("source ILIKE @SourceName");
            parameters.Add("SourceName", $"%{query.SourceNameContains}%");
        }

        if (query.IsAcknowledged.HasValue)
        {
            conditions.Add("ack_status = @Acked");
            parameters.Add("Acked", query.IsAcknowledged.Value);
        }

        // audit-jobs.md C4/F-9: Priority was accepted by the controller, carried
        // through the query record, and then never appeared in the SQL — the
        // Historical Viewer sends it on every request. History stores severity,
        // so filter on the same bands the active-alarm projection uses.
        if (query.Priority.HasValue)
        {
            var (sevMin, sevMax) = query.Priority.Value switch
            {
                AlarmPriority.Critical   => (900, 1000),
                AlarmPriority.High       => (700, 899),
                AlarmPriority.Medium     => (400, 699),
                AlarmPriority.Low        => (100, 399),
                _                        => (0, 99),
            };
            conditions.Add("severity BETWEEN @SevMin AND @SevMax");
            parameters.Add("SevMin", sevMin);
            parameters.Add("SevMax", sevMax);
        }
        // ServerId / Category remain unfilterable: alarm_history has no such
        // columns (single-feed lab). Deliberately not silently dropped anymore —
        // documented here and surfaced in the controller docs.

        var where  = string.Join(" AND ", conditions);
        var sortDir = query.SortDescending ? "DESC" : "ASC";
        var sortCol = query.SortBy switch
        {
            "SourceName" => "source",
            "Severity"   => "severity",
            _            => "event_time"
        };

        // audit-jobs.md F-8: rows are serialized as Dapper dictionaries and MVC's
        // CamelCase policy does NOT apply to dictionary keys — the old snake_case
        // aliases (source_name, alarm_state, event_time) reached the frontend
        // verbatim, whose mapper reads camelCase, so Source/Condition/State/Time
        // rendered blank. Quoted camelCase aliases fix the contract at the source.
        // priority is derived here (same severity bands as the active projection)
        // because the mapper otherwise defaults every row to LOW.
        var sql = $@"
            SELECT
                id,
                'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::UUID AS ""serverId"",
                source AS ""sourceName"",
                condition AS ""conditionName"",
                sub_condition AS ""subConditionName"",
                message, severity,
                CASE WHEN severity >= 900 THEN 'CRITICAL'
                     WHEN severity >= 700 THEN 'HIGH'
                     WHEN severity >= 400 THEN 'MEDIUM'
                     WHEN severity >= 100 THEN 'LOW'
                     ELSE 'DIAGNOSTIC' END AS priority,
                state,
                ack_status AS acknowledged,
                event_time AS ""eventTime"",
                event_time AS ""activeTime"",
                cleared_time AS ""clearedTime""
            FROM alarms.alarm_history
            WHERE {where}
            ORDER BY {sortCol} {sortDir}
            LIMIT @Limit OFFSET @Offset";

        var countSql = $"SELECT COUNT(*) FROM alarms.alarm_history WHERE {where}";

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var total = await conn.ExecuteScalarAsync<long>(countSql, parameters);
        var items = (await conn.QueryAsync(sql, parameters)).ToList();

        return new HistoricalAlarmQueryResult(
            items.Cast<object>().ToList(),
            total,
            query.PageNumber,
            query.PageSize
        );
    }

    public async Task<long> CountAsync(HistoricalAlarmQuery query, CancellationToken ct = default)
    {
        // DATA-06: this counted alarms.historical_alarms while QueryAsync/StreamAsync read
        // alarms.alarm_history — so paging totals described a different table than the rows.
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<long>(
            "SELECT COUNT(*) FROM alarms.alarm_history WHERE event_time BETWEEN @From AND @To",
            new { query.From, query.To });
    }

    /// <summary>
    /// DATA-06: the writer alarms.alarm_history never had. Called after the projection batch
    /// has been durably persisted, so history only records events that actually landed.
    /// </summary>
    public async Task AppendHistoryAsync(IReadOnlyList<AlarmHistoryRecord> records, CancellationToken ct = default)
    {
        if (records.Count == 0) return;

        const string sql = @"
            INSERT INTO alarms.alarm_history
                (alarm_id, source, severity, message, condition, sub_condition,
                 event_time, state, ack_status, cleared_time)
            VALUES
                (@AlarmId, @Source, @Severity, @Message, @Condition, @SubCondition,
                 @EventTime, @State, @AckStatus, @ClearedTime)";

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(sql, records, cancellationToken: ct));
    }

    // Plan 10 A4: BulkInsertAsync (COPY into alarms.historical_alarms) removed — zero
    // callers; that table's write path was dead. Table fate = plan item A7 decision.

    public async IAsyncEnumerable<object> StreamAsync(
        HistoricalAlarmQuery query,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        // Same camelCase contract as QueryAsync (F-8).
        var sql = @"
            SELECT id, source AS ""sourceName"", severity,
                   state, event_time AS ""eventTime"", event_time AS ""activeTime"",
                   cleared_time AS ""clearedTime"", message, ack_status AS acknowledged
            FROM alarms.alarm_history
            WHERE event_time BETWEEN @From AND @To
            ORDER BY event_time DESC";

        await foreach (var row in conn.QueryUnbufferedAsync(sql, new { query.From, query.To }).WithCancellation(ct))
            yield return row;
    }

    /// <summary>
    /// audit-jobs.md F-9: the projection writes state as ACTIVE / ACKNOWLEDGED /
    /// CLEARED (NormalizedAlarmConsumerService.BuildHistoryRecords), but this
    /// filter compared against the ISA vocabulary (UNACKNOWLEDGED_UNCLEARED, …)
    /// that no writer ever stores — every state-filtered query returned zero rows.
    /// Map to the STORED vocabulary.
    /// </summary>
    private static string ConvertState(AlarmState state) => state switch
    {
        AlarmState.UnacknowledgedUncleared => "ACTIVE",
        AlarmState.AcknowledgedUncleared   => "ACKNOWLEDGED",
        AlarmState.UnacknowledgedCleared   => "CLEARED",
        AlarmState.AcknowledgedCleared     => "CLEARED",
        AlarmState.Shelved                 => "SHELVED",
        AlarmState.SuppressedByDesign      => "SUPPRESSED",
        AlarmState.OutOfService            => "OUT_OF_SERVICE",
        AlarmState.Inhibited               => "INHIBITED",
        _                                  => "ACTIVE"
    };
}
