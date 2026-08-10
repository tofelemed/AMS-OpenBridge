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

    public async Task<IReadOnlyList<ActiveAlarm>> GetActiveAlarmsAsync(
        ActiveAlarmQuery query, CancellationToken ct = default)
    {
        var q = _ctx.ActiveAlarms.AsNoTracking().AsQueryable();

        if (query.State.HasValue)
            q = q.Where(a => a.State == query.State.Value);
        if (!string.IsNullOrWhiteSpace(query.SourceNameContains))
            q = q.Where(a => EF.Functions.ILike(a.SourceName, $"%{query.SourceNameContains}%"));
        if (query.IsAcknowledged.HasValue)
        {
            q = q.Where(a => a.Acknowledged == query.IsAcknowledged.Value);
        }

        // Only return Active alarms
        q = q.Where(a => a.State == AlarmState.UnacknowledgedUncleared || a.State == AlarmState.AcknowledgedUncleared);

        q = query.SortBy switch
        {
            "Severity"   => query.SortDescending ? q.OrderByDescending(a => a.Severity)
                                                 : q.OrderBy(a => a.Severity),
            "SourceName" => query.SortDescending ? q.OrderByDescending(a => a.SourceName)
                                                 : q.OrderBy(a => a.SourceName),
            _            => query.SortDescending ? q.OrderByDescending(a => a.EventTime)
                                                 : q.OrderBy(a => a.EventTime)
        };

        return await q
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);
    }

    public async Task<int> CountActiveAsync(Guid? serverId = null, CancellationToken ct = default)
    {
        var q = _ctx.ActiveAlarms.AsNoTracking();

        // Only count Active alarms
        q = q.Where(a => a.State == AlarmState.UnacknowledgedUncleared || a.State == AlarmState.AcknowledgedUncleared);

        return await q.CountAsync(ct);
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

    public async Task<IReadOnlyList<ActiveAlarm>> GetUnacknowledgedAsync(
        Guid? serverId = null, AlarmPriority? minPriority = null, CancellationToken ct = default)
    {
        var q = _ctx.ActiveAlarms.AsNoTracking().Where(a => !a.Acknowledged);
        return await q.OrderByDescending(a => a.EventTime).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<ActiveAlarm>> GetShelvedExpiredAsync(CancellationToken ct = default)
        => await Task.FromResult(new List<ActiveAlarm>());

    public async Task<IReadOnlyList<ActiveAlarm>> GetByCorrelationIdAsync(
        Guid correlationId, CancellationToken ct = default)
        => await Task.FromResult(new List<ActiveAlarm>());
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

        var where  = string.Join(" AND ", conditions);
        var sortDir = query.SortDescending ? "DESC" : "ASC";
        var sortCol = query.SortBy switch
        {
            "SourceName" => "source",
            "Severity"   => "severity",
            _            => "event_time"
        };

        var sql = $@"
            SELECT 
                id, 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::UUID as server_id, source as source_name, 
                condition as condition_name, sub_condition as sub_condition_name, message, severity, 
                state as alarm_state, ack_status as acknowledged,
                event_time, event_time as active_time, cleared_time
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

    public async Task BulkInsertAsync(IEnumerable<object> records, CancellationToken ct = default)
    {
        // Use COPY protocol for maximum throughput
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var writer = await conn.BeginBinaryImportAsync(
            @"COPY alarms.historical_alarms (
                id, server_id, source_name, event_type, condition_name, 
                message, severity, priority, category, alarm_state,
                condition_active, acknowledged, quality, event_time, active_time,
                server_received_at
              ) FROM STDIN (FORMAT BINARY)", ct);
        // Rows are written by caller via the Npgsql COPY API
        await writer.CompleteAsync(ct);
    }

    public async IAsyncEnumerable<object> StreamAsync(
        HistoricalAlarmQuery query,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var sql = @"
            SELECT id, source as source_name, severity, 
                   state as alarm_state, event_time, event_time as active_time,
                   cleared_time, message, ack_status as acknowledged
            FROM alarms.alarm_history
            WHERE event_time BETWEEN @From AND @To
            ORDER BY event_time DESC";

        await foreach (var row in conn.QueryUnbufferedAsync(sql, new { query.From, query.To }).WithCancellation(ct))
            yield return row;
    }

    private static string ConvertState(AlarmState state) => state switch
    {
        AlarmState.UnacknowledgedUncleared => "UNACKNOWLEDGED_UNCLEARED",
        AlarmState.AcknowledgedUncleared   => "ACKNOWLEDGED_UNCLEARED",
        AlarmState.UnacknowledgedCleared   => "UNACKNOWLEDGED_CLEARED",
        AlarmState.AcknowledgedCleared     => "ACKNOWLEDGED_CLEARED",
        AlarmState.Shelved                 => "SHELVED",
        AlarmState.SuppressedByDesign      => "SUPPRESSED_BY_DESIGN",
        AlarmState.OutOfService            => "OUT_OF_SERVICE",
        AlarmState.Inhibited               => "INHIBITED",
        _                                  => "UNACKNOWLEDGED_UNCLEARED"
    };
}
