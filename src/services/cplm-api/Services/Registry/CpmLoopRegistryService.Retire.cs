using Dapper;

namespace Traverse.CplmApi.Services;

public sealed partial class CpmLoopRegistryService
{
    /// <summary>
    /// Retires or restores one loop (matched without regard to case). Engines are not told: they stop by losing
    /// input, because ingestion drops an inactive loop at its next registry refresh.
    /// </summary>
    public async Task<LoopRetireResult> SetRetiredAsync(string loopId, bool retire, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var changed = await conn.QueryFirstOrDefaultAsync<string>(retire ? LoopRetireSql.Retire : LoopRetireSql.Restore, new { loopId });
        if (changed is not null)
        {
            _logger.LogInformation("Loop {LoopId} {Action}", changed, retire ? "retired" : "restored");
            return new LoopRetireResult(LoopRetireOutcome.Changed, changed);
        }
        var stored = await conn.QueryFirstOrDefaultAsync<string>(LoopRetireSql.StoredId, new { loopId });
        return new LoopRetireResult(stored is null ? LoopRetireOutcome.NotFound : LoopRetireOutcome.Unchanged, stored);
    }
}
