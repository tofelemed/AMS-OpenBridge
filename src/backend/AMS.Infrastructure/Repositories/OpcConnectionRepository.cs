using AMS.Domain.Connectivity;
using AMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AMS.Infrastructure.Repositories;

public interface IOpcConnectionRepository
{
    Task<IReadOnlyList<OpcConnection>> GetAllAsync(CancellationToken ct = default);
    Task<OpcConnection?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<OpcConnection> AddAsync(OpcConnection connection, CancellationToken ct = default);
    Task UpdateAsync(OpcConnection connection, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
    Task<int> CountConnectedAsync(CancellationToken ct = default);
}

public sealed class OpcConnectionRepository : IOpcConnectionRepository
{
    private readonly AmsDbContext _db;

    public OpcConnectionRepository(AmsDbContext db) => _db = db;

    public async Task<IReadOnlyList<OpcConnection>> GetAllAsync(CancellationToken ct = default) =>
        await _db.OpcConnections.AsNoTracking().OrderBy(c => c.Name).ToListAsync(ct);

    public async Task<OpcConnection?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await _db.OpcConnections.FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<OpcConnection> AddAsync(OpcConnection connection, CancellationToken ct = default)
    {
        _db.OpcConnections.Add(connection);
        await _db.SaveChangesAsync(ct);
        return connection;
    }

    public async Task UpdateAsync(OpcConnection connection, CancellationToken ct = default)
    {
        _db.OpcConnections.Update(connection);
        await _db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _db.OpcConnections.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (entity is null) return;
        _db.OpcConnections.Remove(entity);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<int> CountConnectedAsync(CancellationToken ct = default) =>
        await _db.OpcConnections.CountAsync(
            c => c.Enabled && c.Status == OpcConnectionStatus.Connected, ct);
}
