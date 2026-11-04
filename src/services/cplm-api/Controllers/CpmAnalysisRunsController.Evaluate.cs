using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.OnDemand;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CHG-102 Phase 5c — POST /analysis-runs {purpose: "EVALUATE", loopId, windowKind?, endMs?}: one loop over one window
/// [endMs - windowKind, endMs), evaluated from the historian by the always-running on-demand Flink job (no job start per
/// click). 202 = queued; 200 = an existing run for the same window (cached: true when it finished and its evidence is
/// still held, false when it is still in flight, or the run an Idempotency-Key named). Poll statusUrl until finished.
/// </summary>
public sealed partial class CpmAnalysisRunsController
{
    private async Task<IActionResult> Evaluate(CreateRequest req, CancellationToken ct)
    {
        if (!_evaluation.Options.Enabled)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "ON_DEMAND_DISABLED", message = "on-demand evaluation is turned off (Cplm:OnDemand:Enabled)" });
        if (string.IsNullOrWhiteSpace(req.LoopId)) return BadRequest(new { error = "loopId is required" });
        var loop = await _registry.GetAsync(req.LoopId, ct);
        if (loop is null) return NotFound(new { error = $"Loop '{req.LoopId}' is not registered" });
        if (!SiteScope.Allows(Request, loop.Site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(loop.Site));
        var (window, error) = EvaluationWindow.Resolve(req.WindowKind, req.EndMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), _historianRetentionDays);
        if (window is null) return BadRequest(new { error = "INVALID_WINDOW", message = error });

        var idempotencyKey = Request.Headers.TryGetValue("Idempotency-Key", out var k) ? k.ToString() : null;
        var actor = User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";   // edge-trust claims, never a raw header
        var start = await _evaluation.StartAsync(loop, window, string.IsNullOrWhiteSpace(actor) ? null : actor, idempotencyKey, ct);
        switch (start.Outcome)
        {
            case EvaluationOutcome.TooManyInFlight:
                return StatusCode(StatusCodes.Status429TooManyRequests, new { error = "TOO_MANY_EVALUATIONS_IN_FLIGHT", message = start.Error });
            case EvaluationOutcome.IdempotencyKeyReused:
                return Conflict(new { error = "IDEMPOTENCY_KEY_REUSED", message = start.Error });
            case EvaluationOutcome.PublishFailed:
                return StatusCode(StatusCodes.Status502BadGateway, new { error = "ANALYSIS_RUN_SUBMIT_FAILED", analysisRunId = start.AnalysisRunId, message = start.Error });
        }
        var id = start.AnalysisRunId!.Value;
        if (start.Outcome == EvaluationOutcome.Accepted)
            return Accepted($"/api/v1/cpm/analysis-runs/{id}", new
            {
                analysisRunId = id,
                loopId = loop.LoopId,
                purpose = "EVALUATE",
                state = EvaluationStates.Queued,
                cached = false,
                windowKind = window.WindowKind,
                fromMs = window.FromMs,
                toMs = window.ToMs,
                statusUrl = $"/api/v1/cpm/analysis-runs/{id}",
            });
        // an existing run: the same body GET serves, with cached = finished-and-held. Every reuse path matched the requested
        // loop, whose site was checked above; re-checked here so a reused run can never leak another loop or site.
        var view = await _evaluation.ReadAsync(id, ct);
        if (view is null) return NotFound(new { error = $"No analysis run {id}" });
        if (!string.Equals(view.LoopId, loop.LoopId, StringComparison.OrdinalIgnoreCase))
            return Conflict(new { error = "IDEMPOTENCY_KEY_REUSED", message = "the matched run belongs to another loop" });
        return Ok(EvaluationService.View(view, cached: start.Outcome == EvaluationOutcome.Cached));
    }
}
