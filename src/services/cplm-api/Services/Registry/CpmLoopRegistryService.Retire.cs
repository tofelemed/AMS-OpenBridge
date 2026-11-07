using Dapper;

namespace Traverse.CplmApi.Services;

public sealed partial class CpmLoopRegistryService
{
    /// <summary>
    /// Retires or restores one loop. After a change it republishes the loop's evidence on the same metadata
    /// broadcast onboarding uses (the activate path), so the engines read the row as it now stands.
    /// </summary>
    public async Task<LoopRetireOutcome> SetRetiredAsync(string loopId, bool retire, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var changed = await conn.ExecuteAsync(retire ? LoopRetireSql.Retire : LoopRetireSql.Restore, new { loopId });
        if (changed == 0)
        {
            var exists = await conn.ExecuteScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM cpm.loop_registry WHERE loop_id = @loopId)", new { loopId });
            return exists ? LoopRetireOutcome.Unchanged : LoopRetireOutcome.NotFound;
        }
        await PublishEvidenceAsync(loopId, ct);
        _logger.LogInformation("Loop {LoopId} {Action}", loopId, retire ? "retired" : "restored");
        return LoopRetireOutcome.Changed;
    }
}
