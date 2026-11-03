// CHG-102 Phase 5b-1 - the cpax1 archive pack without a database: every chunk comes back byte for byte with its SHA-256,
// the manifest columns round-trip exactly, identical chunks are stored once, a corrupted pack is refused, and the pack
// costs a few hundred bytes per artifact over the chunk bytes (the live rows cost ~2 KB).
using System.Security.Cryptography;
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;
using Xunit.Abstractions;

namespace Traverse.CplmApi.Tests;

public sealed class EvidenceArchivePackTests
{
    private readonly ITestOutputHelper _out;
    public EvidenceArchivePackTests(ITestOutputHelper output) => _out = output;

    private static ArchivedArtifact Artifact(int k, byte[] all, int chunkSize)
    {
        var chunks = all.Chunk(chunkSize).Select((c, i) => new EvidenceChunkSpec(i, EvidenceArchiveSeed.Sha(c), c)).ToList();
        var shas = "[" + string.Join(", ", chunks.Select(c => $"\"{c.Sha256}\"")) + "]";
        var m = new ArchivedManifest(Guid.NewGuid(), Guid.NewGuid(), "G9", "kind_" + k, k % 2 == 0 ? "PV" : null, "sample_time", "ms_epoch",
            "pv", "EU", "f64", "[\"x\", \"y\"]", "f64le+gzip", 2880, 1440, chunks.Count, all.Length, EvidenceArchiveSeed.Sha(all), shas,
            "COMPLETE", null, "{\"loop_id\": \"L1\", \"emission_reason\": \"BOUNDARY\"}", "TRANSIENT", false, "abc", null,
            new DateTime(2026, 11, 3, 12, 0, 0, 123, DateTimeKind.Utc).AddTicks(4560), null, 42, null, null);
        return new ArchivedArtifact(m, chunks);
    }

    [Fact]
    public void A_pack_round_trips_every_chunk_and_manifest_exactly()
    {
        var artifacts = Enumerable.Range(0, 8).Select(k => Artifact(k, EvidenceArchiveSeed.ArtifactBytes(500 + 300 * k, 2 + k % 2, k), 4096)).ToList();
        artifacts.Should().OnlyContain(a => EvidenceArchivePack.Verifies(a.Manifest, a.Chunks));
        var back = EvidenceArchivePack.Unpack(EvidenceArchivePack.Pack(artifacts));
        back.Should().HaveCount(artifacts.Count);
        for (var i = 0; i < artifacts.Count; i++)
        {
            back[i].Manifest.Should().Be(artifacts[i].Manifest);
            back[i].Chunks.Select(c => c.Payload).Should().BeEquivalentTo(artifacts[i].Chunks.Select(c => c.Payload), o => o.WithStrictOrdering());
            var whole = back[i].Chunks.SelectMany(c => c.Payload).ToArray();
            Convert.ToHexString(SHA256.HashData(whole)).ToLowerInvariant().Should().Be(artifacts[i].Manifest.Sha256);
            EvidenceArchivePack.Verifies(back[i].Manifest, back[i].Chunks).Should().BeTrue();
        }
    }

    [Fact]
    public void Identical_chunks_are_stored_once_and_a_damaged_pack_is_refused()
    {
        var same = EvidenceArchiveSeed.ArtifactBytes(2000, 2, 9);
        var a = Artifact(0, same, 1 << 20);
        var b = Artifact(1, same, 1 << 20);
        var one = EvidenceArchivePack.Pack(new[] { a });
        var two = EvidenceArchivePack.Pack(new[] { a, b });
        (two.Length - one.Length).Should().BeLessThan(same.Length / 2, "the second copy is a reference, not the bytes");
        var bad = (byte[])two.Clone();
        bad[^10] ^= 0xFF;                                                     // inside the last blob
        var act = () => EvidenceArchivePack.Unpack(bad);
        act.Should().Throw<InvalidDataException>();
    }

    [Fact]
    public void A_chunk_that_does_not_match_its_manifest_does_not_verify()
    {
        var a = Artifact(0, EvidenceArchiveSeed.ArtifactBytes(1000, 2, 3), 1024);
        var tampered = a.Chunks.Select((c, i) => i == 1 ? c with { Payload = c.Payload.Reverse().ToArray() } : c).ToList();
        EvidenceArchivePack.Verifies(a.Manifest, tampered).Should().BeFalse();
        EvidenceArchivePack.Verifies(a.Manifest, a.Chunks.Take(a.Chunks.Count - 1).ToList()).Should().BeFalse("a chunk is missing");
    }

    [Fact]
    public void Pack_overhead_per_artifact_is_a_few_hundred_bytes()
    {
        var rng = new Random(7);
        var artifacts = Enumerable.Range(0, 50).Select(k => Artifact(k, EvidenceArchiveSeed.ArtifactBytes(240 + rng.Next(2640), 2 + k % 2, k), 1 << 20)).ToList();
        var chunkBytes = artifacts.Sum(a => a.Chunks.Sum(c => (long)c.Payload.Length));
        var pack = EvidenceArchivePack.Pack(artifacts);
        var perArtifact = (pack.Length - chunkBytes) / 50.0;
        _out.WriteLine($"50 artifacts: chunks {chunkBytes} B, pack {pack.Length} B, overhead {perArtifact:F0} B per artifact");
        perArtifact.Should().BeLessThan(400);
    }
}
