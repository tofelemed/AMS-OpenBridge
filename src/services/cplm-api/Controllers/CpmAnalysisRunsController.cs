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
    /// <param name="Source">kafka (default: the retained samples topic) | iotdb (the historian between FromMs and ToMs).</param>
    /// <param name="MethodRunId">EVIDENCE_RECONSTRUCTION only (2C.2): the run whose evidence is rebuilt over exactly its support.</param>
    public sealed record CreateRequest(string? LoopId, string? Purpose, bool? HasStepTest, bool? HasPeerLinks,
        string? Source = null, long? FromMs = null, long? ToMs = null, Guid? MethodRunId = null);

    private readonly ICplmRecomputeService _recompute;
    private readonly ICpmLoopRegistryService _registry;
    private readonly MethodRunResolver _resolver;
    private readonly ILogger<CpmAnalysisRunsController> _logger;

    public CpmAnalysisRunsController(ICplmRecomputeService recompute, ICpmLoopRegistryService registry,
        MethodRunResolver resolver, ILogger<CpmAnalysisRunsController> logger)
    {
        _recompute = recompute;
        _registry = registry;
        _resolver = resolver;
        _logger = logger;
    }

    [HttpPost]
    [Authorize(Policy = "cpm.analysis.create")]
    public async Task<IActionResult> Create([FromBody] CreateRequest req, CancellationToken ct)
    {
        var purpose = (req.Purpose ?? "REPLAY").Trim().ToUpperInvariant();
        if (purpose is not ("REPLAY" or "SHADOW" or "EVIDENCE_RECONSTRUCTION"))
            return BadRequest(new { error = $"Unknown purpose '{req.Purpose}'", allowed = new[] { "REPLAY", "SHADOW", "EVIDENCE_RECONSTRUCTION" } });
        if (purpose == "EVIDENCE_RECONSTRUCTION") return await Reconstruct(req, ct);
        if (string.IsNullOrWhiteSpace(req.LoopId)) return BadRequest(new { error = "loopId is required" });
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

    /// <summary>
    /// v2.5 (2C.2, NR-057): rebuild one method run's artifacts. The run is resolved from any tier's row,
    /// the replay covers exactly its support and emits artifacts under its identity; the original verdict
    /// is never touched. G12 (event-keyed) is refused with a reason rather than faked.
    /// </summary>
    private async Task<IActionResult> Reconstruct(CreateRequest req, CancellationToken ct)
    {
        if (req.MethodRunId is null) return BadRequest(new { error = "methodRunId is required for EVIDENCE_RECONSTRUCTION" });
        var loc = await _resolver.ResolveAsync(req.MethodRunId.Value, ct);
        if (loc is null) return NotFound(new { error = $"No result carries method run {req.MethodRunId}" });
        if (!SiteScope.Allows(Request, loc.Site)) return StatusCode(StatusCodes.Status403Forbidden, SiteScope.Forbidden(loc.Site));
        var tier = MethodRunResolver.ReconstructionTier(loc.Gate);
        if (tier is null)
            return UnprocessableEntity(new { error = loc.Gate == "G12" ? "NOT_RECONSTRUCTABLE_EVENT_KEYED" : "UNKNOWN_GATE", gate = loc.Gate,
                message = loc.Gate == "G12" ? "G12 evidence is event-keyed and owned by the response job" : "no tier rebuilds this gate" });
        var source = (req.Source ?? "kafka").Trim().ToLowerInvariant();
        if (source is not ("kafka" or "iotdb"))
            return BadRequest(new { error = $"Unknown source '{req.Source}'", allowed = new[] { "kafka", "iotdb" } });
        var support = new ReplaySupport(source, loc.FromMs, loc.ToMs, loc.Site, null);
        var idempotencyKey = Request.Headers.TryGetValue("Idempotency-Key", out var k) ? k.ToString() : null;
        var actor = User.Identity?.Name ?? Request.Headers["X-Auth-User"].ToString();
        try
        {
            var handle = await _recompute.StartReconstructionAsync(loc.LoopId, new ReconstructionTarget(req.MethodRunId.Value, loc.Gate, loc.WindowKind),
                support, string.IsNullOrWhiteSpace(actor) ? null : actor, string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey, ct);
            return Accepted($"/api/v1/cpm/analysis-runs/{handle.AnalysisRunId}", new
            {
                analysisRunId = handle.AnalysisRunId,
                handle.LoopId,
                handle.Purpose,
                handle.JobId,
                reconstructs = req.MethodRunId,
                gate = loc.Gate,
                tier,
                windowKind = loc.WindowKind,
                source,
                fromMs = loc.FromMs,
                toMs = loc.ToMs,
                evidenceUrl = $"/api/v1/cpm/method-runs/{req.MethodRunId}/evidence",
                statusUrl = $"/api/v1/cpm/analysis-runs/{handle.AnalysisRunId}",
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Evidence reconstruction submission failed for {Run}", req.MethodRunId);
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
