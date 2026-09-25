// v2.5 Task 1G.5 (NR-060) — retention by record class on the lab traverse_cplm: an unpinned
// STANDARD manifest past its days loses its chunks and reads EXPIRED (the manifest stays for the
// grace period, then the purge tier removes it - 2026-09-25); a
// pinned one survives; a fresh one is untouched.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]   // every class that sweeps the shared lab table runs serially with the others
public sealed class EvidenceRetentionTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _old = Guid.NewGuid(), _pinned = Guid.NewGuid(), _fresh = Guid.NewGuid();
    private readonly Guid _run = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        // _old at 93 d: past the 90 d class, inside the 7 d grace (a row older than 97 d is purged - EvidenceRetentionSweeperTests)
        foreach (var (id, ageDays, pinned) in new[] { (_old, 93, false), (_pinned, 120, true), (_fresh, 1, false) })
        {
            await conn.ExecuteAsync("""
                INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, pinned, created_at)
                VALUES (@id, @run, 'G10', 'RETENTION_TEST', 1, 3, 'x', 'COMPLETE', @pinned, NOW() - make_interval(days => @age))
                """, new { id, run = _run, pinned, age = ageDays });
            await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 3, 'x', @p)",
                new { id, p = new byte[] { 1, 2, 3 } });
        }
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });   // chunks cascade
        await _db.DisposeAsync();
    }

    [Fact]
    public async Task Unpinned_expired_manifest_loses_chunks_and_reads_EXPIRED_while_pinned_and_fresh_survive()
    {
        var (expired, chunks, _) = await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None);
        expired.Should().BeGreaterOrEqualTo(1);
        chunks.Should().BeGreaterOrEqualTo(1);

        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync("""
            SELECT m.evidence_id, m.readiness, m.readiness_reason, (SELECT count(*) FROM analytics.evidence_chunk c WHERE c.evidence_id = m.evidence_id) AS chunks
            FROM analytics.evidence_manifest m WHERE m.method_run_id = @run
            """, new { run = _run })).ToDictionary(r => (Guid)r.evidence_id, r => r);

        ((string)rows[_old].readiness).Should().Be("EXPIRED");
        ((string)rows[_old].readiness_reason).Should().Be("RETENTION");
        ((long)rows[_old].chunks).Should().Be(0);
        ((string)rows[_pinned].readiness).Should().Be("COMPLETE");
        ((long)rows[_pinned].chunks).Should().Be(1);
        ((string)rows[_fresh].readiness).Should().Be("COMPLETE");
        ((long)rows[_fresh].chunks).Should().Be(1);
    }
}
