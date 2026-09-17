using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services.Config;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 3B.3 (spec v6 §5.6; NR-051, NR-054): deployments of approved bundles - the required
/// membership, the ACK matrix as the workers answered, the state (SCHEDULED … ACTIVE_VERIFIED,
/// PARTIALLY_ACKNOWLEDGED, ACTIVATION_FAILED), and rollback as a new deployment of the previously
/// active bundle. Nothing here is "active" until every required worker acknowledged the hash and a
/// pinned result appeared.
/// </summary>
[ApiController]
[Route("api/v1/cpm/configuration/deployments")]
public sealed class CpmConfigDeploymentsController : ControllerBase
{
    public sealed record CreateRequest(Guid BundleId, DateTimeOffset? ScheduledFor);

    private readonly ConfigDeploymentService _deployments;

    public CpmConfigDeploymentsController(ConfigDeploymentService deployments) => _deployments = deployments;

    // identity comes from the principal the edge-trust handler built (TraverseAuth maps the gateway's X-Auth-* headers to claims); never from a raw header here
    private string Actor() => User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";

    [HttpPost]
    [Authorize(Policy = "cpm.config.activate")]
    public async Task<IActionResult> Create([FromBody] CreateRequest req, CancellationToken ct)
    {
        if (req is null || req.BundleId == Guid.Empty) return BadRequest(new { error = "bundleId is required" });
        try
        {
            var d = await _deployments.CreateAsync(req.BundleId, "ACTIVATE", req.ScheduledFor, null, Actor(), ct);
            return Created($"/api/v1/cpm/configuration/deployments/{d.DeploymentId}", Shape(d));
        }
        catch (ConfigStateException ex) { return Conflict(new { error = ex.Message }); }
        catch (ConfigConflictException ex) { return Conflict(new { error = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    [HttpGet]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> List([FromQuery] Guid? bundleId, [FromQuery] string? site, [FromQuery] int limit = 20, CancellationToken ct = default)
    {
        if (bundleId is null && string.IsNullOrWhiteSpace(site)) return BadRequest(new { error = "bundleId or site is required" });
        var list = await _deployments.ListAsync(bundleId, string.IsNullOrWhiteSpace(site) ? null : site, limit, ct);
        return Ok(new { count = list.Count, deployments = list.Select(Shape) });
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var d = await _deployments.AdvanceAsync(id, ct);            // a GET re-evaluates the matrix so a stalled deployment reports PARTIALLY_ACKNOWLEDGED, never "pending" for ever
        return d is null ? NotFound(new { error = $"deployment {id} not found" }) : Ok(Shape(d));
    }

    [HttpPost("{id:guid}/rollback")]
    [Authorize(Policy = "cpm.config.rollback")]
    public async Task<IActionResult> Rollback(Guid id, CancellationToken ct)
    {
        try
        {
            var d = await _deployments.RollbackAsync(id, Actor(), ct);
            return Created($"/api/v1/cpm/configuration/deployments/{d.DeploymentId}", Shape(d));
        }
        catch (ConfigStateException ex) { return Conflict(new { error = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    internal static object Shape(DeploymentView d)
    {
        var required = d.RequiredMembers.EnumerateArray().Select(m => m.GetProperty("job_name").GetString()!).ToList();
        var matrix = required.Select(job => new
        {
            jobName = job,
            prepare = d.Acks.Where(a => a.JobName == job && a.Phase == "PREPARE").Select(a => new { a.Status, a.BundleHash, a.JarSha256, a.Reason, a.ReceivedAt }).LastOrDefault(),
            apply = d.Acks.Where(a => a.JobName == job && a.Phase == "APPLY").Select(a => new { a.Status, a.BundleHash, a.JarSha256, a.Reason, a.ReceivedAt }).LastOrDefault(),
        });
        return new
        {
            d.DeploymentId, d.BundleId, d.ContentHash, d.Kind, d.RollbackOf, d.ScheduledFor, d.State, d.Error, d.Epoch, d.ProbeResults, d.CreatedBy, d.CreatedAt, d.UpdatedAt,
            requiredMembers = required, ackMatrix = matrix, acks = d.Acks,
            active = d.State == "ACTIVE_VERIFIED",
            semantics = "ACTIVE_VERIFIED only after every required worker ACKed PREPARE and APPLY with this hash on one jar and a pinned result appeared; a partial matrix is PARTIALLY_ACKNOWLEDGED, never active",
        };
    }
}
