// 2026-09-17 (found by the Response-page performance probe): the evidence consumer's minute reconcile
// joined EVERY unlinked manifest of the last day (108k on the lab - 97 % of them, because it only
// looked in the fusion table while G0-G11 runs live in the short / long tables) against the fusion
// rows with a per-row containment probe: a three-minute UPDATE re-run every minute, holding locks
// the evidence reads waited on (a 27 s manifest read). It now links per tier from the result rows of
// the last minutes (expanded run ids, index-joined to the manifests), so each pass is bounded.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class EvidenceReconcileTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly string _loop = "T-RECON-" + Guid.NewGuid().ToString("N")[..8];
    private readonly Guid _shortRun = Guid.NewGuid(), _longRun = Guid.NewGuid(), _fusionRun = Guid.NewGuid();
    private readonly Guid _shortManifest = Guid.NewGuid(), _longManifest = Guid.NewGuid(), _fusionManifest = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_short_feature_results (loop_id, window_kind, window_start, window_end, sample_count, payload, source, method_run_ids, bundle_hash)
            VALUES (@loop, '60m', NOW() - interval '1 hour', NOW(), 720, '{"gate3_status":"WARN"}'::jsonb, 'flink', jsonb_build_object('G3', @run::text), 'b:test')
            """, new { loop = _loop, run = _shortRun });
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_long_feature_results (loop_id, window_kind, window_start, window_end, sample_count, payload, source, method_run_ids, bundle_hash)
            VALUES (@loop, '4h', NOW() - interval '4 hour', NOW(), 2880, '{"gate5_status":"OK"}'::jsonb, 'flink', jsonb_build_object('G5', @run::text), 'b:test')
            """, new { loop = _loop, run = _longRun });
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_gate_results (loop_id, window_kind, window_start, window_end, sample_count, payload, source, method_run_ids, bundle_hash)
            VALUES (@loop, '24h', NOW() - interval '24 hour', NOW(), 17280, '{"diagnosis":"HEALTHY"}'::jsonb, 'flink', jsonb_build_object('G15', @run::text), 'b:test')
            """, new { loop = _loop, run = _fusionRun });
        foreach (var (id, run, gate) in new[] { (_shortManifest, _shortRun, "G3"), (_longManifest, _longRun, "G5"), (_fusionManifest, _fusionRun, "G15") })
        {
            await conn.ExecuteAsync("""
                INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, role_or_path, x_quantity, x_unit, y_quantity, y_unit,
                    data_type, columns, encoding, calculation_samples, display_points, chunk_count, total_bytes, sha256, chunk_sha256, readiness, provenance)
                VALUES (@id, @run, @gate, 'objective_error', 'ERROR', 'sample_time', 'ms_epoch', 'error', 'EU',
                    'f64', '["x","y"]'::jsonb, 'f64le+gzip', 10, 10, 1, 8, 'sha', '["sha"]'::jsonb, 'COMPLETE', jsonb_build_object('loop_id', @loop))
                """, new { id, run, gate, loop = _loop });
        }
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)", new { ids = new[] { _shortManifest, _longManifest, _fusionManifest } });
        foreach (var t in new[] { "analytics.cplm_short_feature_results", "analytics.cplm_long_feature_results", "analytics.cplm_gate_results" })
            await conn.ExecuteAsync($"DELETE FROM {t} WHERE loop_id = @loop", new { loop = _loop });
        await _db.DisposeAsync();
    }

    [Fact]
    public async Task Manifests_of_every_tier_link_to_their_result_row_and_the_pass_is_bounded_to_recent_rows()
    {
        var store = new PostgresEvidenceBlobStore(_db);
        var linked = await store.ReconcileGateResultIdsAsync(CancellationToken.None);
        linked.Should().BeGreaterThanOrEqualTo(3, "the short, long and fusion manifests all have a fresh result row");

        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync("SELECT evidence_id, gate_id, gate_result_id FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)",
            new { ids = new[] { _shortManifest, _longManifest, _fusionManifest } })).ToList();
        rows.Should().HaveCount(3);
        var linkedIds = rows.Select(r => (long?)r.gate_result_id).ToList();
        linkedIds.Should().OnlyContain(id => id != null, "each tier's row is found in its own table");
        var shortId = await conn.ExecuteScalarAsync<long>("SELECT id FROM analytics.cplm_short_feature_results WHERE loop_id = @loop", new { loop = _loop });
        var shortLinked = rows.Where(r => (Guid)r.evidence_id == _shortManifest).Select(r => (long?)r.gate_result_id).Single();
        shortLinked.Should().Be(shortId);

        // bounded: the manifest side is served by the partial index on unlinked manifests, never a table walk
        foreach (var table in new[] { "analytics.cplm_short_feature_results", "analytics.cplm_long_feature_results", "analytics.cplm_gate_results" })
        {
            var plan = string.Join((char)10, await conn.QueryAsync<string>("EXPLAIN " + PostgresEvidenceBlobStore.ReconcileSql(table)));
            plan.Should().NotContain("Seq Scan on evidence_manifest", $"{table}: the unlinked-manifest side must come from ix_evidence_manifest_unlinked");
        }
    }
}
