// CHG-076 - a reconstruction replaces the live artifacts it collides with. The capped live run and its uncapped
// reconstruction share evidence ids (uuidV5(run|kind|role)), so the store's upsert must let a reconstruction
// (RetentionClassOf == STANDARD) take over a PENDING / COMPLETE live row: chunks dropped, manifest replaced,
// PENDING again, STANDARD unless the row is EPISODE; a PINNED row is never touched; an identical re-emit (same
// sha256) and a live re-delivery are no-ops.
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
public sealed class EvidenceReconstructionReplaceTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid();
    private static readonly byte[] Live0 = { 1, 2, 3 }, Rec0 = { 4, 5, 6, 7 }, Rec1 = { 8, 9 };

    private static string Sha(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();
    private static readonly byte[] RecAll = Rec0.Concat(Rec1).ToArray();

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });
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
        await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 3, @s, @p)",
            new { id, s = Sha(Live0), p = Live0 });
        return id;
    }

    private JsonElement Manifest(Guid id, string provenance, byte[][] chunks) => JsonDocument.Parse($$"""
        {"record_kind":"EVIDENCE_MANIFEST","evidence_id":"{{id}}","method_run_id":"{{_run}}","gate_id":"G5","artifact_kind":"cycle_scores",
         "chunk_count":{{chunks.Length}},"total_bytes":{{chunks.Sum(c => c.Length)}},"sha256":"{{Sha(chunks.SelectMany(c => c).ToArray())}}",
         "chunk_sha256":[{{string.Join(",", chunks.Select(c => $"\"{Sha(c)}\""))}}],"columns":["x","y"],"provenance":{{provenance}}}
        """).RootElement;

    private JsonElement Reconstruction(Guid id) => Manifest(id,
        $$"""{"loop_id":"FIC101","purpose":"EVIDENCE_RECONSTRUCTION","analysis_run_id":"{{Guid.NewGuid()}}"}""", new[] { Rec0, Rec1 });

    private async Task<(string cls, string readiness, string sha, long? gateResultId, Guid runId)> Row(Guid id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var r = await conn.QueryFirstAsync(
            "SELECT retention_class, readiness, sha256, gate_result_id, method_run_id FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id });
        return ((string)r.retention_class, (string)r.readiness, (string)r.sha256, (long?)r.gate_result_id, (Guid)r.method_run_id);
    }

    private async Task<byte[][]> Payloads(Guid id) =>
        (await new PostgresEvidenceBlobStore(_db).GetChunksAsync(id, CancellationToken.None)).Select(c => c.Payload).ToArray();

    [Fact]
    public async Task A_reconstruction_replaces_a_live_COMPLETE_row_and_completes_on_its_own_chunks()
    {
        var store = new PostgresEvidenceBlobStore(_db);
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        await store.UpsertManifestAsync(Reconstruction(id), CancellationToken.None);

        var row = await Row(id);
        row.Should().Be(("STANDARD", "PENDING", Sha(RecAll), (long?)4242, _run), "method_run_id / gate_result_id are kept");
        (await Payloads(id)).Should().BeEmpty("the live chunks are dropped so the reconstruction's chunk stream lands");

        (await store.PutChunkAsync(id, 0, Sha(Rec0), Rec0, CancellationToken.None)).Should().BeTrue();
        (await store.PutChunkAsync(id, 1, Sha(Rec1), Rec1, CancellationToken.None)).Should().BeTrue();
        // the consumer's completion check (CplmEvidenceConsumerService.EvaluateAsync) on the replaced row
        var m = (await store.GetManifestAsync(id, CancellationToken.None))!;
        (await store.CountChunksAsync(id, CancellationToken.None)).Should().Be(m.ChunkCount);
        var verdict = EvidenceAssembly.Evaluate(new EvidenceManifestSpec(m.EvidenceId, m.ChunkCount, m.TotalBytes, m.Sha256, m.ChunkSha256),
            await store.GetChunksAsync(id, CancellationToken.None));
        verdict.Readiness.Should().Be(EvidenceReadiness.Complete);
        await store.SetReadinessAsync(id, "COMPLETE", null, CancellationToken.None);
        (await Row(id)).readiness.Should().Be("COMPLETE");
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Rec0, Rec1 }, o => o.WithStrictOrdering());
    }

    [Fact]
    public async Task A_reconstruction_replaces_a_live_PENDING_row()
    {
        var id = await SeedLive("PENDING", "TRANSIENT");
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Reconstruction(id), CancellationToken.None);
        (await Row(id)).Should().Be(("STANDARD", "PENDING", Sha(RecAll), (long?)4242, _run));
        (await Payloads(id)).Should().BeEmpty();
    }

    [Fact]
    public async Task An_EPISODE_row_keeps_its_class_with_the_payload_replaced()
    {
        var id = await SeedLive("COMPLETE", "EPISODE");
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Reconstruction(id), CancellationToken.None);
        (await Row(id)).Should().Be(("EPISODE", "PENDING", Sha(RecAll), (long?)4242, _run), "a reconstruction never demotes an EPISODE capture");
        (await Payloads(id)).Should().BeEmpty();
    }

    [Fact]
    public async Task A_PINNED_row_is_untouched()
    {
        var id = await SeedLive("COMPLETE", "PINNED", pinned: true);
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Reconstruction(id), CancellationToken.None);
        (await Row(id)).Should().Be(("PINNED", "COMPLETE", Sha(Live0), (long?)4242, _run), "an investigation pinned exactly these bytes");
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 });
    }

    [Fact]
    public async Task A_live_redelivery_of_a_COMPLETE_row_is_a_no_op()
    {
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(
            Manifest(id, """{"loop_id":"FIC101","purpose":"LIVE"}""", new[] { Rec0, Rec1 }), CancellationToken.None);
        (await Row(id)).Should().Be(("TRANSIENT", "COMPLETE", Sha(Live0), (long?)4242, _run));
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 });
    }

    [Fact]
    public async Task A_same_sha_reconstruction_is_a_no_op()
    {
        var id = await SeedLive("COMPLETE", "TRANSIENT");
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Manifest(id,
            $$"""{"loop_id":"FIC101","purpose":"EVIDENCE_RECONSTRUCTION","analysis_run_id":"{{Guid.NewGuid()}}"}""", new[] { Live0 }),
            CancellationToken.None);
        (await Row(id)).Should().Be(("TRANSIENT", "COMPLETE", Sha(Live0), (long?)4242, _run), "the same bytes need no second stream");
        (await Payloads(id)).Should().BeEquivalentTo(new[] { Live0 });
    }
}
