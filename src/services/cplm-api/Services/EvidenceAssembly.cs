using System.Security.Cryptography;

namespace Traverse.CplmApi.Services;

/// <summary>What the evidence consumer knows about a manifest: its declared chunking and checksums.</summary>
public sealed record EvidenceManifestSpec(Guid EvidenceId, int ChunkCount, long TotalBytes, string Sha256, string[] ChunkSha256);

/// <summary>One chunk as received (payload already base64-decoded).</summary>
public sealed record EvidenceChunkSpec(int ChunkNo, string Sha256, byte[] Payload);

public enum EvidenceReadiness { Pending, Complete, Failed }

public sealed record EvidenceVerdict(EvidenceReadiness Readiness, string? Reason, int ChunksPresent);

/// <summary>
/// v2.5 Task 1G.3 (spec v6 R12 transport; NR-058): decides an evidence manifest's readiness
/// from the chunks actually present. Pure, so it is tested without Kafka or Postgres.
///
/// COMPLETE only when every chunk 0..n-1 is present exactly once, each chunk's payload
/// hashes to its own SHA-256 AND to the manifest's declared per-chunk SHA-256, the byte total
/// matches, and the concatenation hashes to the manifest SHA-256. Anything corrupt is FAILED
/// with the reason; anything missing is PENDING. Never COMPLETE early, never repaired.
/// </summary>
public static class EvidenceAssembly
{
    public static string Sha256Hex(ReadOnlySpan<byte> data) => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();

    /// <summary>Verifies one chunk on arrival; a chunk that does not hash to its own checksum is rejected.</summary>
    public static bool ChunkIsSelfConsistent(EvidenceChunkSpec chunk) =>
        string.Equals(Sha256Hex(chunk.Payload), chunk.Sha256, StringComparison.OrdinalIgnoreCase);

    public static EvidenceVerdict Evaluate(EvidenceManifestSpec manifest, IReadOnlyCollection<EvidenceChunkSpec> chunks)
    {
        if (manifest.ChunkCount <= 0) return new EvidenceVerdict(EvidenceReadiness.Failed, "CHUNK_COUNT_INVALID", chunks.Count);
        if (manifest.ChunkSha256.Length != manifest.ChunkCount)
            return new EvidenceVerdict(EvidenceReadiness.Failed, "MANIFEST_CHUNK_SHA_COUNT_MISMATCH", chunks.Count);

        var byNo = new Dictionary<int, EvidenceChunkSpec>();
        foreach (var c in chunks)
        {
            if (c.ChunkNo < 0 || c.ChunkNo >= manifest.ChunkCount)
                return new EvidenceVerdict(EvidenceReadiness.Failed, $"CHUNK_OUT_OF_RANGE:{c.ChunkNo}", chunks.Count);
            if (byNo.TryGetValue(c.ChunkNo, out var existing))
            {
                // A redelivered chunk is fine when identical; two different payloads for one slot are not.
                if (!existing.Payload.AsSpan().SequenceEqual(c.Payload))
                    return new EvidenceVerdict(EvidenceReadiness.Failed, $"CHUNK_CONFLICT:{c.ChunkNo}", chunks.Count);
                continue;
            }
            if (!ChunkIsSelfConsistent(c))
                return new EvidenceVerdict(EvidenceReadiness.Failed, $"CHUNK_CORRUPT:{c.ChunkNo}", chunks.Count);
            if (!string.Equals(c.Sha256, manifest.ChunkSha256[c.ChunkNo], StringComparison.OrdinalIgnoreCase))
                return new EvidenceVerdict(EvidenceReadiness.Failed, $"CHUNK_NOT_IN_MANIFEST:{c.ChunkNo}", chunks.Count);
            byNo[c.ChunkNo] = c;
        }
        if (byNo.Count < manifest.ChunkCount) return new EvidenceVerdict(EvidenceReadiness.Pending, null, byNo.Count);

        long total = 0;
        using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        for (int i = 0; i < manifest.ChunkCount; i++)
        {
            var p = byNo[i].Payload;
            total += p.Length;
            sha.AppendData(p);
        }
        if (total != manifest.TotalBytes) return new EvidenceVerdict(EvidenceReadiness.Failed, "TOTAL_BYTES_MISMATCH", byNo.Count);
        var whole = Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant();
        if (!string.Equals(whole, manifest.Sha256, StringComparison.OrdinalIgnoreCase))
            return new EvidenceVerdict(EvidenceReadiness.Failed, "MANIFEST_SHA_MISMATCH", byNo.Count);
        return new EvidenceVerdict(EvidenceReadiness.Complete, null, byNo.Count);
    }
}
