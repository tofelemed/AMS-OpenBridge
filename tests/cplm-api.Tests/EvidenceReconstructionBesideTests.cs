// CHG-099 (SME review 2 #18) - a reconstruction is stored BESIDE the evidence it rebuilds, never over it (reverses the
// CHG-076 replace). The engine emits a rebuilt artifact under the original's evidence id (uuidV5(run|kind|role)); the store
// keeps a held original untouched and writes the rebuild under ReconstructionId(original, analysis run), routing each chunk
// by its checksum. Identical bytes are counted on the analysis run, not stored twice; the rebuild of a lost or never-kept
// artifact is stored beside too (the run's own set is live bytes only); only the newest reconstruction of an original is
// kept; a live re-delivery is a no-op.
using System.Security.Cryptography;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvidenceReconstructionBesideTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid();
    private readonly List<Guid> _analysisRuns = new();
    private static readonly byte[] Live0 = { 1, 2, 3 }, Rec0 = { 4, 5, 6, 7 }, Rec1 = { 8, 9 };

    private static string Sha(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();
    private static readonly byte[] RecAll = Rec0.Concat(Rec1).ToArray();

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });
        await conn.ExecuteAsync("DELETE FROM analytics.analysis_run WHERE analysis_run_id = ANY(@ids)", new { ids = _analysisRuns.ToArray() });
        await _db.DisposeAsync();
    }

    /// <summary>A live artifact as the consumer left it: one chunk (Live0), the given readiness, class and pin.</summary>
    private async Task<Guid> SeedLive(string readiness, string cls, bool pinned = false)
    {
        var id = Guid.NewGuid();
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256,
                chunk_sha256, readiness, retention_class, pinned, gate_result_id, provenance)
            VALUES (@id, @run, 'G5', 'cycle_scores', 1, 3, @sha, @shas::jsonb, @readiness, @cls, @pinned, 4242,
                '{"loop_id":"FIC101","purpose":"LIVE"}'::jsonb)
            """, new { id, run = _run, sha = Sha(Live0), shas = $"[\"{Sha(Live0)}\"]", readiness, cls, pinned });
        if (readiness != "EXPIRED")
            await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 3, @s, @p)",
                new { id, s = Sha(Live0), p = Live0 });
        return id;
    }

    /// <summary>The operator's reconstruction run, as AnalysisRunStore registers it before the job is submitted.</summary>
    private async Task<Guid> SeedAnalysisRun()
    {
        var id = Guid.NewGuid();
        _analysisRuns.Add(id);
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.analysis_run (analysis_run_id, loop_id, purpose, state, manifest)
            VALUES (@id, 'FIC101', 'EVIDENCE_RECONSTRUCTION', 'SUBMITTED', jsonb_build_object('reconstructs', @run::text, 'source', 'iotdb'))
            """, new { id, run = _run });
        return id;
    }

    private JsonElement Manifest(Guid id, string provenance, byte[][] chunks) => JsonDocument.Parse($$"""
        {"record_kind":"EVIDENCE_MANIFEST","evidence_id":"{{id}}","method_run_id":"{{_run}}","gate_id":"G5","artifact_kind":"cycle_scores",
         "chunk_count":{{chunks.Length}},"total_bytes":{{chunks.Sum(c => c.Length)}},"sha256":"{{Sha(chunks.SelectMany(c => c).ToArray())}}",
         "chunk_sha256":[{{string.Join(",", chunks.Select(c => $"\"{Sha(c)}\""))}}],"columns":["x","y"],"provenance":{{provenance}}}
        """).RootElement;

    private JsonElement Reconstruction(Guid id, Guid analysisRun, byte[][]? chunks = null) => Manifest(id,
        $$"""{"loop_id":"FIC101","purpose":"EVIDENCE_RECONSTRUCTION","analysis_run_id":"{{analysisRun}}"}""", chunks ?? new[] { Rec0, Rec1 });

    private async Task<(string cls, string readiness, string sha, Guid? reconstructionOf, Guid? analysisRunId)?> Row(Guid id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var r = await conn.QueryFirstOrDefaultAsync(
            "SELECT retention_class, readiness, sha256, reconstruction_of, analysis_run_id FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id });
        return r is null ? null : ((string)r.retention_class, (string)r.readiness, (string)r.sha256, (Guid?)r.reconstruction_of, (Guid?)r.analysis_run_id);
    }

    private async Task<byte[][]> Payloads(Guid id) =>
        (await new PostgresEvidenceBlobStore(_db).GetChunksAsync(id, CancellationToken.None)).Select(c => c.Payload).ToArray();

    /// <summary>What the consumer does with a chunk: route it by checksum, then store it under that row.</summary>
    private static async Task<Guid> Deliver(PostgresEvidenceBlobStore store, Guid evidenceId, int no, byte[] payload)
    {
        var target = await store.ResolveChunkTargetAsync(evidenceId, no, Sha(payload), CancellationToken.None) ?? evidenceId;
        (await store.PutChunkAsync(target, no, Sha(payload), payload, CancellationToken.None)).Should().BeTrue();
        return target;
    }

    [Fact]
    public async Task A_reconstruction_of_a_held_original_is_stored_beside_it_and_the_original_is_untouched()
    {
        var store = new PostgresEvidenceBlobStore(_db);
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        var ar = await SeedAnalysisRun();
        var stored = await store.UpsertManifestAsync(Reconstruction(id, ar), CancellationToken.None);

        var reconId = PostgresEvidenceBlobStore.ReconstructionId(id, ar);
        stored.Should().Be(reconId);
        (await Row(id)).Should().Be(("TRANSIENT", "COMPLETE", Sha(Live0), (Guid?)null, (Guid?)null), "the retained proof is never overwritten");
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 });
        (await Row(reconId)).Should().Be(("STANDARD", "PENDING", Sha(RecAll), (Guid?)id, (Guid?)ar));

        // the engine sends the chunks under the ORIGINAL id; the checksums route them to the reconstruction
        (await Deliver(store, id, 0, Rec0)).Should().Be(reconId);
        (await Deliver(store, id, 1, Rec1)).Should().Be(reconId);
        (await Payloads(reconId)).Should().BeEquivalentTo(new[] { Rec0, Rec1 }, o => o.WithStrictOrdering());
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 }, "no rebuilt chunk lands on the original");

        // at-least-once delivery: the same chunks again find no row awaiting them and are dropped, never appended
        (await store.ResolveChunkTargetAsync(id, 1, Sha(Rec1), CancellationToken.None)).Should().BeNull();
        (await store.ResolveChunkTargetAsync(id, 0, Sha(Rec0), CancellationToken.None)).Should().BeNull();
    }

    [Theory]
    [InlineData("EPISODE", false)]
    [InlineData("PINNED", true)]
    public async Task An_episode_or_pinned_original_keeps_its_bytes_and_class(string cls, bool pinned)
    {
        var id = await SeedLive("COMPLETE", cls, pinned);
        var ar = await SeedAnalysisRun();
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Reconstruction(id, ar), CancellationToken.None);
        (await Row(id))!.Value.cls.Should().Be(cls);
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 }, "an episode capture / a pin still points at the original bytes");
        (await Row(PostgresEvidenceBlobStore.ReconstructionId(id, ar))).Should().NotBeNull();
    }

    [Fact]
    public async Task Identical_bytes_are_counted_on_the_run_not_stored_twice()
    {
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        var ar = await SeedAnalysisRun();
        var stored = await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Reconstruction(id, ar, new[] { Live0 }), CancellationToken.None);
        stored.Should().Be(Guid.Empty);
        (await Row(PostgresEvidenceBlobStore.ReconstructionId(id, ar))).Should().BeNull();
        await using var conn = await _db.OpenConnectionAsync();
        const string count = "SELECT jsonb_array_length(manifest->'identical_evidence') FROM analytics.analysis_run WHERE analysis_run_id = @ar";
        (await conn.ExecuteScalarAsync<int>(count, new { ar })).Should().Be(1);
        // a redelivered manifest is not counted twice
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Reconstruction(id, ar, new[] { Live0 }), CancellationToken.None);
        (await conn.ExecuteScalarAsync<int>(count, new { ar })).Should().Be(1);
    }

    [Theory]
    [InlineData(true)]     // an EXPIRED tombstone of the original
    [InlineData(false)]    // the live run never stored this artifact (the uncapped rebuild of a capped run, CHG-076 lab case)
    public async Task A_rebuild_of_a_lost_or_never_kept_artifact_is_also_stored_beside(bool tombstone)
    {
        var store = new PostgresEvidenceBlobStore(_db);
        var id = tombstone ? await SeedLive("EXPIRED", "TRANSIENT") : Guid.NewGuid();
        var ar = await SeedAnalysisRun();
        var reconId = PostgresEvidenceBlobStore.ReconstructionId(id, ar);
        (await store.UpsertManifestAsync(Reconstruction(id, ar), CancellationToken.None)).Should().Be(reconId);
        (await Row(reconId)).Should().Be(("STANDARD", "PENDING", Sha(RecAll), (Guid?)id, (Guid?)ar),
            "the run's own set only ever holds the live engine's bytes");
        if (tombstone) (await Row(id))!.Value.readiness.Should().Be("EXPIRED", "the tombstone is not revived with other bytes");
        else (await Row(id)).Should().BeNull();
        (await Deliver(store, id, 0, Rec0)).Should().Be(reconId);
    }

    [Fact]
    public async Task Only_the_newest_reconstruction_of_an_original_is_kept()
    {
        var store = new PostgresEvidenceBlobStore(_db);
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        var first = await SeedAnalysisRun();
        var second = await SeedAnalysisRun();
        await store.UpsertManifestAsync(Reconstruction(id, first), CancellationToken.None);
        await store.UpsertManifestAsync(Reconstruction(id, second, new[] { Rec1 }), CancellationToken.None);
        (await Row(PostgresEvidenceBlobStore.ReconstructionId(id, first))).Should().BeNull("bounded space: one reconstruction per original");
        (await Row(PostgresEvidenceBlobStore.ReconstructionId(id, second))).Should().NotBeNull();
        (await Row(id))!.Value.sha.Should().Be(Sha(Live0));
    }

    [Fact]
    public async Task A_live_redelivery_of_a_COMPLETE_row_is_a_no_op()
    {
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(
            Manifest(id, """{"loop_id":"FIC101","purpose":"LIVE"}""", new[] { Rec0, Rec1 }), CancellationToken.None);
        (await Row(id)).Should().Be(("TRANSIENT", "COMPLETE", Sha(Live0), (Guid?)null, (Guid?)null));
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 });
    }

    [Fact]
    public void The_reconstruction_id_is_stable_per_original_and_run()
    {
        var o = Guid.NewGuid();
        var r = Guid.NewGuid();
        PostgresEvidenceBlobStore.ReconstructionId(o, r).Should().Be(PostgresEvidenceBlobStore.ReconstructionId(o, r), "a re-delivery lands on the same row");
        PostgresEvidenceBlobStore.ReconstructionId(o, r).Should().NotBe(o);
        PostgresEvidenceBlobStore.ReconstructionId(o, Guid.NewGuid()).Should().NotBe(PostgresEvidenceBlobStore.ReconstructionId(o, r));
    }
}
