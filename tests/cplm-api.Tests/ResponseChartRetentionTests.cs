// CHG-105 - the System Response (G12) charts live as long as their event (class RESPONSE, row RESPONSE). Lab database; only this
// test's ids are created and removed. Age-based steps use 3600+ day windows so the lab's own rows are never in reach; the byte
// cap is driven with batch 1 against test rows that are the oldest of the class, so it stops before any lab row.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class ResponseChartRetentionTests : IAsyncLifetime
{
    private const string Loop = "TEST_CHG105_RESP";
    private NpgsqlDataSource _db = null!;
    private readonly List<Guid> _events = new(), _runs = new(), _models = new(), _manifests = new();

    public async Task InitializeAsync() => _db = NpgsqlDataSource.Create(TestDb.ConnectionString());

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.system_model WHERE model_id = ANY(@ids)", new { ids = _models.ToArray() });
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)", new { ids = _manifests.ToArray() });
        await conn.ExecuteAsync("DELETE FROM analytics.response_metric WHERE method_run_id = ANY(@runs)", new { runs = _runs.ToArray() });
        await conn.ExecuteAsync("DELETE FROM analytics.response_event WHERE event_id = ANY(@ids)", new { ids = _events.ToArray() });
        await _db.DisposeAsync();
    }

    private async Task<Guid> EventAsync(string captureState, int ageDays, string loop = Loop)
    {
        Guid id = Guid.NewGuid(), run = Guid.NewGuid();
        _events.Add(id); _runs.Add(run);
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.response_event (event_id, loop_id, method_run_id, event_type, path_id, t0_ms, capture_state, evaluation_state, eligibility, result, created_at)
            VALUES (@id, @loop, @run, 'INPUT_TEST', 'OP_TO_PV', 0, @captureState, 'EVALUATED', 'ELIGIBLE', '{}'::jsonb, NOW() - make_interval(days => @ageDays))
            """, new { id, loop, run, captureState, ageDays });
        await conn.ExecuteAsync("INSERT INTO analytics.response_metric (method_run_id, quantity_id, unit) VALUES (@run, 'process_gain', '')", new { run });
        return run;
    }

    /// <summary>One manifest with one chunk; <paramref name="ageDays"/> 0 = now.</summary>
    private async Task<Guid> ChartAsync(Guid run, string retentionClass, int ageDays = 0, string gate = "G12", int bytes = 4_000)
    {
        var id = Guid.NewGuid();
        _manifests.Add(id);
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, retention_class, created_at)
            VALUES (@id, @run, @gate, 'accepted_samples', 1, @bytes, 'x', 'COMPLETE', @retentionClass, NOW() - make_interval(days => @ageDays))
            """, new { id, run, gate, bytes, retentionClass, ageDays });
        await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 1, 'x', '\\x00'::bytea)", new { id });
        return id;
    }

    private async Task ModelFromAsync(Guid run, string loop)
    {
        var id = Guid.NewGuid();
        _models.Add(id);
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.system_model (model_id, loop_id, path_id, family, parameters, model_state, created_from_event)
            SELECT @id, @loop, 'OP_TO_PV', 'FOPDT', '{}'::jsonb, 'CANDIDATE', event_id FROM analytics.response_event WHERE method_run_id = @run
            """, new { id, loop, run });
    }

    private async Task<string?> ClassOf(Guid manifest)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<string?>("SELECT retention_class FROM analytics.evidence_manifest WHERE evidence_id = @manifest", new { manifest });
    }

    private async Task<int> ChunksOf(Guid manifest)
    {
        await using var conn = await _db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = @manifest", new { manifest });
    }

    [Fact]
    public async Task Promote_keeps_the_G12_charts_of_an_accepted_event_only()
    {
        var accepted = await EventAsync("COMPLETE", 0);
        var censored = await EventAsync("CENSORED", 0);
        var keep = await ChartAsync(accepted, "TRANSIENT");
        var otherGate = await ChartAsync(accepted, "TRANSIENT", gate: "G5");
        var censoredChart = await ChartAsync(censored, "TRANSIENT");
        var pinned = await ChartAsync(accepted, "PINNED");

        (await ResponseEvidenceRetention.PromoteAsync(_db, 7, CancellationToken.None)).Should().BeGreaterThanOrEqualTo(1);

        (await ClassOf(keep)).Should().Be("RESPONSE");
        (await ClassOf(otherGate)).Should().Be("TRANSIENT", "only G12 charts belong to the response event");
        (await ClassOf(censoredChart)).Should().Be("TRANSIENT", "a censored candidate keeps the TRANSIENT hours");
        (await ClassOf(pinned)).Should().Be("PINNED");
    }

    [Fact]
    public async Task Promote_ignores_charts_older_than_the_lookback()
    {
        var accepted = await EventAsync("COMPLETE", 0);
        var old = await ChartAsync(accepted, "TRANSIENT", ageDays: 2);
        await ResponseEvidenceRetention.PromoteAsync(_db, 7, CancellationToken.None);
        (await ClassOf(old)).Should().Be("TRANSIENT");
    }

    [Fact]
    public async Task The_event_purge_takes_its_charts_and_chunks_and_a_model_event_keeps_them()
    {
        var old = await EventAsync("COMPLETE", 3650);
        var oldChart = await ChartAsync(old, "RESPONSE", 3650);
        var modelled = await EventAsync("COMPLETE", 3650, loop: Loop + "_M");
        var modelledChart = await ChartAsync(modelled, "RESPONSE", 3650);
        await ModelFromAsync(modelled, Loop + "_M");

        await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None);

        (await ClassOf(oldChart)).Should().BeNull("the chart is deleted with its event");
        (await ChunksOf(oldChart)).Should().Be(0, "chunks cascade");
        (await ClassOf(modelledChart)).Should().Be("RESPONSE", "an event a model was built from keeps its charts");
        (await ChunksOf(modelledChart)).Should().Be(1);
    }

    [Fact]
    public async Task Orphaned_charts_older_than_the_days_are_deleted_and_a_chart_with_its_event_stays()
    {
        var orphanRun = Guid.NewGuid();
        var orphan = await ChartAsync(orphanRun, "RESPONSE", 3650);
        var withEvent = await EventAsync("COMPLETE", 3650);
        var kept = await ChartAsync(withEvent, "RESPONSE", 3650);

        (await ResponseEvidenceRetention.PurgeOrphansAsync(_db, 3600, 1000, CancellationToken.None)).Should().BeGreaterThanOrEqualTo(1);

        (await ClassOf(orphan)).Should().BeNull();
        (await ClassOf(kept)).Should().Be("RESPONSE");
    }

    [Fact]
    public async Task The_byte_cap_trims_the_oldest_chart_first_and_never_a_kept_models_chart()
    {
        var keptRun = await EventAsync("COMPLETE", 0, loop: Loop + "_K");
        var keptChart = await ChartAsync(keptRun, "RESPONSE", 4100, bytes: 50_000);
        await ModelFromAsync(keptRun, Loop + "_K");            // the only model of its loop = the newest = kept for ever
        var oldestRun = await EventAsync("COMPLETE", 0);
        var oldest = await ChartAsync(oldestRun, "RESPONSE", 4000, bytes: 50_000);
        var nextRun = await EventAsync("COMPLETE", 0);
        var next = await ChartAsync(nextRun, "RESPONSE", 3900, bytes: 50_000);

        long used;
        await using (var conn = await _db.OpenConnectionAsync())
            used = await conn.ExecuteScalarAsync<long>("""
                SELECT COALESCE(SUM(total_bytes + @row), 0) FROM analytics.evidence_manifest
                WHERE retention_class = 'RESPONSE' AND pinned = FALSE AND readiness <> 'EXPIRED'
                """, new { row = EvidenceRetentionTiers.ManifestRowBytes });
        // a cap one chart below the class: exactly the oldest unprotected chart goes (batch 1 stops before any lab row)
        var deleted = await ResponseEvidenceRetention.TrimOverBudgetAsync(_db, used - 1, 1, CancellationToken.None);

        deleted.Should().Be(1);
        (await ClassOf(keptChart)).Should().Be("RESPONSE", "a kept model's chart is never trimmed");
        (await ClassOf(oldest)).Should().BeNull();
        (await ClassOf(next)).Should().Be("RESPONSE");
    }
}
