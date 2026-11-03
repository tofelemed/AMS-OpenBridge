using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CHG-102 Phase 5b-1: the archived 12 h / 24 h boundary evidence sets of one loop (analytics.evidence_archive_run),
/// newest first, without payload. Each set lists its method run ids: GET method-runs/{id}/evidence serves an archived run
/// exactly as a live one (source ARCHIVE). Default range: the last 30 days; windowKind 12h | 24h filters.
/// </summary>
[ApiController]
[Route("api/v1/cpm/loops/{loopId}/evidence/archive")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmEvidenceArchiveController : ControllerBase
{
    private const int MaxSets = 500;
    private readonly NpgsqlDataSource _db;

    public CpmEvidenceArchiveController([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    [HttpGet("")]
    public async Task<IActionResult> List(string loopId, [FromQuery] DateTimeOffset? from = null, [FromQuery] DateTimeOffset? to = null,
        [FromQuery] string? windowKind = null, [FromQuery] int limit = 200, CancellationToken ct = default)
    {
        var upper = (to ?? DateTimeOffset.UtcNow).UtcDateTime;
        var lower = (from ?? upper.AddDays(-30)).UtcDateTime;
        if (lower > upper) return BadRequest(new { error = "RANGE", detail = "from must not be after to" });
        if (windowKind is not null && windowKind is not ("12h" or "24h"))
            return BadRequest(new { error = "WINDOW_KIND", detail = "windowKind must be 12h or 24h", windowKind });

        await using var conn = await _db.OpenConnectionAsync(ct);
        var reg = await conn.QuerySingleOrDefaultAsync(new CommandDefinition(
            "SELECT loop_id, site FROM cpm.loop_registry WHERE lower(loop_id) = lower(@loopId)", new { loopId }, cancellationToken: ct));
        if (reg is null) return NotFound(new { error = $"Loop '{loopId}' is not registered" });
        if (!SiteScope.Allows(Request, (string?)reg.site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden((string?)reg.site));

        var sets = await EvidenceArchiveReader.ListForLoopAsync(conn, (string)reg.loop_id, lower, upper, windowKind,
            Math.Clamp(limit, 1, MaxSets), ct);
        return Ok(new
        {
            loopId = (string)reg.loop_id,
            from = lower,
            to = upper,
            windowKind,
            count = sets.Count,
            sets = sets.Select(s => new
            {
                boundarySetId = s.BoundarySetId,
                windowKind = s.WindowKind,
                windowStart = s.WindowStart,
                windowEnd = s.WindowEnd,
                plantTz = s.PlantTz,
                boundaryKind = s.BoundaryKind,
                boundaryLocalEnd = s.BoundaryLocalEnd,
                artifactCount = s.ArtifactCount,
                missingCount = s.MissingCount,
                packBytes = s.PayloadBytes,
                sourceBytes = s.SourceBytes,
                methodRunIds = s.MethodRunIds,
                archivedAt = s.ArchivedAt,
            }),
        });
    }
}
