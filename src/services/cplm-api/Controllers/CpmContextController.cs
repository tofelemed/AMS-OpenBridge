using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 1H.3 (spec v6 §4.2): the analysis context a loop is evaluated under — this
/// release the effective-dated PRIMARY Instrumental device bindings per signal role. Phase 2
/// adds controller snapshots and the as-of analysis-context read.
/// </summary>
[ApiController]
[Route("api/v1/cpm/loops/{loopId}/instrument-bindings")]
public sealed class CpmContextController : ControllerBase
{
    private readonly IInstrumentBindingService _bindings;
    private readonly ICplmAuditEmitter _audit;

    public CpmContextController(IInstrumentBindingService bindings, ICplmAuditEmitter audit)
    {
        _bindings = bindings;
        _audit = audit;
    }

    private string Actor() => User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>The binding history; with <c>at</c>, the binding in force per role at that instant (NR-041).</summary>
    [HttpGet]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> List(string loopId, [FromQuery] DateTime? at, CancellationToken ct)
    {
        var history = await _bindings.ListAsync(loopId, ct);
        if (at is null) return Ok(new { loopId, count = history.Count, bindings = history });
        var instant = at.Value.ToUniversalTime();
        var effective = new[] { "PV", "SP", "OP", "VP", "MODE" }
            .Select(role => new { role, binding = BindingResolution.AsOf(history, role, instant) })
            .Where(x => x.binding is not null)
            .ToList();
        return Ok(new { loopId, at = instant, count = effective.Count, effective });
    }

    /// <summary>
    /// Bind a primary device to a signal from <c>validFrom</c> (default now). The previous open
    /// binding for that role is closed at that instant (temporal split); an overlap is 409; missing
    /// identity is 422. Identity is never guessed from a tag.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "cpm.context.manage")]
    public async Task<IActionResult> Create(string loopId, [FromBody] CreateBindingRequest req, CancellationToken ct)
    {
        try
        {
            var created = await _bindings.CreateAsync(loopId, req, Actor(), ct);
            _audit.Emit("CPM_INSTRUMENT_BINDING_CREATED", Actor(), "CpmLoop", loopId,
                new { created.BindingId, created.SignalRole, created.DeviceId, created.InstallationId, created.SourceId, created.ValidFrom });
            return Created($"/api/v1/cpm/loops/{loopId}/instrument-bindings", created);
        }
        catch (BindingValidationException ex)
        {
            return ex.Field == "loopId"
                ? NotFound(new { error = ex.Message })
                : UnprocessableEntity(new { error = ex.Message, field = ex.Field });
        }
        catch (BindingConflictException ex)
        {
            return Conflict(new { error = "BINDING_OVERLAP", message = ex.Message });
        }
    }
}
