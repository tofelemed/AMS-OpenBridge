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
    /// One-time migration: recompute the whole chain from genesis with the
    /// current (canonical-JSON) hash algorithm. Exists because rows written
    /// before the canonicalization fix hashed the raw JSON text, which jsonb
    /// does not preserve — those rows can never verify, and their original
    /// preimage is unrecoverable. This is a documented re-chain, not a cover-up:
    /// the operation itself is logged and the caller is audited by the host.
    /// </summary>
    public async Task<(int total, int rehashed)> RechainAsync(CancellationToken ct)
    {
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

        if (rehashed > 0)
        {
            _db.AllowHashRechain = true;
            try { await _db.SaveChangesAsync(ct); }
            finally { _db.AllowHashRechain = false; }
        }
        _logger.LogWarning("Chain re-chained: {Rehashed} of {Total} events rehashed under the canonical algorithm.",
            rehashed, events.Count);
        return (events.Count, rehashed);
    }
}
