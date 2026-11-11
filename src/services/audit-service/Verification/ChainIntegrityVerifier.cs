using AMS.AuditService.Hashing;
using AMS.AuditService.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AMS.AuditService.Verification;

public class ChainIntegrityVerifier
{
    private readonly AuditDbContext _db;
    private readonly AuditHashChainService _hashService;
    private readonly ILogger<ChainIntegrityVerifier> _logger;

    public ChainIntegrityVerifier(AuditDbContext db, AuditHashChainService hashService, ILogger<ChainIntegrityVerifier> logger)
    {
        _db = db;
        _hashService = hashService;
        _logger = logger;
    }

    /// <summary>
    /// Audits the entire database sequentially to prove no rows were tampered with.
    /// Used for IEC-62443 compliance checks.
    /// </summary>
    public async Task<bool> VerifyFullChainAsync(CancellationToken ct)
    {
        _logger.LogInformation("Starting full cryptographic chain verification...");

        var events = await _db.AuditEvents
            .OrderBy(x => x.TimestampUtc)
            .ThenBy(x => x.EventId)
            .AsNoTracking()
            .ToListAsync(ct);

        if (events.Count == 0) return true;

        string expectedPreviousHash = new string('0', 64); // Genesis

        for (int i = 0; i < events.Count; i++)
        {
            var evt = events[i];

            // 1. Verify link to previous
            if (evt.PreviousHash != expectedPreviousHash)
            {
                _logger.LogCritical("CHAIN BROKEN at Event {EventId}. Previous Hash mismatch.", evt.EventId);
                return false;
            }

            // 2. Verify payload hasn't been altered
            if (!_hashService.VerifyIntegrity(evt))
            {
                _logger.LogCritical("DATA TAMPERING DETECTED at Event {EventId}. Payload hash mismatch.", evt.EventId);
                return false;
            }

            expectedPreviousHash = evt.CurrentHash;
        }

        _logger.LogInformation("Chain integrity verified successfully across {Count} events.", events.Count);
        return true;
    }

    /// <summary>
    /// Recompute the whole chain from genesis with the current (canonical-JSON)
    /// hash algorithm. Exists because rows written before the canonicalization
    /// fix hashed the raw JSON text, which jsonb does not preserve — those rows
    /// can never verify, and their original preimage is unrecoverable.
    /// CHG-173: a documented re-chain, not a cover-up. Every call appends an
    /// AUDIT_CHAIN_RECHAINED record naming <paramref name="actor"/>, hashed under
    /// the new chain. The rehash and the record are one save, under the chain
    /// lock the consumer's append takes, so nothing lands between them and a
    /// failure writes neither.
    /// </summary>
    public async Task<(int total, int rehashed)> RechainAsync(RechainActor actor, CancellationToken ct)
    {
        // Postgres only: the in-memory provider of the tests has no transactions or advisory locks.
        var relational = _db.Database.IsRelational();
        await using var tx = relational ? await _db.Database.BeginTransactionAsync(ct) : null;
        try
        {
            if (relational)
                await _db.Database.ExecuteSqlRawAsync(ImmutableAuditRepository.ChainLockSql, ct);

            var events = await _db.AuditEvents
                .OrderBy(x => x.TimestampUtc)
                .ThenBy(x => x.EventId)
                .ToListAsync(ct);

            var previous = new string('0', 64);
            var rehashed = 0;
            foreach (var evt in events)
            {
                var expected = _hashService.GenerateHash(evt, previous);
                if (evt.PreviousHash != previous || !evt.CurrentHash.Equals(expected, StringComparison.OrdinalIgnoreCase))
                {
                    evt.PreviousHash = previous;
                    evt.CurrentHash = expected;
                    rehashed++;
                }
                previous = evt.CurrentHash;
            }

            var record = RechainRecord.Create(actor, events.Count, rehashed, DateTimeOffset.UtcNow,
                events.Count > 0 ? events[^1].TimestampUtc : null);
            record.CurrentHash = _hashService.GenerateHash(record, previous);
            _db.AuditEvents.Add(record);

            _db.AllowHashRechain = rehashed > 0;
            try { await _db.SaveChangesAsync(ct); }
            finally { _db.AllowHashRechain = false; }
            if (tx is not null) await tx.CommitAsync(ct);

            _logger.LogWarning(
                "Chain re-chained by {Actor}: {Rehashed} of {Total} events rehashed under the canonical algorithm; recorded as {EventType} {EventId}.",
                actor.Username, rehashed, events.Count, RechainRecord.EventType, record.EventId);
            return (events.Count, rehashed);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Rechain requested by {Actor} failed and was rolled back; nothing was recorded.",
                actor.Username);
            throw;
        }
    }
}
