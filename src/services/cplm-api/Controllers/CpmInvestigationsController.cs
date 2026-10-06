using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 2D.2 (spec §3.4, R24; NR-062): investigations. A reference names a loop, optionally the
/// method run it was opened from, the evidence it rests on (pinned from now on), a note and an
/// explicit outcome - WORK_COMPLETED | PERFORMANCE_RESTORED | INCONCLUSIVE (default). "Work
/// completed" is never inferred to mean "performance restored"; a person states it. Replaces the
/// note-on-acknowledge convention.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
public sealed class CpmInvestigationsController : ControllerBase
{
    public sealed record CreateRequest(string LoopId, Guid? MethodRunId, Guid[]? EvidenceIds, string? Note, string? Outcome, long? EventId = null);
    public sealed record OutcomeRequest(string Outcome, string? Note);
    public sealed record EventLinkRequest(long? EventId);

    /// <summary>CHG-058: a loop note is a short engineering record, not a document store.</summary>
    public const int MaxNoteLength = 4000;

    private readonly InvestigationStore _store;

    public CpmInvestigationsController(InvestigationStore store) => _store = store;

    private string Actor() => User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";   // claims from the edge-trust handler, never a raw header

    [HttpPost("investigations")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Create([FromBody] CreateRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.LoopId)) return BadRequest(new { error = "loopId is required" });
        var outcome = (req.Outcome ?? "INCONCLUSIVE").Trim().ToUpperInvariant();
        if (!InvestigationStore.Outcomes.Contains(outcome)) return BadRequest(new { error = $"Unknown outcome '{req.Outcome}'", allowed = InvestigationStore.Outcomes });
        if ((req.Note?.Length ?? 0) > MaxNoteLength) return BadRequest(new { error = $"note is longer than {MaxNoteLength} characters" });
        var evidence = req.EvidenceIds ?? Array.Empty<Guid>();
        var missing = await _store.MissingEvidenceAsync(evidence, ct);
        if (missing.Length > 0) return NotFound(new { error = "EVIDENCE_NOT_FOUND", evidenceIds = missing });
        if (req.EventId is long e)
        {
            // CHG-058: an episode can only carry notes about its own loop
            var eventLoop = await _store.EventLoopAsync(e, ct);
            if (eventLoop is null) return NotFound(new { error = "EVENT_NOT_FOUND", eventId = e });
            if (!string.Equals(eventLoop, req.LoopId.Trim(), StringComparison.OrdinalIgnoreCase))
                return UnprocessableEntity(new { error = "EVENT_OTHER_LOOP", eventId = e, eventLoopId = eventLoop });
        }
        var view = await _store.CreateAsync(req.LoopId.Trim(), req.MethodRunId, evidence, req.Note?.Trim() ?? "", outcome, Actor(), ct, req.EventId);
        return Created($"/api/v1/cpm/investigations/{view.RefId}", Shape(view));
    }

    [HttpPatch("investigations/{id:guid}/outcome")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> SetOutcome(Guid id, [FromBody] OutcomeRequest req, CancellationToken ct)
    {
        var outcome = (req.Outcome ?? "").Trim().ToUpperInvariant();
        if (!InvestigationStore.Outcomes.Contains(outcome)) return BadRequest(new { error = $"Unknown outcome '{req.Outcome}'", allowed = InvestigationStore.Outcomes });
        var view = await _store.SetOutcomeAsync(id, outcome, req.Note?.Trim(), Actor(), ct);
        return view is null ? NotFound(new { error = $"No investigation {id}" }) : Ok(Shape(view));
    }

    /// <summary>CHG-058: link a loop note to a diagnosis episode of its loop (null unlinks). Never acknowledges the episode.</summary>
    [HttpPatch("investigations/{id:guid}/event")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> LinkEvent(Guid id, [FromBody] EventLinkRequest req, CancellationToken ct)
    {
        var (result, view) = await _store.LinkEventAsync(id, req.EventId, Actor(), ct);
        return result switch
        {
            EventLinkResult.NoInvestigation => NotFound(new { error = $"No investigation {id}" }),
            EventLinkResult.NoEvent => NotFound(new { error = "EVENT_NOT_FOUND", eventId = req.EventId }),
            EventLinkResult.OtherLoop => UnprocessableEntity(new { error = "EVENT_OTHER_LOOP", eventId = req.EventId, loopId = view!.LoopId }),
            _ => Ok(Shape(view!)),
        };
    }

    /// <summary>CHG-058: the loop notes linked to one diagnosis episode.</summary>
    [HttpGet("events/{eventId:long}/investigations")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> ForEvent(long eventId, CancellationToken ct)
    {
        var items = await _store.ForEventAsync(eventId, ct);
        return Ok(new { eventId, count = items.Count, investigations = items.Select(Shape) });
    }

    [HttpGet("investigations/{id:guid}")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var view = await _store.GetAsync(id, ct);
        return view is null ? NotFound(new { error = $"No investigation {id}" }) : Ok(Shape(view));
    }

    [HttpGet("loops/{loopId}/investigations")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> ForLoop(string loopId, CancellationToken ct)
    {
        var items = await _store.ForLoopAsync(loopId, ct);
        return Ok(new { loopId, count = items.Count, investigations = items.Select(Shape) });
    }

    private static object Shape(InvestigationView v) => new
    {
        refId = v.RefId, loopId = v.LoopId, methodRunId = v.MethodRunId, evidenceIds = v.EvidenceIds, note = v.Note, outcome = v.Outcome,
        outcomeSemantics = "WORK_COMPLETED is not PERFORMANCE_RESTORED; INCONCLUSIVE until a person states otherwise",
        createdBy = v.CreatedBy, createdAt = v.CreatedAt, updatedBy = v.UpdatedBy, updatedAt = v.UpdatedAt, pinned = v.Pinned, eventId = v.EventId,
        evidenceUrl = v.MethodRunId is null ? null : $"/api/v1/cpm/method-runs/{v.MethodRunId}/evidence",
    };
}
