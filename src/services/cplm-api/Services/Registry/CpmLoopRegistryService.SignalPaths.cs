namespace Traverse.CplmApi.Services;

public sealed partial class CpmLoopRegistryService
{
    /// <summary>CHG-179: the stored signal paths of every registered loop, retired ones included (<see cref="LoopSignalPaths.Select"/>).</summary>
    public async Task<IReadOnlyList<string>> GetSignalPathsAsync(CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        return await LoopSignalPaths.LoadAsync(conn, ct);
    }
}
