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
    private readonly EvidenceManifestReader _manifests;

    public CpmMethodRunsController([FromKeyedServices("cplm")] NpgsqlDataSource db, MethodRunResolver resolver)
    {
        _db = db;
        _resolver = resolver;
        _manifests = new EvidenceManifestReader(resolver);
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
        var site = await _manifests.SiteOfAsync(conn, id, ct);
        if (!SiteScope.Allows(Request, site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(site));

        var manifest = await _manifests.ReadAsync(conn, id, site, ct);
        Response.Headers[HeaderNames.ETag] = manifest.Etag;
        Response.Headers[HeaderNames.CacheControl] = "private, no-cache";
        if (IfNoneMatchHits(manifest.Etag)) return StatusCode(StatusCodes.Status304NotModified);
        return Ok(manifest.ToResponse());
    }

    /// <summary>
    /// v2.5 workbench batching: the manifests of several runs in one call (the selected gate plus the
    /// G0 / G1 / G11 context-lane siblings). Unknown ids - and ids outside the caller's site scope - are
    /// served as null, never as an error for the whole batch. At most 20 ids.
    /// </summary>
    [HttpPost("method-runs/evidence/batch")]
    public async Task<IActionResult> GetEvidenceBatch([FromBody] EvidenceBatchRequest body, CancellationToken ct)
    {
        var ids = (body.MethodRunIds ?? Array.Empty<Guid>()).Distinct().ToArray();
        if (ids.Length == 0 || ids.Length > 20)
            return BadRequest(new { error = "BATCH_SIZE", detail = "methodRunIds must name 1..20 runs", count = ids.Length });
        await using var conn = await _db.OpenConnectionAsync(ct);
        var manifests = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var id in ids)
        {
            var site = await _manifests.SiteOfAsync(conn, id, ct);
            if (site is null || !SiteScope.Allows(Request, site)) { manifests[id.ToString()] = null; continue; }
            var m = await _manifests.ReadAsync(conn, id, site, ct);
            // CHG-099: a run whose only evidence is a reconstruction (nothing retained) still has a manifest
            manifests[id.ToString()] = m.Metas.Count == 0 && m.Reconstructions.Count == 0 ? null : m.ToResponse();
        }
        Response.Headers[HeaderNames.CacheControl] = "private, no-cache";
        return Ok(new { count = ids.Length, manifests });
    }

    /// <summary>
    /// v2.5 workbench batching: every COMPLETE artifact of the run in one framed body (see
    /// <see cref="EvidenceManifestReader.BundleAsync"/>), under the manifest's ETag so If-None-Match and
    /// the browser cache behave exactly as for the manifest. PENDING / EXPIRED artifacts are omitted -
    /// the manifest says why; a run without evidence is 404 with the reconstruction pointer.
    /// </summary>
    [HttpGet("method-runs/{id:guid}/evidence/bundle")]
    public async Task<IActionResult> GetEvidenceBundle(Guid id, CancellationToken ct, [FromQuery] Guid? set = null)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var site = await _manifests.SiteOfAsync(conn, id, ct);
        if (!SiteScope.Allows(Request, site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(site));
        var manifest = await _manifests.ReadAsync(conn, id, site, ct);
        if (manifest.Metas.Count == 0 && (set is null || !manifest.ReconstructionMetas.ContainsKey(set.Value)))
            return NotFound(new { error = "EVIDENCE_NOT_FOUND", methodRunId = id, reconstructable = true, reconstruct = new { purpose = "EVIDENCE_RECONSTRUCTION", methodRunId = id, endpoint = "/api/v1/cpm/analysis-runs" } });

        var etag = new EntityTagHeaderValue(manifest.Etag);
        Response.Headers[HeaderNames.CacheControl] = CpmEvidenceController.CacheControl;
        Response.Headers["X-Evidence-Bundle"] = "v1";
        Response.Headers["X-Evidence-Encoding"] = "f64le+gzip";
        Response.Headers["X-Evidence-Readiness"] = manifest.Readiness;
        if (IfNoneMatchHits(manifest.Etag))
        {
            Response.Headers[HeaderNames.ETag] = manifest.Etag;
            return StatusCode(StatusCodes.Status304NotModified);
        }
        // CHG-099: ?set=<analysisRunId> bundles that reconstruction's rows (stored beside the original); default = the run's own set
        var bytes = await EvidenceManifestReader.BundleAsync(conn, manifest, ct, set);
        var file = File(bytes, "application/octet-stream");
        file.EntityTag = etag;
        return file;
    }

    private bool IfNoneMatchHits(string etag) =>
        Request.Headers.TryGetValue(HeaderNames.IfNoneMatch, out var inm) && inm.Any(v => v is not null && v.Trim() == etag);

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

/// <summary>Body of <c>POST /method-runs/evidence/batch</c>.</summary>
public sealed record EvidenceBatchRequest(Guid[] MethodRunIds);
