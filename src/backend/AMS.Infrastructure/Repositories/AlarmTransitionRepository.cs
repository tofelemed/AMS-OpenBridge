using AMS.Domain.Repositories;
using Dapper;
using Npgsql;

namespace AMS.Infrastructure.Repositories;

public sealed class AlarmTransitionRepository : IAlarmTransitionRepository
{
    private readonly NpgsqlDataSource _dataSource;

    public AlarmTransitionRepository(NpgsqlDataSource dataSource) => _dataSource = dataSource;

    public async Task<AlarmTransitionQueryResult> QueryAsync(AlarmTransitionQuery query, CancellationToken ct = default)
    {
        var conditions = new List<string> { "transition_time BETWEEN @From AND @To" };
        var parameters = new DynamicParameters();
        parameters.Add("From", query.From);
        parameters.Add("To", query.To);
        parameters.Add("Limit", query.PageSize);
        parameters.Add("Offset", (query.PageNumber - 1) * query.PageSize);

        if (query.AlarmId.HasValue)
        {
            conditions.Add("alarm_id = @AlarmId");
            parameters.Add("AlarmId", query.AlarmId.Value);
        }

        if (query.ServerId.HasValue)
        {
            conditions.Add("server_id = @ServerId");
            parameters.Add("ServerId", query.ServerId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.SourceNameContains))
        {
            conditions.Add("source_name ILIKE @SourceName");
            parameters.Add("SourceName", $"%{query.SourceNameContains}%");
        }

        if (!string.IsNullOrWhiteSpace(query.ToState))
        {
            conditions.Add("to_state::TEXT = @ToState");
            parameters.Add("ToState", query.ToState.ToUpperInvariant());
        }

        var where = string.Join(" AND ", conditions);
        var sortCol = query.SortBy switch
        {
            "SourceName" => "source_name",
            "ToState" => "to_state",
            _ => "transition_time"
        };
        var sortDir = query.SortDescending ? "DESC" : "ASC";

        var sql = $@"
            SELECT id, alarm_id, server_id, source_name,
                   from_state::TEXT AS from_state, to_state::TEXT AS to_state,
                   transition_time, triggered_by, trigger_reason, comment
            FROM alarms.alarm_state_transitions
            WHERE {where}
            ORDER BY {sortCol} {sortDir}
            LIMIT @Limit OFFSET @Offset";

        var countSql = $"SELECT COUNT(*) FROM alarms.alarm_state_transitions WHERE {where}";

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var total = await conn.ExecuteScalarAsync<long>(countSql, parameters);
        var items = (await conn.QueryAsync(sql, parameters)).Cast<object>().ToList();
        return new AlarmTransitionQueryResult(items, total, query.PageNumber, query.PageSize);
    }

    public async IAsyncEnumerable<object> StreamAsync(
        AlarmTransitionQuery query,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var sql = @"
            SELECT id, alarm_id, server_id, source_name,
                   from_state::TEXT AS from_state, to_state::TEXT AS to_state,
                   transition_time, triggered_by, trigger_reason, comment
            FROM alarms.alarm_state_transitions
            WHERE transition_time BETWEEN @From AND @To
            ORDER BY transition_time ASC";

        await foreach (var row in conn.QueryUnbufferedAsync(sql, new { query.From, query.To }).WithCancellation(ct))
            yield return row;
    }
}
