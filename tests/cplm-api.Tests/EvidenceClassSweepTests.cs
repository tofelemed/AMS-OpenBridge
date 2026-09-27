// CHG-033 - the sweeper's class tiers on the lab database. TRANSIENT (every live artifact) is deleted
// outright past Cplm:EvidenceTransientHours and, oldest first, whenever the class exceeds its byte budget;
// EPISODE expires retention_policy.EPISODE days after the linked episode CLOSED and never while it is open;
// STANDARD and PINNED behave as before (EvidenceRetentionSweeperTests).
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EvidenceClassSweepTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid();
    private readonly Guid _tOld = Guid.NewGuid(), _t1 = Guid.NewGuid(), _t2 = Guid.NewGuid(), _t3 = Guid.NewGuid();
    private readonly Guid _eOpen = Guid.NewGuid(), _eClosedLong = Guid.NewGuid(), _eClosedNew = Guid.NewGuid();
    private readonly List<long> _frames = new();
    private Guid[] Mine => new[] { _tOld, _t1, _t2, _t3, _eOpen, _eClosedLong, _eClosedNew };

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        // TRANSIENT: one past the 6 h age, three live ones that are the oldest live rows (5h59m .. 5h57m)
        await Manifest(conn, _tOld, _run, "TRANSIENT", "7 hours");
        await Manifest(conn, _t1, _run, "TRANSIENT", "359 minutes");
        await Manifest(conn, _t2, _run, "TRANSIENT", "358 minutes");
        await Manifest(conn, _t3, _run, "TRANSIENT", "357 minutes");
        // EPISODE: linked to an open frame (200 d), a frame closed 92 d ago (manifest 93 d: past 90, inside the 7 d grace), a frame closed yesterday
        var runOpen = Guid.NewGuid(); var runClosedLong = Guid.NewGuid(); var runClosedNew = Guid.NewGuid();
        await Frame(conn, runOpen, closedAgo: null);
        await Frame(conn, runClosedLong, closedAgo: "92 days");
        await Frame(conn, runClosedNew, closedAgo: "1 day");
        await Manifest(conn, _eOpen, runOpen, "EPISODE", "200 days");
        await Manifest(conn, _eClosedLong, runClosedLong, "EPISODE", "93 days");
        await Manifest(conn, _eClosedNew, runClosedNew, "EPISODE", "200 days");
    }

    private static async Task Manifest(NpgsqlConnection conn, Guid id, Guid run, string cls, string age)
    {
        await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, pinned, retention_class, created_at)
            VALUES (@id, @run, 'G5', 'acf_series', 1, 1000, 'x', 'COMPLETE', FALSE, @cls, NOW() - @age::interval)
            """, new { id, run, cls, age });
        await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 3, 'x', @p)",
            new { id, p = new byte[] { 1, 2, 3 } });
    }

    private async Task Frame(NpgsqlConnection conn, Guid run, string? closedAgo)
    {
        var closedAt = closedAgo is null ? "NULL" : $"NOW() - interval '{closedAgo}'";
        var state = closedAgo is null ? "'OPEN'" : "'CLOSED'";
        var id = await conn.ExecuteScalarAsync<long>($"""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, closed_at, condition_state, peak_diagnosis, peak_confidence)
            VALUES (@loop, '24h', 'OSCILLATION', NOW() - interval '200 days', {closedAt}, {state}, 'SUSPECTED_OSCILLATION', 0.8) RETURNING id
            """, new { loop = "SWEEP-TEST-" + Guid.NewGuid().ToString("N")[..8] });
        _frames.Add(id);
        await conn.ExecuteAsync("INSERT INTO analytics.cplm_episode_capture (episode_id, method_run_id, kind, captured_at) VALUES (@id, @run, 'OPEN', NOW() - interval '200 days')",
            new { id, run });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)", new { ids = Mine });
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_event_frames WHERE id = ANY(@ids)", new { ids = _frames.ToArray() });
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
    public async Task Transient_rows_past_the_hours_are_deleted_outright_and_younger_ones_kept()
    {
        var r = await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None, transientHours: 6, transientBudgetBytes: long.MaxValue);
        r.TransientPurged.Should().BeGreaterThanOrEqualTo(1);
        (await Row(_tOld)).present.Should().BeFalse("a TRANSIENT row past the hours is deleted, chunks and all - no EXPIRED grace");
        foreach (var id in new[] { _t1, _t2, _t3 }) (await Row(id)).Should().Be((true, "COMPLETE", 1));
    }

    [Fact]
    public async Task The_transient_budget_deletes_the_oldest_live_rows_until_the_class_fits()
    {
        long others;
        await using (var conn = await _db.OpenConnectionAsync())
            others = await conn.ExecuteScalarAsync<long>("""
                SELECT COALESCE(SUM(total_bytes + 1200), 0) FROM analytics.evidence_manifest
                WHERE retention_class = 'TRANSIENT' AND pinned = FALSE AND readiness <> 'EXPIRED'
                  AND created_at >= NOW() - interval '6 hours' AND NOT (evidence_id = ANY(@ids))
                """, new { ids = Mine });
        // room for two of the three live rows (1000 B payload + 1200 B of row overhead each)
        await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None, transientHours: 6, transientBudgetBytes: others + 2 * 2200 + 100, batchSize: 1);
        (await Row(_t1)).present.Should().BeFalse("the oldest live TRANSIENT row goes first");
        (await Row(_t3)).present.Should().BeTrue("the budget purge stops as soon as the class fits");
    }

    [Fact]
    public async Task Episode_rows_expire_only_after_the_episode_closed_and_its_days_passed()
    {
        await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None);
        (await Row(_eOpen)).Should().Be((true, "COMPLETE", 1), "an open episode keeps its evidence whatever its age");
        (await Row(_eClosedNew)).Should().Be((true, "COMPLETE", 1), "the clock starts at the close, not at the capture");
        (await Row(_eClosedLong)).Should().Be((true, "EXPIRED", 0), "closed 92 d ago: expired, chunks deleted, row kept for the grace period");
    }
}
