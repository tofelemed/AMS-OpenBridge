// v2.5 Task 1G.3 (spec v6 R12 transport; NR-058) — a manifest is COMPLETE only when every
// chunk is present and every checksum verifies; corruption is FAILED with a reason; anything
// missing is PENDING. Out-of-order and duplicate delivery are normal, never errors.
using System.Security.Cryptography;
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EvidenceAssemblyTests
{
    private static string Hex(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();

    private static (EvidenceManifestSpec manifest, List<EvidenceChunkSpec> chunks) Fixture(int chunkCount = 3, int chunkBytes = 1000)
    {
        var rnd = new Random(42);
        var chunks = new List<EvidenceChunkSpec>();
        var all = new List<byte>();
        for (int i = 0; i < chunkCount; i++)
        {
            var p = new byte[chunkBytes];
            rnd.NextBytes(p);
            chunks.Add(new EvidenceChunkSpec(i, Hex(p), p));
            all.AddRange(p);
        }
        var manifest = new EvidenceManifestSpec(Guid.NewGuid(), chunkCount, all.Count, Hex(all.ToArray()),
            chunks.Select(c => c.Sha256).ToArray());
        return (manifest, chunks);
    }

    [Fact]
    public void Complete_when_every_chunk_is_present_and_verifies()
    {
        var (m, chunks) = Fixture();
        var v = EvidenceAssembly.Evaluate(m, chunks);
        v.Readiness.Should().Be(EvidenceReadiness.Complete);
        v.ChunksPresent.Should().Be(3);
    }

    [Fact]
    public void Out_of_order_and_duplicate_delivery_still_completes()
    {
        var (m, chunks) = Fixture();
        var shuffled = new[] { chunks[2], chunks[0], chunks[2], chunks[1], chunks[0] };
        EvidenceAssembly.Evaluate(m, shuffled).Readiness.Should().Be(EvidenceReadiness.Complete);
    }

    [Fact]
    public void Pending_while_a_chunk_is_missing_never_complete_early()
    {
        var (m, chunks) = Fixture();
        var v = EvidenceAssembly.Evaluate(m, new[] { chunks[0], chunks[2] });
        v.Readiness.Should().Be(EvidenceReadiness.Pending);
        v.ChunksPresent.Should().Be(2);
    }

    [Fact]
    public void A_corrupted_chunk_fails_with_its_slot()
    {
        var (m, chunks) = Fixture();
        var bad = chunks[1].Payload.ToArray();
        bad[10] ^= 0xFF;
        var corrupt = new EvidenceChunkSpec(1, chunks[1].Sha256, bad);           // payload no longer hashes to its checksum
        var v = EvidenceAssembly.Evaluate(m, new[] { chunks[0], corrupt, chunks[2] });
        v.Readiness.Should().Be(EvidenceReadiness.Failed);
        v.Reason.Should().Be("CHUNK_CORRUPT:1");
    }

    [Fact]
    public void A_self_consistent_chunk_that_the_manifest_did_not_declare_fails()
    {
        var (m, chunks) = Fixture();
        var other = new byte[1000];
        new Random(7).NextBytes(other);
        var foreign = new EvidenceChunkSpec(1, Hex(other), other);
        EvidenceAssembly.Evaluate(m, new[] { chunks[0], foreign, chunks[2] }).Reason.Should().Be("CHUNK_NOT_IN_MANIFEST:1");
    }

    [Fact]
    public void Two_different_payloads_for_one_slot_is_a_conflict()
    {
        var (m, chunks) = Fixture();
        var other = new byte[1000];
        new Random(9).NextBytes(other);
        var conflict = new EvidenceChunkSpec(0, Hex(other), other);
        EvidenceAssembly.Evaluate(m, new[] { chunks[0], conflict, chunks[1], chunks[2] }).Reason.Should().Be("CHUNK_CONFLICT:0");
    }

    [Fact]
    public void A_manifest_whose_whole_hash_does_not_match_fails_even_with_valid_chunks()
    {
        var (m, chunks) = Fixture();
        var tampered = m with { Sha256 = new string('0', 64) };
        EvidenceAssembly.Evaluate(tampered, chunks).Reason.Should().Be("MANIFEST_SHA_MISMATCH");
        var wrongTotal = m with { TotalBytes = m.TotalBytes + 1 };
        EvidenceAssembly.Evaluate(wrongTotal, chunks).Reason.Should().Be("TOTAL_BYTES_MISMATCH");
    }
}
