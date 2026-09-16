using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 1D.5 (spec v6 R11) — GET /api/v1/cpm/loops/{loopId}/conditions: the fast-path
/// G10 limit-dwell and G11 freeze conditions (OPEN / UPDATE / CLOSED with reasons), as
/// produced by CplmConditionStreamJob and persisted verbatim. Nothing is computed here.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmConditionsController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;

    public CpmConditionsController([FromKeyedServices("cplm")] NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    [HttpGet("loops/{loopId}/conditions")]
    public async Task<IActionResult> GetConditions(
        string loopId,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        [FromQuery] bool openOnly = false,
        [FromQuery] int limit = 200,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 2000);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync(ConditionEventStore.SelectForLoopSql, new
        {
            loopId,
            fromMs = from?.ToUnixTimeMilliseconds(),
            toMs = to?.ToUnixTimeMilliseconds(),
            openOnly,
            limit
        });

        var conditions = rows.Select(r => new
        {
            loopId = (string)r.loop_id,
            gate = (string)r.gate,
            kind = (string)r.kind,
            state = (string)r.state,
            startMs = (long)r.start_ms,
            lastMs = (long)r.last_ms,
            endMs = (long?)r.end_ms,
            durationS = (double)r.duration_s,
            closeReason = (string)r.close_reason,
            evidence = ParseJson((string?)r.evidence),
            emittedAtMs = (long?)r.emitted_at_ms,
            sourceCommit = (string?)r.source_commit,
            jarSha256 = (string?)r.jar_sha256,
            updatedAt = (DateTime)r.updated_at
        }).ToList();

        return Ok(new { loopId, count = conditions.Count, openOnly, conditions });
    }

    private static JsonElement ParseJson(string? json)
    {
        try { return JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json).RootElement.Clone(); }
        catch (JsonException) { return JsonDocument.Parse("{}").RootElement.Clone(); }
    }
}
