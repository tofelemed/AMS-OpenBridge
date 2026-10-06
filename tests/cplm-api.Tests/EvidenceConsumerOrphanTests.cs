// CHG-049 - the evidence consumer on the lab database. A chunk whose manifest the sweeper already removed is
// skipped with a warning (it used to throw and wedge the partition in a 2 s retry loop); assembly counts the
// stored chunks before it reads any payload, and still completes a manifest once every chunk is there.
using System.Text;
using Dapper;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi;
using Traverse.CplmApi.BackgroundServices;
using Traverse.CplmApi.Infrastructure;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvidenceConsumerOrphanTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private PostgresEvidenceBlobStore _store = null!;
    private CplmEvidenceConsumerService _svc = null!;
    private readonly List<Guid> _ids = new();

    public Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        _store = new PostgresEvidenceBlobStore(_db);
        var hb = new ConsumerHeartbeat();
        _svc = new CplmEvidenceConsumerService(
            NullLogger<CplmEvidenceConsumerService>.Instance,
            Options.Create(new KafkaOptions { BootstrapServers = "127.0.0.1:1" }),   // nothing connects until ExecuteAsync
            Options.Create(new CplmOptions()), hb,
            new SingleMemberGuard(NullLogger<SingleMemberGuard>.Instance, hb, "127.0.0.1:1"), _store);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)", new { ids = _ids.ToArray() });
        await _db.DisposeAsync();
    }

    private static string Sha(string s) => EvidenceAssembly.Sha256Hex(Encoding.UTF8.GetBytes(s));

    private Guid NewId() { var id = Guid.NewGuid(); _ids.Add(id); return id; }

    private static string ChunkJson(Guid id, int no, string text) =>
        $$"""{"record_kind":"EVIDENCE_CHUNK","evidence_id":"{{id}}","chunk_no":{{no}},"sha256":"{{Sha(text)}}","payload_b64":"{{Convert.ToBase64String(Encoding.UTF8.GetBytes(text))}}"}""";

    // chunks "p0","p1",... of 2 bytes each; the whole-artifact sha is over the concatenation
    private static string ManifestJson(Guid id, int chunkCount)
    {
        var parts = Enumerable.Range(0, chunkCount).Select(i => $"p{i}").ToArray();
        var shas = string.Join(",", parts.Select(p => $"\"{Sha(p)}\""));
        return $$"""{"record_kind":"EVIDENCE_MANIFEST","evidence_id":"{{id}}","method_run_id":"{{Guid.NewGuid()}}","gate_id":"G5","artifact_kind":"acf_series","chunk_count":{{chunkCount}},"total_bytes":{{chunkCount * 2}},"sha256":"{{Sha(string.Concat(parts))}}","chunk_sha256":[{{shas}}]}""";
    }

    private async Task<string> Readiness(Guid id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<string>("SELECT readiness FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id }) ?? "";
    }

    [Fact]
    public async Task Chunk_without_manifest_is_skipped_not_thrown_and_next_manifest_persists()
    {
        var orphan = NewId();
        await _svc.Invoking(s => s.ApplyAsync(ChunkJson(orphan, 0, "p0"), default)).Should().NotThrowAsync();
        (await _store.GetManifestAsync(orphan, default)).Should().BeNull("a skipped orphan creates nothing");
        var id = NewId();
        await _svc.ApplyAsync(ManifestJson(id, 1), default);
        (await Readiness(id)).Should().Be("PENDING");
    }

    [Fact]
    public async Task Count_chunks_returns_the_stored_number()
    {
        var id = NewId();
        await _svc.ApplyAsync(ManifestJson(id, 3), default);
        (await _store.CountChunksAsync(id, default)).Should().Be(0);
        await _svc.ApplyAsync(ChunkJson(id, 0, "p0"), default);
        await _svc.ApplyAsync(ChunkJson(id, 2, "p2"), default);
        (await _store.CountChunksAsync(id, default)).Should().Be(2);
        (await _store.CountChunksAsync(Guid.NewGuid(), default)).Should().Be(0);
    }

    [Fact]
    public async Task Manifest_stays_pending_until_every_chunk_is_there_then_completes()
    {
        var id = NewId();
        await _svc.ApplyAsync(ManifestJson(id, 2), default);
        await _svc.ApplyAsync(ChunkJson(id, 1, "p1"), default);
        (await Readiness(id)).Should().Be("PENDING");
        await _svc.ApplyAsync(ChunkJson(id, 0, "p0"), default);
        (await Readiness(id)).Should().Be("COMPLETE");
    }
}
