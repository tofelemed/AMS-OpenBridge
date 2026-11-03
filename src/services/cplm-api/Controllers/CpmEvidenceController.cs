using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 2C.2 (spec §3.3; NR-034, NR-060): the bytes of an evidence artifact. A chunk is one
/// piece of the artifact's f64le+gzip stream (the client concatenates the chunks in order, then
/// gunzips); its ETag is its SHA-256, it never changes, so the browser may cache it forever.
/// PENDING artifacts are 409 (come back later), EXPIRED ones 404 with the reason (the manifest
/// stays), and a site outside the caller's scope is 403 whatever the artifact.
/// </summary>
[ApiController]
[Route("api/v1/cpm/evidence")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmEvidenceController : ControllerBase
{
    public const string CacheControl = "private, immutable, max-age=31536000";
    private readonly NpgsqlDataSource _db;
    private readonly IEvidenceBlobStore _store;

    public CpmEvidenceController([FromKeyedServices("cplm")] NpgsqlDataSource db, IEvidenceBlobStore store)
    {
        _db = db;
        _store = store;
    }

    [HttpGet("{id:guid}/chunks/{n:int}")]
    public async Task<IActionResult> GetChunk(Guid id, int n, CancellationToken ct)
    {
        var manifest = await _store.GetManifestAsync(id, ct);
        // CHG-102 Phase 5b-1: swept (or EXPIRED) live evidence is served from the boundary archive, byte for byte
        if (manifest is null || manifest.Readiness == "EXPIRED")
            if (await ArchivedChunkAsync(id, n, ct) is { } archived) return archived;
        if (manifest is null) return NotFound(new { error = "EVIDENCE_NOT_FOUND", evidenceId = id });
        if (!SiteScope.Allows(Request, await SiteOfAsync(id, ct))) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(null));
        if (manifest.Readiness == "EXPIRED")
            return NotFound(new { error = "EVIDENCE_EXPIRED", evidenceId = id, reason = manifest.ReadinessReason ?? "retention", reconstructable = true });
        if (manifest.Readiness != "COMPLETE")
            return StatusCode(StatusCodes.Status409Conflict, new { error = "EVIDENCE_PENDING", evidenceId = id, readiness = manifest.Readiness, reason = manifest.ReadinessReason });
        if (n < 0 || n >= manifest.ChunkCount) return NotFound(new { error = "CHUNK_OUT_OF_RANGE", evidenceId = id, chunk = n, chunkCount = manifest.ChunkCount });

        var chunk = await _store.GetChunkAsync(id, n, ct);
        if (chunk is null) return NotFound(new { error = "CHUNK_MISSING", evidenceId = id, chunk = n });
        return ChunkResult(chunk, n, manifest.ChunkCount);
    }

    /// <summary>The chunk response: its SHA-256 as the ETag, immutable caching, If-None-Match -> 304.</summary>
    private IActionResult ChunkResult(EvidenceChunkSpec chunk, int n, int chunkCount)
    {
        var etag = new EntityTagHeaderValue($"\"{chunk.Sha256}\"");
        Response.Headers[HeaderNames.CacheControl] = CacheControl;
        Response.Headers["X-Evidence-Chunk"] = $"{n}/{chunkCount}";
        Response.Headers["X-Evidence-Encoding"] = "f64le+gzip";
        Response.Headers["X-Evidence-Sha256"] = chunk.Sha256;
        if (Request.Headers.TryGetValue(HeaderNames.IfNoneMatch, out var inm) && inm.Any(v => v is not null && v.Trim() == etag.Tag.ToString()))
        {
            Response.Headers[HeaderNames.ETag] = etag.ToString();
            return StatusCode(StatusCodes.Status304NotModified);
        }
        var file = File(chunk.Payload, "application/octet-stream");
        file.EntityTag = etag;
        return file;
    }

    /// <summary>
    /// CHG-102 Phase 5b-1: a chunk of an archived artifact (null = not archived). Same answers as the live path: 403 outside
    /// the caller's sites, 404 out of range; the archived bytes are the originals, so the ETag and checksum are unchanged.
    /// </summary>
    private async Task<IActionResult?> ArchivedChunkAsync(Guid id, int n, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var artifact = await EvidenceArchiveReader.ArtifactAsync(conn, id, ct);
        if (artifact is null) return null;
        if (!SiteScope.Allows(Request, await EvidenceArchiveReader.SiteOfAsync(conn, id, byEvidenceId: true, ct)))
            return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(null));
        var count = artifact.Manifest.ChunkCount;
        if (n < 0 || n >= count || n >= artifact.Chunks.Count)
            return NotFound(new { error = "CHUNK_OUT_OF_RANGE", evidenceId = id, chunk = n, chunkCount = count });
        Response.Headers["X-Evidence-Source"] = "archive";
        return ChunkResult(artifact.Chunks[n], n, count);
    }

    private async Task<string?> SiteOfAsync(Guid evidenceId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<string?>("""
            SELECT l.site FROM analytics.evidence_manifest m
            LEFT JOIN cpm.loop_registry l ON l.loop_id = m.provenance->>'loop_id'
            WHERE m.evidence_id = @id
            """, new { id = evidenceId });
    }
}
