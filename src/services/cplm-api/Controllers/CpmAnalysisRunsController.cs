using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 1G.4 (spec v6 R19; NR-056, NR-057): bounded analysis runs. A run names its
/// purpose (REPLAY | SHADOW | EVIDENCE_RECONSTRUCTION); every row it writes carries its
/// analysis_run_id and is isolated from the LIVE timeline by the purpose column. An
/// Idempotency-Key header makes a repeated POST return the same run.
/// </summary>
[ApiController]
[Route("api/v1/cpm/analysis-runs")]
public sealed class CpmAnalysisRunsController : ControllerBase
{
    /// <param name="Source">kafka (default: the retained samples topic) | iotdb (the historian between FromMs and ToMs).</param>
    public sealed record CreateRequest(string LoopId, string? Purpose, bool? HasStepTest, bool? HasPeerLinks,
        string? Source = null, long? FromMs = null, long? ToMs = null);

    private readonly ICplmRecomputeService _recompute;
    private readonly ICpmLoopRegistryService _registry;
    private readonly ILogger<CpmAnalysisRunsController> _logger;

    public CpmAnalysisRunsController(ICplmRecomputeService recompute, ICpmLoopRegistryService registry,
        ILogger<CpmAnalysisRunsController> logger)
    {
        _recompute = recompute;
        _registry = registry;
        _logger = logger;
    }

    [HttpPost]
    [Authorize(Policy = "cpm.analysis.create")]
    public async Task<IActionResult> Create([FromBody] CreateRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.LoopId)) return BadRequest(new { error = "loopId is required" });
        var purpose = (req.Purpose ?? "REPLAY").Trim().ToUpperInvariant();
        if (purpose is not ("REPLAY" or "SHADOW" or "EVIDENCE_RECONSTRUCTION"))
            return BadRequest(new { error = $"Unknown purpose '{req.Purpose}'", allowed = new[] { "REPLAY", "SHADOW", "EVIDENCE_RECONSTRUCTION" } });
        var loop = await _registry.GetAsync(req.LoopId, ct);
        if (loop is null) return NotFound(new { error = $"Loop '{req.LoopId}' is not registered" });

        var idempotencyKey = Request.Headers.TryGetValue("Idempotency-Key", out var k) ? k.ToString() : null;
        var actor = User.Identity?.Name ?? Request.Headers["X-Auth-User"].ToString();
        var source = (req.Source ?? "kafka").Trim().ToLowerInvariant();
        if (source is not ("kafka" or "iotdb"))
            return BadRequest(new { error = $"Unknown source '{req.Source}'", allowed = new[] { "kafka", "iotdb" } });
        if (source == "iotdb" && (req.FromMs is null || req.ToMs is null || req.ToMs <= req.FromMs))
            return BadRequest(new { error = "source=iotdb needs fromMs < toMs (epoch milliseconds)" });
        var support = source == "iotdb"
            ? new ReplaySupport("iotdb", req.FromMs!.Value, req.ToMs!.Value, loop.Site, loop.LoopType)
            : ReplaySupport.Kafka();
        try
        {
            var handle = await _recompute.StartAsync(
                loop.LoopId,
                hasStepTest: req.HasStepTest ?? loop.StepTestApproved,
                hasPeerLinks: req.HasPeerLinks ?? loop.Links.Count > 0,
                windowOffsetMs: source == "iotdb" ? 0L : await _recompute.GetWindowOffsetMsAsync(loop.LoopId, ct),
                purpose, string.IsNullOrWhiteSpace(actor) ? null : actor, string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey,
                support, ct);
            return Accepted($"/api/v1/cpm/analysis-runs/{handle.AnalysisRunId}", new
            {
                analysisRunId = handle.AnalysisRunId,
                handle.LoopId,
                handle.Purpose,
                handle.JobId,
                source,
                fromMs = support.FromMs == 0 ? (long?)null : support.FromMs,
                toMs = support.ToMs == 0 ? (long?)null : support.ToMs,
                statusUrl = $"/api/v1/cpm/analysis-runs/{handle.AnalysisRunId}",
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Analysis run submission failed for {LoopId}", req.LoopId);
            return StatusCode(StatusCodes.Status502BadGateway, new { error = "ANALYSIS_RUN_SUBMIT_FAILED", message = ex.Message });
        }
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var run = await _recompute.GetAnalysisRunAsync(id, ct);
        return run is null ? NotFound(new { error = $"No analysis run {id}" }) : Ok(run);
    }
}
