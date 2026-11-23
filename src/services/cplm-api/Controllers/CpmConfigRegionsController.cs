using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services.Config;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CHG-108 (System Response plan Phase 4): per-loop settings apart from the plant-wide ones, through the same governed lifecycle
/// as one bundle. Operating regions for many loops at once (one LOOP draft per loop: G2r.pv_region_min / _max; both bounds null
/// clears it), the loops whose own settings sit on an older plant-wide base and their re-stack, loops returned to the plant-wide
/// settings (CHG-223), and the batch they form
/// (approved by an independent reviewer, one deployment per bundle). A region also drives gate G2r: a window mostly outside it
/// loses its fused verdict, so it changes the Overview and KPIs too.
/// </summary>
[ApiController]
[Route("api/v1/cpm/configuration")]
public sealed class CpmConfigRegionsController : ControllerBase
{
    public sealed record BulkRequest(IReadOnlyList<RegionBulkService.RegionRow>? Regions, string? Note);
    public sealed record RestackRequest(string? Site, IReadOnlyList<string>? LoopIds, string? Note);
    public sealed record InheritRequest(string? Site, IReadOnlyList<string>? LoopIds, string? Note);
    public sealed record ApproveRequest(string? Note, int? ValidityHours);

    private readonly RegionBulkService _regions;
    private readonly LoopSettingsService _loopSettings;
    private readonly ConfigBatchService _batches;

    public CpmConfigRegionsController(RegionBulkService regions, LoopSettingsService loopSettings, ConfigBatchService batches)
    {
        _regions = regions; _loopSettings = loopSettings; _batches = batches;
    }

