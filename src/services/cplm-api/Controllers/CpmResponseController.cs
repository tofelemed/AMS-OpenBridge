using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 2B.2 (spec v6 §2.2, §6.5): G12 response events as the kernel produced them - every
/// event including the rejected and censored ones, with its reason, and the 52 catalogue
/// quantities of a run (null WITH reason). Cursor-paged by t0 descending.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmResponseController : ControllerBase
{
    private readonly NpgsqlDataSource _db;

    public CpmResponseController([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    [HttpGet("loops/{loopId}/response-events")]
    public async Task<IActionResult> List(string loopId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] long? cursor, [FromQuery] int limit = 50, [FromQuery] string purpose = "LIVE", CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = (await conn.QueryAsync("""
            SELECT event_id, method_run_id, event_type, path_id, t0_ms, t_end_ms, capture_state, censor_reason, evaluation_state, eligibility,
                   finding, model_state, purpose, bundle_hash, result_revision, emitted_at_ms
            FROM analytics.response_event
            WHERE lower(loop_id) = lower(@loopId) AND purpose = @purpose
              AND (@fromMs::bigint IS NULL OR t0_ms >= @fromMs) AND (@toMs::bigint IS NULL OR t0_ms < @toMs)
              AND (@cursor::bigint IS NULL OR t0_ms < @cursor)
            ORDER BY t0_ms DESC LIMIT @limit
            """, new { loopId, purpose, fromMs = from?.ToUnixTimeMilliseconds(), toMs = to?.ToUnixTimeMilliseconds(), cursor, limit })).ToList();
        var events = rows.Select(r => new
        {
            eventId = (Guid)r.event_id, methodRunId = (Guid)r.method_run_id, eventType = (string)r.event_type, pathId = (string)r.path_id,
            t0Ms = (long)r.t0_ms, tEndMs = (long?)r.t_end_ms, captureState = (string)r.capture_state, censorReason = (string)r.censor_reason,
            evaluationState = (string)r.evaluation_state, eligibility = (string)r.eligibility, finding = (string)r.finding,
            modelState = (string)r.model_state, purpose = (string)r.purpose, bundleHash = (string)r.bundle_hash,
            resultRevision = (int)r.result_revision, emittedAtMs = (long?)r.emitted_at_ms,
        }).ToList();
        return Ok(new { loopId, purpose, count = events.Count, nextCursor = events.Count == limit ? events[^1].t0Ms : (long?)null, events });
    }

    /// <summary>One event in full: subgates, the 52 quantities, identity. Immutable for its method_run_id.</summary>
    [HttpGet("response-events/{eventId:guid}")]
    public async Task<IActionResult> Get(Guid eventId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync("SELECT result::text AS result, method_run_id FROM analytics.response_event WHERE event_id = @eventId", new { eventId });
        if (row is null) return NotFound(new { error = $"response event {eventId} not found" });
        var metrics = (await conn.QueryAsync("""
            SELECT quantity_id, value, unit, path_id, uncertainty, method, support_from_ms, support_to_ms, config_hash, reason
            FROM analytics.response_metric WHERE method_run_id = @run ORDER BY quantity_id
            """, new { run = (Guid)row.method_run_id })).Select(m => new
        {
            quantityId = (string)m.quantity_id, value = (double?)m.value, unit = (string)m.unit, pathId = (string)m.path_id,
            uncertainty = (double?)m.uncertainty, method = (string)m.method, supportFromMs = (long?)m.support_from_ms,
            supportToMs = (long?)m.support_to_ms, configHash = (string)m.config_hash, reasonIfNull = (string)m.reason,
        }).ToList();
        using var doc = JsonDocument.Parse((string)row.result);
        return Ok(new { result = doc.RootElement.Clone(), metrics });
    }
}
