// CHG-033 - an episode transition selects evidence. The frame service records the fused verdict's method
// runs in analytics.cplm_episode_capture inside the frame transaction and promotes the TRANSIENT manifests
// already present to EPISODE; the sweeper's promote step catches the ones that arrive later. OPEN and
// ESCALATE captures stop at Cplm:EpisodeCaptureMax; CLOSE always captures.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.BackgroundServices;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class EpisodeCaptureTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private long _frame;
    private readonly Guid _a = Guid.NewGuid(), _b = Guid.NewGuid(), _c = Guid.NewGuid(), _d = Guid.NewGuid();
    private Guid[] All => new[] { _a, _b, _c, _d };

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        _frame = await conn.ExecuteScalarAsync<long>("""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, peak_diagnosis, peak_confidence)
            VALUES (@loop, '24h', 'OSCILLATION', NOW(), 'SUSPECTED_OSCILLATION', 0.8) RETURNING id
            """, new { loop = "CAPTURE-TEST-" + Guid.NewGuid().ToString("N")[..8] });
        foreach (var run in new[] { _a, _b, _c }) await Manifest(conn, run);
    }

    private static Task Manifest(NpgsqlConnection conn, Guid run) => conn.ExecuteAsync("""
        INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, pinned, retention_class, provenance)
        VALUES (@id, @run, 'G5', 'acf_series', 1, 3, 'x', 'COMPLETE', FALSE, 'TRANSIENT', '{}'::jsonb)
        """, new { id = Guid.NewGuid(), run });

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_event_frames WHERE id = @id", new { id = _frame });      // captures cascade
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = ANY(@runs)", new { runs = All });
        await _db.DisposeAsync();
    }

    private async Task<bool> Capture(string kind, params Guid[] runs)
    {
        await using var conn = await _db.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        var taken = await EpisodeCaptureStore.CaptureAsync(conn, tx, _frame, kind, runs, maxAutomatic: 3);
        await tx.CommitAsync();
        return taken;
    }

    private async Task<string?> ClassOf(Guid run)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<string?>("SELECT retention_class FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run });
    }

    private async Task<(HashSet<Guid> captured, int count)> State()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var runs = (await conn.QueryAsync<Guid>("SELECT method_run_id FROM analytics.cplm_episode_capture WHERE episode_id = @id", new { id = _frame })).ToHashSet();
        var count = await conn.ExecuteScalarAsync<int>("SELECT capture_count FROM analytics.cplm_event_frames WHERE id = @id", new { id = _frame });
        return (runs, count);
    }

    [Fact]
    public async Task An_open_capture_records_the_runs_and_promotes_the_manifests_already_present()
    {
        (await Capture("OPEN", _a, _b)).Should().BeTrue();
        var (captured, count) = await State();
        captured.Should().BeEquivalentTo(new[] { _a, _b });
        count.Should().Be(1);
        (await ClassOf(_a)).Should().Be("EPISODE");
        (await ClassOf(_b)).Should().Be("EPISODE");
        (await ClassOf(_c)).Should().Be("TRANSIENT");
    }

    [Fact]
    public async Task Automatic_captures_stop_at_the_cap_but_close_always_captures()
    {
        (await Capture("OPEN", _a)).Should().BeTrue();
        (await Capture("ESCALATE", _b)).Should().BeTrue();
        (await Capture("ESCALATE", _c)).Should().BeTrue();
        (await Capture("ESCALATE", _d)).Should().BeFalse();          // the fourth automatic capture is refused
        (await State()).captured.Should().NotContain(_d);
        (await Capture("CLOSE", _d)).Should().BeTrue();              // the close is never refused
        (await State()).captured.Should().Contain(_d);
    }

    [Fact]
    public async Task A_manifest_arriving_after_the_capture_is_promoted_by_the_sweep_step()
    {
        (await Capture("OPEN", _d)).Should().BeTrue();               // no manifest for D yet
        await using (var conn = await _db.OpenConnectionAsync()) await Manifest(conn, _d);
        (await ClassOf(_d)).Should().Be("TRANSIENT");
        (await EpisodeCaptureStore.PromoteCapturedAsync(_db, lookbackHours: 7, CancellationToken.None)).Should().BeGreaterThanOrEqualTo(1);
        (await ClassOf(_d)).Should().Be("EPISODE");
    }

    [Fact]
    public void The_fused_verdict_run_ids_are_parsed_and_non_uuids_skipped()
    {
        var g0 = Guid.NewGuid(); var g2r = Guid.NewGuid();
        var root = JsonDocument.Parse($$"""
            {"loop_id":"FIC101","window_kind":"12h","diagnosis":"SUSPECTED_OSCILLATION","confidence":0.8,"severity":"HIGH",
             "windowStartMs":1790000000000,"windowEndMs":1790043200000,
             "method_run_ids":{"G0":"{{g0}}","G2r":"{{g2r}}","G13":"n/a"}
            }
            """).RootElement;
        CplmEventFrameService.ParseVerdict(root)!.MethodRunIds.Should().BeEquivalentTo(new[] { g0, g2r });
        var bare = JsonDocument.Parse("""{"loop_id":"FIC101","diagnosis":"SUSPECTED_OSCILLATION"}""").RootElement;
        CplmEventFrameService.ParseVerdict(bare)!.MethodRunIds.Should().BeNull();
    }
}
