using Asp.Versioning;
using AMS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AMS.Api.Controllers.V1;

/// <summary>
/// CPLM Phase 4 — loop registry and onboarding.
///
/// Unlike the CPA reference (where every equivalent endpoint was
/// [AllowAnonymous] behind a test-auth bypass), these require real permissions:
/// onboarding decides what the diagnosis engine evaluates and what operators
/// are told about their plant.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/cpm/loops")]
[Authorize]
public sealed class CpmLoopsController : ControllerBase
{
    private readonly ICpmLoopRegistryService _registry;
    private readonly ILogger<CpmLoopsController> _logger;

    public CpmLoopsController(ICpmLoopRegistryService registry, ILogger<CpmLoopsController> logger)
    {
        _registry = registry;
        _logger = logger;
    }

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
            return Ok(loop);
        }
        catch (ArgumentException ex)
        {
            // 422: the request is well-formed JSON but not a viable loop definition.
            return UnprocessableEntity(new { error = "REGISTRY_VALIDATION", message = ex.Message });
        }
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
        await _registry.PublishEvidenceAsync(loopId, ct);
        var refreshed = await _registry.GetAsync(loopId, ct);
        return Ok(new { loopId, republished = true, projected, links = refreshed!.Links.Count });
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
        return deleted
            ? Ok(new { loopId, deleted = true, note = "Analytics history retained" })
            : NotFound(new { error = $"Loop '{loopId}' is not registered" });
    }

    /// <summary>The onboarding contract, so a UI need not hardcode role requirements.</summary>
    [HttpGet("/api/v{version:apiVersion}/cpm/registry-contract")]
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
