using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Npgsql;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Tasks 1G.3 / 2C.2 (spec v6 R19 / §3.2-3.3): an IMMUTABLE method run and its evidence.
/// A method_run_id names one gate of one evaluation (loop, support, configuration, revision); it
/// resolves through any tier's row (fused, short, long) or a response event. The evidence
/// manifest carries a content ETag (If-None-Match -> 304), a readiness summary and, when nothing
/// is retained, the reconstruction action - never an empty chart.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmMethodRunsController : ControllerBase
{
    private readonly NpgsqlDataSource _db;
    private readonly MethodRunResolver _resolver;

    public CpmMethodRunsController([FromKeyedServices("cplm")] NpgsqlDataSource db, MethodRunResolver resolver)
    {
        _db = db;
        _resolver = resolver;
    }

    [HttpGet("method-runs/{id:guid}")]
    public async Task<IActionResult> GetMethodRun(Guid id, CancellationToken ct)
    {
        var loc = await _resolver.ResolveAsync(id, ct);
        if (loc is null) return NotFound(new { error = $"No result carries method run {id}" });
        if (!SiteScope.Allows(Request, loc.Site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(loc.Site));

        object? cell = null, verdictV2 = null;
        JsonElement? result = null;
        if (loc.Tier == "fusion")
        {
            var row = await FusedRowAsync(loc.RowId, ct);
            if (row is not null)
            {
                var matrix = GateMatrixProjection.Build(row);
                cell = ((List<object>)matrix["gates"]!).Cast<dynamic>().FirstOrDefault(g => (string)g.key == loc.Gate);
                verdictV2 = matrix["verdictV2"];
            }
        }
        else
        {
            result = JsonDocument.Parse(loc.PayloadJson).RootElement.Clone();
        }
        return Ok(new
        {
            methodRunId = id,
            tier = loc.Tier,
            gate = loc.Gate,
            loopId = loc.LoopId,
            site = loc.Site,
            windowKind = loc.WindowKind,
            gateResultId = loc.Tier == "fusion" ? loc.RowId : (long?)null,
            support = new { fromMs = loc.FromMs, toMs = loc.ToMs, sampleCount = loc.SampleCount },
            identity = new
            {
                bundleHash = loc.BundleHash, contextRevision = loc.ContextRevision, resultRevision = loc.ResultRevision, purpose = loc.Purpose,
                analysisRunId = loc.AnalysisRunId, sourceCommit = loc.SourceCommit, jarSha256 = loc.JarSha256, datasetHash = loc.DatasetHash, source = loc.Source,
            },
            cell,
            verdictV2,
            result,
            methodRunIds = loc.MethodRunIds ?? new Dictionary<string, string>(),
            reconstruction = MethodRunResolver.ReconstructionTier(loc.Gate) is null
                ? new { supported = false, reason = loc.Gate == "G12" ? "NOT_RECONSTRUCTABLE_EVENT_KEYED" : "UNKNOWN_GATE" }
                : new { supported = true, reason = "" },
            computedAt = loc.CreatedAt,
        });
    }

    [HttpGet("method-runs/{id:guid}/evidence")]
    public async Task<IActionResult> GetEvidence(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var site = await conn.ExecuteScalarAsync<string?>("""
            SELECT l.site FROM analytics.evidence_manifest m JOIN cpm.loop_registry l ON l.loop_id = m.provenance->>'loop_id'
            WHERE m.method_run_id = @id LIMIT 1
            """, new { id });
        if (site is null)
        {
            var loc = await _resolver.ResolveAsync(id, ct);
            site = loc?.Site;
        }
        if (!SiteScope.Allows(Request, site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(site));

        var rows = await conn.QueryAsync("""
            SELECT evidence_id, method_run_id, gate_id, artifact_kind, role_or_path, x_quantity, x_unit, y_quantity, y_unit,
                   data_type, columns::text AS columns, encoding, calculation_samples, display_points, chunk_count, total_bytes,
                   sha256, chunk_sha256::text AS chunk_sha256, readiness, readiness_reason, provenance::text AS provenance, retention_class, pinned,
                   source_commit, jar_sha256, created_at, completed_at, gate_result_id
            FROM analytics.evidence_manifest WHERE method_run_id = @id ORDER BY artifact_kind, role_or_path, evidence_id
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
            columns = JsonDocument.Parse((string)r.columns).RootElement,
            encoding = (string)r.encoding,
            calculationSamples = (int?)r.calculation_samples,
            displayPoints = (int?)r.display_points,
            chunkCount = (int)r.chunk_count,
            totalBytes = (long)r.total_bytes,
            checksum = (string)r.sha256,
            chunkChecksums = r.chunk_sha256 is null ? JsonDocument.Parse("[]").RootElement : JsonDocument.Parse((string)r.chunk_sha256).RootElement,
            chunksUrl = $"/api/v1/cpm/evidence/{(Guid)r.evidence_id}/chunks/{{n}}",
            readiness = (string)r.readiness,
            readinessReason = (string?)r.readiness_reason,
            provenance = JsonDocument.Parse((string)r.provenance).RootElement,
            retentionClass = (string)r.retention_class,
            pinned = (bool)r.pinned,
            sourceCommit = (string?)r.source_commit,
            jarSha256 = (string?)r.jar_sha256,
            createdAt = r.created_at,
            completedAt = r.completed_at,
            gateResultId = (long?)r.gate_result_id,
        }).ToList();

        var readiness = artifacts.Count == 0 ? "NONE"
            : artifacts.All(a => a.readiness == "COMPLETE") ? "COMPLETE"
            : artifacts.Any(a => a.readiness == "FAILED") ? "FAILED"
            : artifacts.Any(a => a.readiness == "PENDING") ? "PENDING"
            : artifacts.All(a => a.readiness == "EXPIRED") ? "EXPIRED" : "PARTIAL";
        var etag = "\"" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            string.Join("|", artifacts.Select(a => $"{a.artifactId}:{a.readiness}:{a.checksum}:{a.chunkCount}"))))).ToLowerInvariant() + "\"";
        Response.Headers[HeaderNames.ETag] = etag;
        Response.Headers[HeaderNames.CacheControl] = "private, no-cache";
        if (Request.Headers.TryGetValue(HeaderNames.IfNoneMatch, out var inm) && inm.Any(v => v is not null && v.Trim() == etag))
            return StatusCode(StatusCodes.Status304NotModified);
        return Ok(new
        {
            methodRunId = id,
            etag,
            readiness,
            count = artifacts.Count,
            reconstructable = true,
            reconstruct = new { purpose = "EVIDENCE_RECONSTRUCTION", methodRunId = id, endpoint = "/api/v1/cpm/analysis-runs" },
            artifacts,
        });
    }

    private async Task<dynamic?> FusedRowAsync(long rowId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.QueryFirstOrDefaultAsync("""
            SELECT id, loop_id, window_kind, window_start, window_end, sample_count, diagnosis, severity, confidence,
                   payload::text AS payload, created_at, method_run_ids::text AS method_run_ids, bundle_hash,
                   context_revision, result_revision, purpose, analysis_run_id, source_commit, jar_sha256, dataset_hash, source
            FROM analytics.cplm_gate_results WHERE id = @id
            """, new { id = rowId });
    }
}
