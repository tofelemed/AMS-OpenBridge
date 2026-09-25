using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CHG-032 — the operator actions on an episode: acknowledge, shelve, unshelve, and the
/// history of all of them. Acknowledge and shelve moved here from <see cref="CpmEventsController"/>
/// so the read path and the write path stop sharing one file; the routes are unchanged.
///
/// Shelving is its own lifecycle (ISA-18.2 §12): it never marks an episode reviewed, and
/// acknowledging never ends an active shelf. The rules are pure (<see cref="EventShelvingRules"/>);
/// the store writes the frame and its history row in one transaction.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmEventActionsController : ControllerBase
{
    private readonly EventActionStore _store;
    private readonly ICplmAuditEmitter _audit;
    private readonly ShelvingOptions _options;
    private readonly ILogger<CpmEventActionsController> _logger;

    public CpmEventActionsController(EventActionStore store, ICplmAuditEmitter audit,
        IOptions<ShelvingOptions> options, ILogger<CpmEventActionsController> logger)
    {
        _store = store;
        _audit = audit;
        _options = options.Value;
        _logger = logger;
    }

    private string Actor() =>
        User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>Acknowledge a frame: records the review. An expired shelf is cleared by it; an active shelf stays.</summary>
    [HttpPost("events/{id:long}/acknowledge")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Acknowledge(long id, [FromBody] AckRequest? request, CancellationToken ct)
    {
        var state = await _store.ReadAsync(id, ct);
        if (state is null) return NotFound();
        var decision = EventShelvingRules.Acknowledge(state);
        if (!decision.Accepted) return StatusCode(decision.Status, new { error = decision.Error });

        await _store.AcknowledgeAsync(id, Actor(), request?.Note, ct);
        _logger.LogInformation("CPLM event frame {Id} acknowledged by {User}", id, Actor());
        _audit.Emit("CPM_EVENT_ACKNOWLEDGED", Actor(), "CpmEventFrame", id.ToString(), new { note = request?.Note });
        return Ok(new { id, ackState = "ACKNOWLEDGED" });
    }

    /// <summary>
    /// Shelve a frame until a time, with a reason. A shelve without an expiry is how diagnoses
    /// get forgotten, so <c>until</c> is required and capped at the site limit; an active shelf
    /// is updated in place (its history row says so).
    /// </summary>
    [HttpPost("events/{id:long}/shelve")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Shelve(long id, [FromBody] ShelveRequest request, CancellationToken ct)
    {
        var state = await _store.ReadAsync(id, ct);
        if (state is null) return NotFound();
        var reason = request.Reason ?? request.Note;   // `note` is the pre-CHG-032 field name
        var decision = EventShelvingRules.Shelve(state, request.Until, reason, DateTimeOffset.UtcNow, _options.MaxHours);
        if (!decision.Accepted) return StatusCode(decision.Status, new { error = decision.Error, maxHours = _options.MaxHours });

        var update = decision.Action == ShelfAction.ShelveUpdated;
        await _store.ShelveAsync(id, Actor(), request.Until, reason!.Trim(), update, ct);
        _logger.LogInformation("CPLM event frame {Id} {Verb} until {Until} by {User}", id, update ? "re-shelved" : "shelved", request.Until, Actor());
        _audit.Emit(update ? "CPM_EVENT_SHELVE_UPDATED" : "CPM_EVENT_SHELVED", Actor(), "CpmEventFrame", id.ToString(),
            new { until = request.Until, reason });
        return Ok(new { id, shelfState = "SHELVED", shelveUntil = request.Until, updated = update });
    }

    /// <summary>Unshelve a frame (active or expired shelf): it returns to the queue with the ack state it had.</summary>
    [HttpPost("events/{id:long}/unshelve")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Unshelve(long id, [FromBody] UnshelveRequest? request, CancellationToken ct)
    {
        var state = await _store.ReadAsync(id, ct);
        if (state is null) return NotFound();
        var decision = EventShelvingRules.Unshelve(state, DateTimeOffset.UtcNow);
        if (!decision.Accepted) return StatusCode(decision.Status, new { error = decision.Error });

        await _store.UnshelveAsync(id, Actor(), request?.Reason, ct);
        _logger.LogInformation("CPLM event frame {Id} unshelved by {User}", id, Actor());
        _audit.Emit("CPM_EVENT_UNSHELVED", Actor(), "CpmEventFrame", id.ToString(), new { reason = request?.Reason });
        return Ok(new { id, shelfState = "NONE", ackState = state.AckState == "SHELVED" ? "UNACKNOWLEDGED" : state.AckState });
    }

    /// <summary>The episode's operator history, newest first.</summary>
    [HttpGet("events/{id:long}/actions")]
    public async Task<IActionResult> Actions(long id, CancellationToken ct)
    {
        var state = await _store.ReadAsync(id, ct);
        if (state is null) return NotFound();
        var rows = await _store.HistoryAsync(id, ct);
        return Ok(new { eventId = id, count = rows.Count, actions = rows });
    }

    /// <summary>What the UI needs to build a valid shelve request.</summary>
    [HttpGet("events/shelving-policy")]
    public IActionResult Policy() => Ok(new { maxHours = _options.MaxHours, sweepSeconds = _options.SweepSeconds });

    public sealed record AckRequest(string? Note);
    public sealed record ShelveRequest(DateTimeOffset Until, string? Reason, string? Note);
    public sealed record UnshelveRequest(string? Reason);
}
