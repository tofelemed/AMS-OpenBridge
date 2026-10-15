// CHG-033 - evidence bounded by class. The consumer writes every live artifact as TRANSIENT (bounded by
// hours and a byte budget in the sweeper, not by days); an artifact a reconstruction / replay produced
// (provenance.analysis_run_id) is STANDARD, kept retention_policy days; a revived EXPIRED row keeps
// whatever class it had (an EPISODE capture stays EPISODE).
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvidenceClassTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid();

    public Task InitializeAsync() { _db = NpgsqlDataSource.Create(TestDb.ConnectionString()); return Task.CompletedTask; }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });
        await _db.DisposeAsync();
    }

    private JsonElement Manifest(Guid id, string provenance) => JsonDocument.Parse($$"""
        {"record_kind":"EVIDENCE_MANIFEST","evidence_id":"{{id}}","method_run_id":"{{_run}}","gate_id":"G5","artifact_kind":"acf_series",
         "chunk_count":1,"total_bytes":3,"sha256":"x","chunk_sha256":["x"],"columns":["x","y"],"provenance":{{provenance}}}
        """).RootElement;

    private async Task<(string? cls, string? readiness)> Row(Guid id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var r = await conn.QueryFirstOrDefaultAsync("SELECT retention_class, readiness FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id });
        return ((string?)r?.retention_class, (string?)r?.readiness);
    }

    [Fact]
    public async Task A_live_artifact_is_written_as_TRANSIENT()
    {
        var id = Guid.NewGuid();
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(
            Manifest(id, """{"loop_id":"FIC101","window_kind":"12h","purpose":"LIVE"}"""), CancellationToken.None);
        (await Row(id)).Should().Be(("TRANSIENT", "PENDING"));
    }

    [Fact]
    public async Task A_reconstruction_artifact_is_written_as_STANDARD()
    {
        // guards the other direction: the class decision must read the provenance, not stamp everything TRANSIENT
        var id = Guid.NewGuid();
        var run = Guid.NewGuid();
        var stored = await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(
            Manifest(id, $$"""{"loop_id":"FIC101","purpose":"EVIDENCE_RECONSTRUCTION","analysis_run_id":"{{run}}"}"""), CancellationToken.None);
        // CHG-099: a reconstruction is stored beside the original (here: never kept), under its own id
        stored.Should().Be(PostgresEvidenceBlobStore.ReconstructionId(id, run));
        (await Row(stored!.Value)).cls.Should().Be("STANDARD");
    }

    [Fact]
    public async Task A_revived_expired_row_keeps_its_class()
    {
        var id = Guid.NewGuid();
        await using (var conn = await _db.OpenConnectionAsync())
            await conn.ExecuteAsync("""
                INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, retention_class, created_at)
                VALUES (@id, @run, 'G5', 'acf_series', 1, 3, 'x', 'EXPIRED', 'EPISODE', NOW() - interval '100 days')
                """, new { id, run = _run });
        await new PostgresEvidenceBlobStore(_db).UpsertManifestAsync(Manifest(id, """{"loop_id":"FIC101"}"""), CancellationToken.None);
        (await Row(id)).Should().Be(("EPISODE", "PENDING"));
    }
}
