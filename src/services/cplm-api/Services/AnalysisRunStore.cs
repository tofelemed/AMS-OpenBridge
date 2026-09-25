using System.Text.Json;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// v2.5 (1G.4 / 2C.2): the analytics.analysis_run rows - registered BEFORE a bounded run is submitted
/// so every row it writes carries analysis_run_id, marked as the job progresses, found again by an
/// Idempotency-Key, and read back with what the run produced (gate rows; for a reconstruction, the
/// evidence manifests it emitted). Split out of CplmRecomputeService (400-500 line rule).
/// </summary>
public sealed class AnalysisRunStore
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger _logger;

    public AnalysisRunStore(NpgsqlDataSource dataSource, ILogger logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task InsertAsync(Guid id, string loopId, string purpose, string? createdBy, string? idempotencyKey,
        ReconstructionTarget? reconstruct, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO analytics.analysis_run (analysis_run_id, loop_id, purpose, state, created_by, manifest)
            VALUES (@id, @loop, @purpose, 'CREATED', @by, @manifest::jsonb)
            """;
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("loop", loopId);
        cmd.Parameters.AddWithValue("purpose", purpose);
        cmd.Parameters.AddWithValue("by", (object?)createdBy ?? DBNull.Value);
        var manifest = new Dictionary<string, object?>();
        if (idempotencyKey is not null) manifest["idempotency_key"] = idempotencyKey;
        if (reconstruct is not null)
        {
            manifest["reconstructs"] = reconstruct.MethodRunId;
            manifest["gate"] = reconstruct.Gate;
            manifest["window_kind"] = reconstruct.WindowKind;
        }
        cmd.Parameters.AddWithValue("manifest", JsonSerializer.Serialize(manifest));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task SetRequestedRangeAsync(Guid id, long fromMs, long toMs, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE analytics.analysis_run SET requested_from_ms = @f, requested_to_ms = @t WHERE analysis_run_id = @id";
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("f", fromMs);
        cmd.Parameters.AddWithValue("t", toMs);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task MarkAsync(Guid id, string state, string? jobId, string? error, CancellationToken ct)
    {
        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                UPDATE analytics.analysis_run
                SET state = @state, flink_job_id = COALESCE(@job, flink_job_id), error = @error,
                    finished_at = CASE WHEN @state IN ('FINISHED','FAILED','CANCELED','SUBMIT_FAILED') THEN NOW() ELSE finished_at END
                WHERE analysis_run_id = @id
                """;
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("state", state);
            cmd.Parameters.AddWithValue("job", (object?)jobId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("error", (object?)error ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Could not update analysis run {RunId}", id); }
    }

    public async Task<CplmRecomputeHandle?> FindByIdempotencyKeyAsync(string key, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT analysis_run_id, loop_id, purpose, flink_job_id FROM analytics.analysis_run WHERE manifest->>'idempotency_key' = @k ORDER BY created_at DESC LIMIT 1";
        cmd.Parameters.AddWithValue("k", key);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        var id = r.GetGuid(0);
        return new CplmRecomputeHandle(id.ToString("N")[..12], r.IsDBNull(3) ? "" : r.GetString(3), r.GetString(1), id, r.GetString(2));
    }

    /// <summary>
    /// The read behind GET /analysis-runs/{id}; public so AnalysisRunReadIndexTests can pin its plan. The UI polls
    /// it during every shadow / replay / reconstruction run. The manifest counts are answered from
    /// ix_evidence_manifest_analysis_run (an expression index on provenance->>'analysis_run_id') and the
    /// reconstructs probe compares uuid to uuid so ix_evidence_manifest_method_run applies - the former
    /// `method_run_id::text = ...` cast and the un-indexed provenance lookups walked the whole table (827k rows on
    /// the lab, 18 s each, a 30 s timeout in the pre-prod run of 2026-09-25).
    /// </summary>
    public const string ReadSql = """
        SELECT r.loop_id, r.purpose, r.state, r.flink_job_id, r.created_by, r.created_at, r.finished_at, r.error,
               (SELECT count(*) FROM analytics.cplm_gate_results g WHERE g.analysis_run_id = r.analysis_run_id) AS gate_results,
               r.manifest->>'reconstructs' AS reconstructs,
               (SELECT count(*) FROM analytics.evidence_manifest m WHERE m.provenance->>'analysis_run_id' = r.analysis_run_id::text) AS manifests,
               (SELECT count(*) FROM analytics.evidence_manifest m WHERE m.provenance->>'analysis_run_id' = r.analysis_run_id::text AND m.readiness = 'COMPLETE') AS complete,
               (SELECT count(*) FROM analytics.evidence_manifest m
                 WHERE m.method_run_id = (CASE WHEN r.manifest->>'reconstructs' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                               THEN (r.manifest->>'reconstructs')::uuid END)
                   AND m.readiness = 'COMPLETE') AS attached
        FROM analytics.analysis_run r WHERE r.analysis_run_id = @id
        """;

    /// <summary>The row as stored (JobState is filled by the caller from Flink).</summary>
    public async Task<AnalysisRunView?> ReadAsync(Guid analysisRunId, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = ReadSql;
        cmd.Parameters.AddWithValue("id", analysisRunId);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (!await rd.ReadAsync(ct)) return null;
        return new AnalysisRunView(analysisRunId, rd.GetString(0), rd.GetString(1), rd.GetString(2),
            rd.IsDBNull(3) ? null : rd.GetString(3), rd.IsDBNull(4) ? null : rd.GetString(4), rd.GetDateTime(5),
            rd.IsDBNull(6) ? null : rd.GetDateTime(6), rd.IsDBNull(7) ? null : rd.GetString(7), Convert.ToInt32(rd.GetValue(8)), null,
            rd.IsDBNull(9) ? null : Guid.TryParse(rd.GetString(9), out var rg) ? rg : null, Convert.ToInt32(rd.GetValue(10)), Convert.ToInt32(rd.GetValue(11)),
            Convert.ToInt32(rd.GetValue(12)));
    }
}
