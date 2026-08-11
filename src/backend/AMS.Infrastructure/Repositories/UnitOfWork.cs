// Unit of Work — moved out of Program.cs (Plan 10 B1, verbatim).
using AMS.Domain.Repositories;
using AMS.Infrastructure.Persistence;

namespace AMS.Infrastructure.Repositories;

public class UnitOfWork : IUnitOfWork
{
    private readonly AmsDbContext _ctx;
    private Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? _tx;
    public IActiveAlarmRepository ActiveAlarms { get; }
    public IHistoricalAlarmRepository HistoricalAlarms { get; }
    public ISoeEventRepository SoeEvents { get; }
    public IOpcServerRepository OpcServers { get; }
    public UnitOfWork(AmsDbContext ctx, IActiveAlarmRepository aa, IHistoricalAlarmRepository ha,
        ISoeEventRepository soe, IOpcServerRepository opc)
    { _ctx = ctx; ActiveAlarms = aa; HistoricalAlarms = ha; SoeEvents = soe; OpcServers = opc; }
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => _ctx.SaveChangesAsync(ct);
    public async Task BeginTransactionAsync(CancellationToken ct = default) =>
        _tx = await _ctx.Database.BeginTransactionAsync(ct);
    public async Task CommitTransactionAsync(CancellationToken ct = default) =>
        await _tx!.CommitAsync(ct);
    public async Task RollbackTransactionAsync(CancellationToken ct = default) =>
        await _tx!.RollbackAsync(ct);
}
