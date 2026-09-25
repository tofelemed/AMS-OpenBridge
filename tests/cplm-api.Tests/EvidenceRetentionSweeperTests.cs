// 2026-09-25 pre-prod review (C1 / I5): the sweeper expired manifests and deleted their chunks but never removed
// the manifest rows (~1.2 KB each; 336k-361k per day at plant scale = ~0.4 GB/day for ever), and it did every
// class in one statement inside one transaction, so a backlog would time out and be retried bigger the next day.
// The sweep now has two batched tiers: expire (chunks deleted, row kept so a reader is told EVIDENCE_EXPIRED
// for a grace period) and purge (EXPIRED, unpinned rows older than retention + grace are deleted); pinned
// manifests are never touched by either.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvidenceRetentionSweeperTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid();
    private readonly Guid _expiredOld = Guid.NewGuid(), _pinnedOld = Guid.NewGuid(), _dueNotPurgeable = Guid.NewGuid();
    private readonly List<Guid> _batch = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToList();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        // STANDARD days on the lab is 90 (retention_policy); grace defaults to 7
        await Insert(conn, _expiredOld, "EXPIRED", pinned: false, ageDays: 200, withChunk: false);
        await Insert(conn, _pinnedOld, "COMPLETE", pinned: true, ageDays: 200, withChunk: true);
        await Insert(conn, _dueNotPurgeable, "COMPLETE", pinned: false, ageDays: 92, withChunk: true);
        // due (past 90 d) but inside the 7 d grace, so they are expired and kept - never purged by the same sweep
        foreach (var id in _batch) await Insert(conn, id, "COMPLETE", pinned: false, ageDays: 93, withChunk: true);
    }

    private async Task Insert(NpgsqlConnection conn, Guid id, string readiness, bool pinned, int ageDays, bool withChunk)
    {
        await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, pinned, created_at, provenance)
            VALUES (@id, @run, 'G5', 'acf_series', 1, 3, 'x', @readiness, @pinned, NOW() - make_interval(days => @age), '{}'::jsonb)
            """, new { id, run = _run, readiness, pinned, age = ageDays });
        if (withChunk)
            await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 3, 'x', @p)",
                new { id, p = new byte[] { 1, 2, 3 } });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });
        await _db.DisposeAsync();
    }

    private async Task<(bool present, string? readiness, int chunks)> Row(Guid id)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var readiness = await conn.ExecuteScalarAsync<string?>("SELECT readiness FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id });
        var chunks = await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = @id", new { id });
        return (readiness is not null, readiness, chunks);
    }

    [Fact]
    public async Task Expired_unpinned_manifests_are_purged_after_the_grace_period_and_pinned_ones_are_never_touched()
    {
        var result = await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None);

        (await Row(_expiredOld)).present.Should().BeFalse("EXPIRED + unpinned + older than retention + grace is purged");
        var pinned = await Row(_pinnedOld);
        pinned.Should().Be((true, "COMPLETE", 1), "a pinned manifest keeps its row and its chunk regardless of age");
        var due = await Row(_dueNotPurgeable);
        due.present.Should().BeTrue("inside the grace period the row stays so a reader is told EVIDENCE_EXPIRED");
        due.readiness.Should().Be("EXPIRED");
        due.chunks.Should().Be(0, "expiry deletes the chunks");
        result.Purged.Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task A_sweep_larger_than_one_batch_completes_in_one_call()
    {
        // guard, not a RED->GREEN: the former single statement also expired every row; this pins that the
        // batched loop keeps going until nothing is due (five due rows, batches of two)
        await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None, batchSize: 2);
        foreach (var id in _batch)
        {
            var row = await Row(id);
            row.readiness.Should().Be("EXPIRED", $"{id} was due and the loop must not stop after the first batch");
            row.chunks.Should().Be(0);
        }
    }
}
