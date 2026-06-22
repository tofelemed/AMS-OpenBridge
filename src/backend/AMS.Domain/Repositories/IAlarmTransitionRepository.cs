using AMS.Domain.Repositories;

namespace AMS.Domain.Repositories;

public interface IAlarmTransitionRepository
{
    Task<AlarmTransitionQueryResult> QueryAsync(AlarmTransitionQuery query, CancellationToken ct = default);
    IAsyncEnumerable<object> StreamAsync(AlarmTransitionQuery query, CancellationToken ct = default);
}

public record AlarmTransitionQuery(
    DateTimeOffset From,
    DateTimeOffset To,
    Guid? AlarmId = null,
    Guid? ServerId = null,
    string? SourceNameContains = null,
    string? ToState = null,
    int PageNumber = 1,
    int PageSize = 500,
    string SortBy = "TransitionTime",
    bool SortDescending = true);

public record AlarmTransitionQueryResult(
    IReadOnlyList<object> Items,
    long TotalCount,
    int PageNumber,
    int PageSize);
