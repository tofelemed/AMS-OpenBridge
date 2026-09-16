using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 1H.5 (spec v6 §4.7): a loop's transmitter health — per signal role, the device
/// bound as-of, its native NE107 state, collection freshness and the CPA eligibility Flink
/// decided. NOT_CONFIGURED when no device is bound; never a manufactured OK.
/// </summary>
[ApiController]
[Route("api/v1/cpm/loops/{loopId}/instrument-health")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmInstrumentHealthController : ControllerBase
{
    private readonly InstrumentHealthReads _reads;

    public CpmInstrumentHealthController(InstrumentHealthReads reads) => _reads = reads;

    /// <summary>Health as-of <c>at</c> (default now).</summary>
    [HttpGet]
    public async Task<IActionResult> Get(string loopId, [FromQuery] DateTime? at, CancellationToken ct)
    {
        var instant = (at ?? DateTime.UtcNow).ToUniversalTime();
        var h = await _reads.GetAsOfAsync(loopId, instant, ct);
        return h is null ? NotFound(new { error = $"Loop '{loopId}' is not registered" }) : Ok(h);
    }

    /// <summary>Eligibility intervals over a range (newest first), including availability gaps and device replacements as separate rows.</summary>
    [HttpGet("history")]
    public async Task<IActionResult> History(string loopId, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int limit = 200, CancellationToken ct = default)
    {
        var end = (to ?? DateTime.UtcNow).ToUniversalTime();
        var start = (from ?? end.AddDays(-7)).ToUniversalTime();
        if (end <= start) return BadRequest(new { error = "from must be before to" });
        limit = Math.Clamp(limit, 1, 1000);
        var rows = await _reads.HistoryAsync(loopId, start, end, limit, ct);
        return Ok(new { loopId, from = start, to = end, count = rows.Count, intervals = rows });
    }
}
