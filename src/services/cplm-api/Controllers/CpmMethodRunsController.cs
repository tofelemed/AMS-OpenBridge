using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Data;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 1G.3 (spec v6 R19 / §3.2): an IMMUTABLE method run and its evidence readiness.
/// A method_run_id names one gate of one evaluation (loop, support, configuration, revision);
/// it resolves through the v1 row's method_run_ids (GIN) to that gate's slice of the payload.
/// Phase 2 (2C.2) adds the chunk download with ETags; this release serves the manifests.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmMethodRunsController : ControllerBase
{
    private readonly NpgsqlDataSource _db;

    public CpmMethodRunsController([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    private static readonly string[] Gates =
        { "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15" };

    /// <summary>OR-chain of containment probes so the GIN index answers "which row carries this run under any gate".</summary>
    private static string ContainmentPredicate(string param) =>
        string.Join(" OR ", Gates.Select(g => $"method_run_ids @> jsonb_build_object('{g}', {param}::text)"));

    [HttpGet("method-runs/{id:guid}")]
    public async Task<IActionResult> GetMethodRun(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync($"""
            SELECT id, loop_id, window_kind, window_start, window_end, sample_count, diagnosis, severity, confidence,
                   payload::text AS payload, created_at, method_run_ids::text AS method_run_ids, bundle_hash,
                   context_revision, result_revision, purpose, analysis_run_id, source_commit, jar_sha256, dataset_hash, source
            FROM analytics.cplm_gate_results
            WHERE {ContainmentPredicate("@id")}
            ORDER BY created_at DESC LIMIT 1
            """, new { id });
        if (row is null) return NotFound(new { error = $"No result carries method run {id}" });

        var ids = System.Text.Json.JsonDocument.Parse((string)row.method_run_ids).RootElement;
        string? gate = null;
        foreach (var p in ids.EnumerateObject()) if (string.Equals(p.Value.GetString(), id.ToString(), StringComparison.OrdinalIgnoreCase)) gate = p.Name;
        var matrix = GateMatrixProjection.Build(row);
        var cell = ((List<object>)matrix["gates"]!).Cast<dynamic>().FirstOrDefault(g => (string)g.key == gate);
        return Ok(new
        {
            methodRunId = id,
            gate,
            gateResultId = (long)row.id,
            loopId = (string)row.loop_id,
            windowKind = (string)row.window_kind,
            support = new { from = row.window_start, to = row.window_end, sampleCount = row.sample_count },
            identity = new
            {
                bundleHash = (string)row.bundle_hash, contextRevision = (int)row.context_revision,
                resultRevision = (int)row.result_revision, purpose = (string)row.purpose,
                analysisRunId = (Guid?)row.analysis_run_id, sourceCommit = (string?)row.source_commit,
                jarSha256 = (string?)row.jar_sha256, datasetHash = (string?)row.dataset_hash, source = (string)row.source,
            },
            cell,
            verdictV2 = matrix["verdictV2"],
            computedAt = row.created_at,
        });
    }

    [HttpGet("method-runs/{id:guid}/evidence")]
    public async Task<IActionResult> GetEvidence(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("""
            SELECT evidence_id, method_run_id, gate_id, artifact_kind, role_or_path, x_quantity, x_unit, y_quantity, y_unit,
                   data_type, columns::text AS columns, encoding, calculation_samples, display_points, chunk_count, total_bytes,
                   sha256, readiness, readiness_reason, provenance::text AS provenance, retention_class, pinned,
                   source_commit, jar_sha256, created_at, completed_at, gate_result_id
            FROM analytics.evidence_manifest WHERE method_run_id = @id ORDER BY artifact_kind, role_or_path
            """, new { id });
        var artifacts = rows.Select(r => new
        {
            artifactId = (Guid)r.evidence_id,
            methodRunId = (Guid)r.method_run_id,
            gate = (string)r.gate_id,
            kind = (string)r.artifact_kind,
            roleOrPath = (string?)r.role_or_path,
            x = new { quantity = (string?)r.x_quantity, unit = (string?)r.x_unit },
            y = new { quantity = (string?)r.y_quantity, unit = (string?)r.y_unit },
            dataType = (string)r.data_type,
            columns = System.Text.Json.JsonDocument.Parse((string)r.columns).RootElement,
            encoding = (string)r.encoding,
            calculationSamples = (int?)r.calculation_samples,
            displayPoints = (int?)r.display_points,
            chunkCount = (int)r.chunk_count,
            totalBytes = (long)r.total_bytes,
            checksum = (string)r.sha256,
            readiness = (string)r.readiness,
            readinessReason = (string?)r.readiness_reason,
            provenance = System.Text.Json.JsonDocument.Parse((string)r.provenance).RootElement,
            retentionClass = (string)r.retention_class,
            pinned = (bool)r.pinned,
            sourceCommit = (string?)r.source_commit,
            jarSha256 = (string?)r.jar_sha256,
            createdAt = r.created_at,
            completedAt = r.completed_at,
            gateResultId = (long?)r.gate_result_id,
        }).ToList();
        return Ok(new { methodRunId = id, count = artifacts.Count, artifacts });
    }
}
