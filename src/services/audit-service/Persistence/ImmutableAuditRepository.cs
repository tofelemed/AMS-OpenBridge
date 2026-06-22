using AMS.AuditService.Hashing;
using AMS.AuditService.Models;
using Microsoft.EntityFrameworkCore;

namespace AMS.AuditService.Persistence;

public class ImmutableAuditRepository
{
    private readonly AuditDbContext _db;
    private readonly AuditHashChainService _hashService;
    private readonly ILogger<ImmutableAuditRepository> _logger;

    public ImmutableAuditRepository(AuditDbContext db, AuditHashChainService hashService, ILogger<ImmutableAuditRepository> logger)
    {
        _db = db;
        _hashService = hashService;
        _logger = logger;
    }

    /// <summary>
    /// Thread-safe append of an audit event, establishing the cryptographic link.
    /// </summary>
    public async Task AppendAsync(AuditEvent evt, CancellationToken ct)
    {
        // Enforce sequential writes to maintain chain integrity safely.
        // In highly concurrent setups, this uses a Postgres advisory lock.
        using var transaction = await _db.Database.BeginTransactionAsync(ct);
        
        try
        {
            // Acquire exclusive lock for hashing
            await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(101010);", ct);

            // 1. Get the last hash
            var lastEvent = await _db.AuditEvents
                .OrderByDescending(x => x.TimestampUtc)
                .ThenByDescending(x => x.EventId)
                .FirstOrDefaultAsync(ct);

            var previousHash = lastEvent?.CurrentHash ?? new string('0', 64); // Genesis hash if empty

            // 2. Generate current hash
            evt.CurrentHash = _hashService.GenerateHash(evt, previousHash);

            // 3. Append to DB
            _db.AuditEvents.Add(evt);
            await _db.SaveChangesAsync(ct);
            
            await transaction.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to append audit event {EventId}", evt.EventId);
            await transaction.RollbackAsync(ct);
            throw;
        }
    }
}