    // identity comes from the principal the edge-trust handler built (TraverseAuth maps the gateway's X-Auth-* headers to claims)
    private string Actor() => User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";
    private IReadOnlyList<string> Roles() => User.Claims.Where(c => c.Type == "role" || c.Type == System.Security.Claims.ClaimTypes.Role)
        .SelectMany(c => c.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)).Distinct(StringComparer.Ordinal).ToList();

    /// <summary>Every active loop's region now, beside its PV range (the table to edit).</summary>
    [HttpGet("regions")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Regions([FromQuery] string? site, CancellationToken ct)
    {
        var rows = await _regions.CurrentAsync(string.IsNullOrWhiteSpace(site) ? null : site.Trim(), ct);
        return Ok(new { count = rows.Count, loops = rows });
    }

    /// <summary>One validated LOOP draft per row; the response names each row's draft or its error. Nothing is approved or deployed.</summary>
    [HttpPost("regions")]
    [Authorize(Policy = "cpm.config.draft")]
    public async Task<IActionResult> CreateRegions([FromBody] BulkRequest req, CancellationToken ct)
    {
        if (req?.Regions is not { Count: > 0 } rows) return BadRequest(new { error = "regions[] is required" });
        if (rows.Count > RegionBulkService.MaxRows) return BadRequest(new { error = $"{rows.Count} rows exceeds the {RegionBulkService.MaxRows}-row limit; split the table" });
        var (batchId, results) = await _regions.CreateAsync(rows, req.Note, Actor(), ct);
        return Ok(new { batchId, count = results.Count, drafts = results.Count(r => r.BundleId is not null), failed = results.Count(r => r.Error is not null), rows = results });
    }

    /// <summary>The loops whose own settings sit on another plant-wide base than the one in force now.</summary>
    [HttpGet("loop-settings/stale")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Stale([FromQuery] string site, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(site)) return BadRequest(new { error = "site is required" });
        var loops = await _loopSettings.StaleAsync(site.Trim(), ct);
        return Ok(new { site, count = loops.Count, loops });
    }

    /// <summary>Re-stack the stale loops (all, or loopIds) on the current plant-wide layers, keeping each loop's own settings: one batch of drafts.</summary>
    [HttpPost("loop-settings/restack")]
    [Authorize(Policy = "cpm.config.draft")]
    public async Task<IActionResult> Restack([FromBody] RestackRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req?.Site)) return BadRequest(new { error = "site is required" });
        var (batchId, results) = await _loopSettings.RestackAsync(req.Site.Trim(), req.LoopIds, req.Note, Actor(), ct);
        return Ok(new { batchId, count = results.Count, drafts = results.Count(r => r.BundleId is not null), failed = results.Count(r => r.Error is not null), rows = results });
    }

    /// <summary>
    /// CHG-223 "Use plant-wide settings": per loop with its own active LOOP bundle, a validated draft that drops the loop's own
    /// settings (one batch; approve + deploy through batches/{id}). Once it verifies the loop has no active LOOP row and runs under
    /// its PROFILE (else SITE) bundle, following later plant-wide changes.
    /// </summary>
    [HttpPost("loop-settings/inherit")]
    [Authorize(Policy = "cpm.config.draft")]
    public async Task<IActionResult> Inherit([FromBody] InheritRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req?.Site)) return BadRequest(new { error = "site is required" });
        if (req.LoopIds is not { Count: > 0 } loopIds) return BadRequest(new { error = "loopIds[] is required" });
        if (loopIds.Count > LoopSettingsService.MaxInheritLoops)
            return BadRequest(new { error = $"{loopIds.Count} loops exceeds the {LoopSettingsService.MaxInheritLoops}-loop limit; split the list" });
        var (batchId, results) = await _loopSettings.InheritAsync(req.Site.Trim(), loopIds, req.Note, Actor(), ct);
        return Ok(new { batchId, count = results.Count, drafts = results.Count(r => r.BundleId is not null), failed = results.Count(r => r.Error is not null), rows = results });
    }

    [HttpGet("batches/{batchId:guid}")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Batch(Guid batchId, [FromQuery] string site, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(site)) return BadRequest(new { error = "site is required" });
        var rows = await _batches.GetAsync(site.Trim(), batchId, ct);
        // createdBy: the batch author - the screen offers "Approve" (someone else's batch), "Approve alone (Admin)" (the
        // author with Admin / SuperAdmin) or a disabled Approve "Needs a second person" (the author without them)
        return rows.Count == 0 ? NotFound(new { error = $"no drafts of batch {batchId} in site '{site}'" })
            : Ok(new { batchId, site, createdBy = rows[0].CreatedBy, count = rows.Count, rows });
    }

    /// <summary>An independent reviewer approves every validated draft of the batch.</summary>
    [HttpPost("batches/{batchId:guid}/approve")]
    [Authorize(Policy = "cpm.config.approve")]
    public async Task<IActionResult> Approve(Guid batchId, [FromQuery] string site, [FromBody] ApproveRequest? req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(site)) return BadRequest(new { error = "site is required" });
        var rows = await _batches.ApproveAsync(site.Trim(), batchId, Actor(), Roles(), req?.Note, TimeSpan.FromHours(Math.Clamp(req?.ValidityHours ?? 72, 1, 24 * 30)), ct);
        return rows.Count == 0 ? NotFound(new { error = $"no drafts of batch {batchId} in site '{site}'" })
            : Ok(new { batchId, site, approved = rows.Count(r => r.State == "APPROVED" && r.Error is null), failed = rows.Count(r => r.Error is not null), rows });
    }

    /// <summary>One deployment per approved draft of the batch; each becomes active when the workers acknowledge it.</summary>
    [HttpPost("batches/{batchId:guid}/deploy")]
    [Authorize(Policy = "cpm.config.activate")]
    public async Task<IActionResult> Deploy(Guid batchId, [FromQuery] string site, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(site)) return BadRequest(new { error = "site is required" });
        var rows = await _batches.DeployAsync(site.Trim(), batchId, Actor(), ct);
        return rows.Count == 0 ? NotFound(new { error = $"no drafts of batch {batchId} in site '{site}'" })
            : Ok(new { batchId, site, scheduled = rows.Count(r => r.DeploymentId is not null), failed = rows.Count(r => r.Error is not null), rows });
    }
}
