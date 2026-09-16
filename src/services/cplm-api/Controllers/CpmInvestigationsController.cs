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
    public sealed record CreateRequest(string LoopId, Guid? MethodRunId, Guid[]? EvidenceIds, string? Note, string? Outcome);
    public sealed record OutcomeRequest(string Outcome, string? Note);

    private readonly InvestigationStore _store;

    public CpmInvestigationsController(InvestigationStore store) => _store = store;

    private string Actor() => User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? Request.Headers["X-Auth-User"].ToString();

    [HttpPost("investigations")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Create([FromBody] CreateRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.LoopId)) return BadRequest(new { error = "loopId is required" });
        var outcome = (req.Outcome ?? "INCONCLUSIVE").Trim().ToUpperInvariant();
        if (!InvestigationStore.Outcomes.Contains(outcome)) return BadRequest(new { error = $"Unknown outcome '{req.Outcome}'", allowed = InvestigationStore.Outcomes });
        var evidence = req.EvidenceIds ?? Array.Empty<Guid>();
        var missing = await _store.MissingEvidenceAsync(evidence, ct);
        if (missing.Length > 0) return NotFound(new { error = "EVIDENCE_NOT_FOUND", evidenceIds = missing });
        var view = await _store.CreateAsync(req.LoopId.Trim(), req.MethodRunId, evidence, req.Note?.Trim() ?? "", outcome, Actor(), ct);
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
        createdBy = v.CreatedBy, createdAt = v.CreatedAt, updatedBy = v.UpdatedBy, updatedAt = v.UpdatedAt, pinned = v.Pinned,
        evidenceUrl = v.MethodRunId is null ? null : $"/api/v1/cpm/method-runs/{v.MethodRunId}/evidence",
    };
}
