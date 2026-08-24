// Extraction Phase 3 COPY of AMS.Api Controllers/V1/CpmLoopsController.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using Traverse.CplmApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CPLM Phase 4 — loop registry and onboarding.
///
/// Unlike the CPA reference (where every equivalent endpoint was
/// [AllowAnonymous] behind a test-auth bypass), these require real permissions:
/// onboarding decides what the diagnosis engine evaluates and what operators
/// are told about their plant.
/// </summary>
[ApiController]
[Route("api/v1/cpm/loops")]
[Authorize]
public sealed class CpmLoopsController : ControllerBase
{
    /// <summary>Bulk ceiling. The work is one transaction plus a handful of
    /// batched asset writes, so the bound is request size and gateway timeout,
    /// not per-row cost.</summary>
    private const int MaxBulkLoops = 5000;

    private readonly ICpmLoopRegistryService _registry;
    private readonly ICplmAuditEmitter _audit;
    private readonly ILogger<CpmLoopsController> _logger;

    public CpmLoopsController(
        ICpmLoopRegistryService registry, ICplmAuditEmitter audit, ILogger<CpmLoopsController> logger)
    {
        _registry = registry;
        _audit = audit;
        _logger = logger;
    }

    private string Actor() =>
        User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>All registered loops with their signal-role mapping and peer links.</summary>
    [HttpGet]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var loops = await _registry.GetAllAsync(ct);
        return Ok(new { loops, count = loops.Count });
    }

    /// <summary>One loop, including observability flags that explain gate degradations.</summary>
    [HttpGet("{loopId}")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> Get(string loopId, CancellationToken ct)
    {
        var loop = await _registry.GetAsync(loopId, ct);
        return loop is null ? NotFound(new { error = $"Loop '{loopId}' is not registered" }) : Ok(loop);
    }

    /// <summary>
    /// Onboard (or re-onboard) a loop. Requires site, loopType and the PV/SP/OP/MODE
    /// signal roles when monitoring is enabled. Publishes loop evidence to the CPLM
    /// broadcast so the gate engine picks up peer links without a restart.
    /// </summary>
    [HttpPost("activate")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Activate([FromBody] CpmLoopActivateRequest request, CancellationToken ct)
    {
        try
        {
            var loop = await _registry.ActivateAsync(request, ct);
            _logger.LogInformation("Loop {LoopId} activated ({LoopType} at {Site})",
                loop.LoopId, loop.LoopType, loop.Site);
            _audit.Emit("CPM_LOOP_ACTIVATED", Actor(), "CpmLoop", loop.LoopId,
                new { loop.LoopType, loop.Site, loop.MonitoringEnabled, links = loop.Links.Count });
            return Ok(loop);
        }
        catch (ArgumentException ex)
        {
            // 422: the request is well-formed JSON but not a viable loop definition.
            return UnprocessableEntity(new { error = "REGISTRY_VALIDATION", message = ex.Message });
        }
        catch (LoopIdCollisionException ex)
        {
            // 409: the id cannot coexist with a registered loop - either the same id
            // in a different casing, or one that sanitises to the same historian device.
            return Conflict(new { error = ex.Code, message = ex.Message });
        }
        catch (LoopLocationException ex)
        {
            // 422: the site/area/unit chain is not in the asset model (G-07) and the
            // caller did not opt out with allowUnmodelledLocation.
            return UnprocessableEntity(new { error = "LOCATION_NOT_IN_UNS", message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = "LOOP_ID_CASE_COLLISION", message = ex.Message });
        }
    }

    /// <summary>
    /// Cross-database delete guard for asset-model (G-02): how many registered
    /// loops still reference the asset-model node at <paramref name="path"/> —
    /// via the registry's denormalised site/area/unit or via mapped tag paths.
    /// Called service-to-service (X-Service-Key) before a hierarchy delete.
    /// </summary>
    [HttpGet("referencing")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> Referencing([FromQuery] string path, [FromQuery] int assetType, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest(new { error = "path is required" });
        var count = await _registry.CountReferencingLoopsAsync(path, assetType, ct);
        return Ok(new { count });
    }

    /// <summary>
    /// Onboard a batch of loops in one request. Returns a per-row outcome, so a
    /// bad row fails alone; the whole call is ONE gateway mutation, which is what
    /// keeps a large import from hitting the per-minute mutation window.
    /// </summary>
    [HttpPost("bulk-activate")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> BulkActivate([FromBody] CpmBulkActivateRequest request, CancellationToken ct)
    {
        var loops = request?.Loops;
        if (loops is null || loops.Count == 0)
            return UnprocessableEntity(new { error = "REGISTRY_VALIDATION", message = "loops[] is required" });
        if (loops.Count > MaxBulkLoops)
            return UnprocessableEntity(new
            {
                error = "BULK_TOO_LARGE",
                message = $"{loops.Count} loops exceeds the {MaxBulkLoops}-per-request limit; split the import.",
            });

        var result = await _registry.BulkActivateAsync(loops, ct);
        _logger.LogInformation("Bulk activate: {Activated} activated, {Failed} failed in {Ms} ms",
            result.Activated, result.Failed, result.ElapsedMs);
        _audit.Emit("CPM_LOOPS_BULK_ACTIVATED", Actor(), "CpmLoop", $"bulk:{result.Activated}",
            new { result.Requested, result.Activated, result.Failed, result.ElapsedMs });
        return Ok(result);
    }

    /// <summary>
    /// Retire a batch of loops in one request. Also releases the UNS assets each
    /// loop projected — the per-loop DELETE used to leave them orphaned.
    /// </summary>
    [HttpPost("bulk-delete")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> BulkDelete([FromBody] CpmBulkDeleteRequest request, CancellationToken ct)
    {
        var ids = request?.LoopIds;
        if (ids is null || ids.Count == 0)
            return UnprocessableEntity(new { error = "REGISTRY_VALIDATION", message = "loopIds[] is required" });
        if (ids.Count > MaxBulkLoops)
            return UnprocessableEntity(new
            {
                error = "BULK_TOO_LARGE",
                message = $"{ids.Count} loops exceeds the {MaxBulkLoops}-per-request limit; split the batch.",
            });

        var result = await _registry.BulkDeleteAsync(ids, ct);
        _logger.LogInformation("Bulk retire: {Deleted}/{Requested} in {Ms} ms",
            result.Deleted, result.Requested, result.ElapsedMs);
        _audit.Emit("CPM_LOOPS_BULK_RETIRED", Actor(), "CpmLoop", $"bulk:{result.Deleted}",
            new { result.Requested, result.Deleted, result.AssetsReleased, notFound = result.NotFound.Count });
        return Ok(result);
    }

    /// <summary>
    /// Re-publish peer/step-test evidence for a loop. Use after changing asset
    /// relationships; onboarding does this automatically.
    /// </summary>
    [HttpPost("{loopId}/republish-evidence")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> RepublishEvidence(string loopId, CancellationToken ct)
    {
        var loop = await _registry.GetAsync(loopId, ct);
        if (loop is null) return NotFound(new { error = $"Loop '{loopId}' is not registered" });
        // Re-project first: the caller's reason for republishing is usually that the
        // asset graph changed.
        var projected = await _registry.ProjectLinksAsync(loopId, ct);
        // Signal assets re-project here too — this is also the BACKFILL path for
        // loops onboarded before the projection existed.
        var signalAssets = await _registry.ProjectSignalAssetsAsync(loopId, ct);
        await _registry.PublishEvidenceAsync(loopId, ct);
        var refreshed = await _registry.GetAsync(loopId, ct);
        _audit.Emit("CPM_EVIDENCE_REPUBLISHED", Actor(), "CpmLoop", loopId,
            new { projected, signalAssets, links = refreshed!.Links.Count });
        return Ok(new { loopId, republished = true, projected, signalAssets, links = refreshed!.Links.Count });
    }

    /// <summary>
    /// Remove a loop from the registry. Analytics history is retained on purpose:
    /// gate results are evidence of what the loop actually did.
    /// </summary>
    [HttpDelete("{loopId}")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Delete(string loopId, CancellationToken ct)
    {
        var deleted = await _registry.DeleteAsync(loopId, ct);
        if (deleted)
            _audit.Emit("CPM_LOOP_DELETED", Actor(), "CpmLoop", loopId,
                new { note = "Analytics history retained" });
        return deleted
            ? Ok(new { loopId, deleted = true, note = "Analytics history retained" })
            : NotFound(new { error = $"Loop '{loopId}' is not registered" });
    }

    /// <summary>
    /// A8 — recompute this loop's gates from historical samples. Runs as a bounded
    /// BATCH job, so a verdict comes back in seconds instead of waiting for the
    /// streaming pipeline's event-time timers to cross a 12h/24h window.
    /// </summary>
    [HttpPost("{loopId}/recompute")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Recompute(
        string loopId, [FromServices] ICplmRecomputeService recompute, CancellationToken ct)
    {
        var loop = await _registry.GetAsync(loopId, ct);
        if (loop is null) return NotFound(new { error = $"Loop '{loopId}' is not registered" });

        try
        {
            // Feed the batch job the same evidence the streaming path gets from the
            // broadcast, so a recomputed verdict matches the streamed one.
            var handle = await recompute.StartAsync(
                loop.LoopId,
                hasStepTest: loop.StepTestApproved,
                hasPeerLinks: loop.Links.Count > 0,
                windowOffsetMs: await recompute.GetWindowOffsetMsAsync(loop.LoopId, ct),
                ct);
            _audit.Emit("CPM_RECOMPUTE_STARTED", Actor(), "CpmLoop", loop.LoopId,
                new { handle.ReplayId, handle.JobId, hasStepTest = loop.StepTestApproved, hasPeerLinks = loop.Links.Count > 0 });
            return Accepted(new
            {
                handle.LoopId,
                handle.ReplayId,
                handle.JobId,
                statusUrl = $"/api/v1/cpm/replays/{handle.ReplayId}?jobId={handle.JobId}",
                note = "Results land in analytics.cplm_gate_results with source='flink-historical-replay'."
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { error = "RECOMPUTE_SUBMIT_FAILED", message = ex.Message });
        }
    }

    /// <summary>A8 — poll a recompute job.</summary>
    [HttpGet("/api/v1/cpm/replays/{replayId}")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> GetReplayStatus(
        string replayId, [FromQuery] string jobId,
        [FromServices] ICplmRecomputeService recompute, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(jobId))
            return BadRequest(new { error = "jobId is required (returned by the recompute call)" });
        return Ok(await recompute.GetStatusAsync(replayId, jobId, ct));
    }

    /// <summary>The onboarding contract, so a UI need not hardcode role requirements.</summary>
    [HttpGet("/api/v1/cpm/registry-contract")]
    [Authorize(Policy = "analytics.view")]
    public IActionResult GetRegistryContract() => Ok(new
    {
        requiredSignalRoles = CpmLoopRegistryService.RequiredRoles,
        optionalSignalRoles = CpmLoopRegistryService.OptionalRoles,
        loopTypes = new[] { "FIC", "PIC", "PIC_GAS", "PIC_VAPOUR", "LIC", "TIC", "UNKNOWN" },
        relationshipTypes = new[] { "PEER", "UPSTREAM_OF", "DOWNSTREAM_OF", "CASCADE_PRIMARY", "CASCADE_SECONDARY" },
        notes = new
        {
            loopType = "Mandatory. ISA first-letter inference fails on UNS-style tag names, and the UNKNOWN profile disables geometry-based diagnosis (prior 0.0).",
            vp = "Optional. Without a VP role, G14 caps confidence at 0.89 and no diagnosis can reach CONFIRMED.",
            peerLinks = "Create asset relationships, then onboard (or republish evidence). Without peer links G13 stays NOT_EVALUATED and the disturbance soft-block cannot fire."
        }
    });
}
