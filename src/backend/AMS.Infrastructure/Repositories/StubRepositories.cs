// Stub repositories — moved out of Program.cs (Plan 10 B1, behavior unchanged).
//
// ⚠ BOTH classes below are DELIBERATE STUBS, documented here so nobody mistakes them
// for working persistence:
//
// - SoeEventRepository: the `soe` schema has NO tables — SOE events reach the UI only
//   as SignalR pushes (AlarmHub OnSoeEvent) and are never persisted. The REST query
//   path therefore returns an empty page by design. Implementing it means creating a
//   soe.events table + a projection writer — recorded as the Plan 10 B3 decision
//   ("future feature, not cleanup"), not something to slip in silently.
//
// - OpcServerRepository: OPC server metadata is managed through OpcConnectionRepository
//   (opc connections surface); this legacy interface remains only because IUnitOfWork
//   exposes it. GetAllEnabledAsync returning empty is load-bearing: callers treat
//   "no configured legacy servers" as the normal single-connection deployment.
using AMS.Domain.Repositories;
using Npgsql;

namespace AMS.Infrastructure.Repositories;

public class SoeEventRepository : ISoeEventRepository
{
    // Kept for signature compatibility with the eventual real implementation.
    private readonly NpgsqlDataSource _ds;
    public SoeEventRepository(NpgsqlDataSource ds) => _ds = ds;

    public Task<SoeEventQueryResult> QueryAsync(SoeEventQuery q, CancellationToken ct = default) =>
        Task.FromResult(new SoeEventQueryResult(new List<object>(), 0, 1, 500, false));

    public IAsyncEnumerable<object> StreamReplayAsync(DateTimeOffset f, DateTimeOffset t, Guid[] s,
        CancellationToken ct = default) => EmptyReplay(ct);

    private static async IAsyncEnumerable<object> EmptyReplay(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await Task.CompletedTask;
        yield break;
    }
}

public class OpcServerRepository : IOpcServerRepository
{
    private readonly Persistence.AmsDbContext _ctx;
    public OpcServerRepository(Persistence.AmsDbContext ctx) => _ctx = ctx;
    public Task<IReadOnlyList<OpcServerConfig>> GetAllEnabledAsync(CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<OpcServerConfig>>(new List<OpcServerConfig>());
    public Task<OpcServerConfig?> GetByIdAsync(Guid id, CancellationToken ct = default) => Task.FromResult<OpcServerConfig?>(null);
    public Task<OpcServerConfig> AddAsync(OpcServerConfig s, CancellationToken ct = default) => Task.FromResult(s);
    public Task UpdateAsync(OpcServerConfig s, CancellationToken ct = default) => Task.CompletedTask;
    public Task UpdateConnectionStateAsync(Guid id, bool c, string? e, CancellationToken ct = default) => Task.CompletedTask;
    public Task UpdateHeartbeatAsync(Guid id, CancellationToken ct = default) => Task.CompletedTask;
}
