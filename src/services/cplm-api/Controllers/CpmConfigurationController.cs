using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services;
using Traverse.CplmApi.Services.Config;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 3B.3 (spec v6 §5.3-5.6, §6.5): the governed configuration lifecycle. Drafts are
/// requested changes on the scope's own layer; validation names every field; a shadow run is an
/// analysis run with no operational output; approval is by an independent reviewer and binds to
/// the content hash. The effective configuration of a loop is what the ACTIVE bundle resolves,
/// with the ACTUAL worker versions from the ACK matrix - never today's editor values.
/// </summary>
[ApiController]
[Route("api/v1/cpm/configuration")]
public sealed class CpmConfigurationController : ControllerBase
{
    public sealed record DraftRequest(string Site, string ScopeKind, string? ScopeRef, Guid? ParentBundleId, string? Note);
    public sealed record PatchRequest(IReadOnlyList<ConfigStore.PatchOp> Ops);
    public sealed record ApproveRequest(string? Note, int? ValidityHours);
    public sealed record ShadowRequest(string? LoopId, int? Hours);

    private readonly ConfigStore _store;
    private readonly ConfigDeploymentService _deployments;
    private readonly ICpmLoopRegistryService _registry;
    private readonly ICplmRecomputeService _recompute;
    private readonly ICplmAuditEmitter _audit;
    private readonly ShadowComparison _shadow;

    public CpmConfigurationController(ConfigStore store, ConfigDeploymentService deployments, ICpmLoopRegistryService registry, ICplmRecomputeService recompute, ICplmAuditEmitter audit, ShadowComparison shadow)
    {
        _store = store; _deployments = deployments; _registry = registry; _recompute = recompute; _audit = audit;
        _shadow = shadow;
    }

    // identity comes from the principal the edge-trust handler built (TraverseAuth maps the gateway's X-Auth-* headers to claims); never from a raw header here
    private string Actor() => User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";
    private IReadOnlyList<string> Roles() => User.Claims.Where(c => c.Type == "role" || c.Type == System.Security.Claims.ClaimTypes.Role)
        .SelectMany(c => c.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)).Distinct(StringComparer.Ordinal).ToList();

    /// <summary>The catalogue this build carries (typed, with defaults, validation, change class, consumers, dependencies) and what the running jobs read.</summary>
    [HttpGet("catalogue")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Catalogue(CancellationToken ct)
    {
        var members = await _deployments.MembershipAsync(ct);
        var c = PropertyCatalogue.Current;
        return Ok(new
        {
            catalogueHash = c.CatalogueHash, count = c.Count, executionPlanHash = ExecutionPlans.InstalledHash(),
            properties = c.Properties.Select(p => new { p.Id, p.Gate, p.Property, p.Type, p.Unit, @default = p.Default, commissioningRequired = p.CommissioningRequired, validation = p.Validation, p.ChangeClass, p.Consumers, p.Dependencies, p.Effect,
                notReadByBuild = UnsupportedInBuild.Reasons.TryGetValue(p.Property, out var reason) ? reason : null }),
            workers = members.Select(m => new { jobName = m.JobName, jarSha256 = m.JarSha256, catalogueHash = m.CatalogueHash, catalogueMatches = m.CatalogueHash == c.CatalogueHash, readsProperties = m.ReadsProperties }),
            factoryLayerAvailable = FactoryLayers.Available, profileIds = FactoryLayers.ProfileIds(), executionPlan = ExecutionPlans.Installed(),
        });
    }

    /// <summary>The effective configuration for a loop: the ACTIVE bundle of the most specific scope, its sources, and the actual worker versions.</summary>
    [HttpGet("effective")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Effective([FromQuery] string loopId, [FromQuery] DateTimeOffset? at, [FromQuery] string? regime, CancellationToken ct)
    {
        var loop = await _registry.GetAsync(loopId, ct);
        if (loop is null) return NotFound(new { error = $"Loop '{loopId}' is not registered" });
        var profileId = ConfigStore.ProfileIdFor(loop.LoopType);
        var active = await _store.ActiveForLoopAsync(loop.Site, loop.LoopId, profileId, ct);
        var members = await _deployments.MembershipAsync(ct);
        if (active is null)
        {
            var factory = FactoryLayers.Factory();
            var profile = FactoryLayers.Profile(profileId);
            var layers = new List<ConfigLayer> { new("FACTORY", null, factory) };
            if (profile is { } p) layers.Add(new ConfigLayer("PROFILE", profileId, p));
            var r = EffectiveConfigResolver.Resolve(layers);
            return Ok(new { loopId = loop.LoopId, site = loop.Site, profileId, bundle = (object?)null, state = "NO_ACTIVE_BUNDLE", note = "no governed bundle is active for this loop: the engine runs the factory layer (class packs) exactly as before v2.5",
                properties = r.Properties, sources = r.Sources, effectiveHash = r.Hash, workers = members.Select(m => new { m.JobName, m.JarSha256, m.CatalogueHash, required = m.ReadsProperties }) });
        }
        var activeRow = (await _store.ActiveAsync(loop.Site, ct)).FirstOrDefault(a => a.BundleId == active.BundleId);
        var acks = activeRow?.DeploymentId is { } did ? await _deployments.GetAsync(did, ct) : null;
        return Ok(new
        {
            loopId = loop.LoopId, site = loop.Site, profileId, at, regime, state = active.State,
            bundle = new { active.BundleId, active.Version, active.ContentHash, active.ScopeKind, active.ScopeRef, active.ChangeClass, active.EffectiveFrom, active.CatalogueHash },
            properties = active.Resolved.GetProperty("properties"), sources = active.Resolved.GetProperty("sources"), layers = active.Layers,
            workers = members.Select(m => new { m.JobName, m.JarSha256, m.CatalogueHash, required = m.ReadsProperties, ack = acks?.Acks.Where(a => a.JobName == m.JobName && a.Phase == "APPLY").Select(a => new { a.Status, a.BundleHash, a.JarSha256, a.ReceivedAt }).LastOrDefault() }),
        });
    }

    /// <summary>
    /// 2026-09-18 (Gate Configuration overview): what every loop in scope runs under, in one read - the
    /// registry loops of the scope, the active rows per site, the per-loop rule of /effective applied in
    /// memory, and the light rows of the bundles named. No /effective call per loop.
    /// </summary>
    [HttpGet("effective/summary")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> EffectiveSummary([FromQuery] string? site, [FromQuery] string? area, [FromQuery] string? unit, CancellationToken ct)
    {
        var loops = (await _registry.GetAllAsync(ct))
            .Where(l => l.IsActive)
            .Where(l => site is null || string.Equals(l.Site, site, StringComparison.OrdinalIgnoreCase))
            .Where(l => area is null || string.Equals(l.Area, area, StringComparison.OrdinalIgnoreCase))
            .Where(l => unit is null || string.Equals(l.Unit, unit, StringComparison.OrdinalIgnoreCase))
            .OrderBy(l => l.LoopId, StringComparer.Ordinal).ToList();
        var activeBySite = new Dictionary<string, IReadOnlyList<ConfigStore.ActiveRow>>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in loops.Select(l => l.Site).Distinct(StringComparer.OrdinalIgnoreCase)) activeBySite[s] = await _store.ActiveAsync(s, ct);
        var rows = Services.Config.EffectiveSummary.Resolve(loops, activeBySite);
        var bundles = (await _store.SummariesAsync(rows.Where(r => r.BundleId is not null).Select(r => r.BundleId!.Value).Distinct().ToList(), ct)).ToDictionary(b => b.BundleId);
        return Ok(new
        {
            count = rows.Count,
            loops = rows.Select(r =>
            {
                var b = r.BundleId is { } id && bundles.TryGetValue(id, out var found) ? found : null;
                return new
                {
                    r.LoopId, r.DisplayName, r.Site, r.Area, r.Unit, r.LoopType, r.ProfileId,
                    state = b?.State ?? Services.Config.EffectiveSummary.NoActiveBundle,
                    bundle = b is null ? null : new { b.BundleId, b.Version, b.ContentHash, b.ScopeKind, b.ScopeRef, b.ChangeClass, b.EffectiveFrom, since = r.Since },
                };
            }),
        });
    }

    /// <param name="projection">`summary` (2026-09-18): the identity, state and class of each bundle without layers / resolved / shadow - a list row is a few hundred bytes instead of tens of KB.</param>
    [HttpGet("drafts")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> List([FromQuery] string site, [FromQuery] string? scopeKind, [FromQuery] string? scopeRef, [FromQuery] string? state, [FromQuery] string? projection, CancellationToken ct)
    {
        var rows = await _store.ListAsync(site, scopeKind?.ToUpperInvariant(), scopeRef, state?.ToUpperInvariant(), ct);
        return string.Equals(projection, "summary", StringComparison.OrdinalIgnoreCase)
            ? Ok(new { site, projection = "summary", bundles = rows.Select(ShapeSummary) })
            : Ok(new { site, bundles = rows.Select(Shape) });
    }

    [HttpGet("drafts/{id:guid}")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var b = await _store.GetAsync(id, ct);
        if (b is null) return NotFound(new { error = $"bundle {id} not found" });
        Response.Headers.ETag = $"\"{b.Etag}\"";
        return Ok(ShapeWithApprovals(b, await _store.ApprovalsAsync(id, b.ContentHash, ct)));
    }

    /// <summary>The shadow run's before / after gate matrix (SHADOW rows vs the LIVE rows of the same windows), materialised server-side; marks POLICY_RECLASSIFICATION when symptoms disappear.</summary>
    [HttpGet("drafts/{id:guid}/shadow")]
    [Authorize(Policy = "cpm.config.read")]
    public async Task<IActionResult> ShadowReport(Guid id, CancellationToken ct)
    {
        var report = await _shadow.CompareAsync(id, ct);
        return report is null ? NotFound(new { error = $"bundle {id} not found" }) : Ok(report);
    }

    [HttpPost("drafts")]
    [Authorize(Policy = "cpm.config.draft")]
    public async Task<IActionResult> CreateDraft([FromBody] DraftRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Site) || string.IsNullOrWhiteSpace(req.ScopeKind)) return BadRequest(new { error = "site and scopeKind are required" });
        string? profileId = null;
        if (req.ScopeKind.ToUpperInvariant() is "LOOP" or "REGIME")
        {
            var loop = await _registry.GetAsync((req.ScopeRef ?? "").Split('@')[0], ct);
            if (loop is null) return NotFound(new { error = $"Loop '{req.ScopeRef}' is not registered" });
            profileId = ConfigStore.ProfileIdFor(loop.LoopType);
        }
        try
        {
            var b = await _store.CreateDraftAsync(req.Site.Trim(), req.ScopeKind, req.ScopeRef, req.ParentBundleId, profileId, Actor(), req.Note, ct);
            _audit.Emit("CONFIG_DRAFT_CREATED", Actor(), "gate_config_bundle", b.BundleId.ToString(), new { b.Site, b.ScopeKind, b.ScopeRef, b.Version, b.ContentHash });
            Response.Headers.ETag = $"\"{b.Etag}\"";
            return Created($"/api/v1/cpm/configuration/drafts/{b.BundleId}", Shape(b));
        }
        catch (ArgumentException ex) { return UnprocessableEntity(new { error = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    /// <summary>Requested changes only: {ops: [{op: set|reset, property, value}]}; If-Match with the draft's ETag (409 when stale).</summary>
    [HttpPatch("drafts/{id:guid}")]
    [Authorize(Policy = "cpm.config.draft")]
    public async Task<IActionResult> Patch(Guid id, [FromBody] PatchRequest req, CancellationToken ct)
    {
        if (req?.Ops is null || req.Ops.Count == 0) return BadRequest(new { error = "ops[] is required" });
        if (!Request.Headers.TryGetValue("If-Match", out var ifMatch)) return StatusCode(428, new { error = "If-Match with the draft's ETag is required" });
        try
        {
            var b = await _store.PatchAsync(id, ifMatch.ToString(), req.Ops, Actor(), ct);
            _audit.Emit("CONFIG_DRAFT_EDITED", Actor(), "gate_config_bundle", id.ToString(), new { ops = req.Ops.Select(o => new { o.Op, o.Property }), b.ContentHash, b.ChangeClass });
            Response.Headers.ETag = $"\"{b.Etag}\"";
            return Ok(Shape(b));
        }
        catch (ConfigConflictException ex) { return Conflict(new { error = ex.Message }); }
        catch (ConfigStateException ex) { return Conflict(new { error = ex.Message }); }
        catch (ArgumentException ex) { return UnprocessableEntity(new { error = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    [HttpPost("drafts/{id:guid}/validate")]
    [Authorize(Policy = "cpm.config.validate")]
    public async Task<IActionResult> Validate(Guid id, CancellationToken ct)
    {
        try
        {
            var b = await _store.ValidateAsync(id, ct);
            _audit.Emit("CONFIG_DRAFT_VALIDATED", Actor(), "gate_config_bundle", id.ToString(), new { b.State, b.ContentHash, b.ChangeClass });
            return b.State == "VALIDATED" ? Ok(Shape(b)) : UnprocessableEntity(Shape(b));
        }
        catch (ConfigStateException ex) { return Conflict(new { error = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    /// <summary>A SHADOW analysis run over a loop's recent support under the draft's resolved properties; no operational output. The bundle records the run id; its diff is read on GET.</summary>
    [HttpPost("drafts/{id:guid}/shadow")]
    [Authorize(Policy = "cpm.config.shadow")]
    public async Task<IActionResult> Shadow(Guid id, [FromBody] ShadowRequest? req, CancellationToken ct)
    {
        var b = await _store.GetAsync(id, ct);
        if (b is null) return NotFound(new { error = $"bundle {id} not found" });
        if (b.State is not ("VALIDATED" or "SHADOW_EVALUATED")) return Conflict(new { error = $"validate the draft first (state {b.State})" });
        var loopId = req?.LoopId ?? (b.ScopeKind is "LOOP" or "REGIME" ? b.ScopeRef?.Split('@')[0] : null);
        if (string.IsNullOrWhiteSpace(loopId)) return BadRequest(new { error = "loopId is required for a SITE / PROFILE scope shadow run" });
        var loop = await _registry.GetAsync(loopId, ct);
        if (loop is null) return NotFound(new { error = $"Loop '{loopId}' is not registered" });
        var hours = Math.Clamp(req?.Hours ?? 24, 1, 168);
        var to = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var from = to - hours * 3600_000L;
        try
        {
            var offset = await _recompute.GetWindowOffsetMsAsync(loop.LoopId, ct);
            var handle = await _recompute.StartShadowAsync(loop.LoopId, b.ContentHash, b.Resolved.GetProperty("properties").GetRawText(), offset, Actor(),
                new ReplaySupport("iotdb", from, to, loop.Site, loop.LoopType), ct);
            var shadow = JsonSerializer.Serialize(new { analysisRunId = handle.AnalysisRunId, loopId = loop.LoopId, fromMs = from, toMs = to, state = "RUNNING", startedAt = DateTimeOffset.UtcNow, contentHash = b.ContentHash });
            await _store.SetStateAsync(id, "SHADOW_EVALUATED", ct, null, shadow);
            _audit.Emit("CONFIG_SHADOW_STARTED", Actor(), "gate_config_bundle", id.ToString(), new { handle.AnalysisRunId, loopId = loop.LoopId, hours });
            return Accepted(new { bundleId = id, handle.AnalysisRunId, handle.JobId, loopId = loop.LoopId, fromMs = from, toMs = to, statusUrl = $"/api/v1/cpm/analysis-runs/{handle.AnalysisRunId}" });
        }
        catch (InvalidOperationException ex) { return StatusCode(502, new { error = ex.Message }); }
    }

    /// <summary>An independent reviewer approves the draft's current content; site-wide, objective and test-permission changes need the ControlAuthority role.</summary>
    [HttpPost("drafts/{id:guid}/approve")]
    [Authorize(Policy = "cpm.config.approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveRequest? req, CancellationToken ct)
    {
        var b = await _store.GetAsync(id, ct);
        if (b is null) return NotFound(new { error = $"bundle {id} not found" });
        var props = b.Resolved.GetProperty("properties");
        var sensitive = b.ScopeKind == "SITE" || props.EnumerateObject().Any(p => (p.Name == "G3.objective_type" || p.Name == "G14.allowed_evidence_types") && p.Value.ValueKind != JsonValueKind.Null && Edited(b, p.Name));
        try
        {
            var roles = Roles();
            var approved = await _store.ApproveAsync(id, Actor(), roles.FirstOrDefault() ?? "unknown", req?.Note, TimeSpan.FromHours(Math.Clamp(req?.ValidityHours ?? 72, 1, 24 * 30)), sensitive, roles, ct);
            _audit.Emit("CONFIG_DRAFT_APPROVED", Actor(), "gate_config_bundle", id.ToString(), new { approved.ContentHash, approved.ChangeClass, sensitive });
            return Ok(Shape(approved));
        }
        catch (ConfigForbiddenException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ConfigStateException ex) { return Conflict(new { error = ex.Message }); }
    }

    private static bool Edited(BundleView b, string property)
    {
        foreach (var layer in b.Layers.EnumerateArray())
        {
            if (layer.GetProperty("kind").GetString() == b.ScopeKind && layer.GetProperty("content").ValueKind == JsonValueKind.Object && layer.GetProperty("content").TryGetProperty(property, out _)) return true;
        }
        return false;
    }

    internal static object ShapeWithApprovals(BundleView b, IReadOnlyList<ConfigStore.ApprovalView> approvals) => new
    {
        b.BundleId, b.Version, b.ContentHash, b.Site, b.ScopeKind, b.ScopeRef, b.ParentBundleId, b.ParentHash, b.CatalogueHash, b.ExecutionPlanHash, b.ChangeClass, b.State,
        b.Layers, b.Resolved, b.Validation, b.Shadow, b.EffectiveFrom, b.CreatedBy, b.CreatedAt, b.UpdatedAt, b.Etag, b.Note, approvals,
    };

    public static object ShapeSummary(BundleView b) => new
    {
        b.BundleId, b.Version, b.ContentHash, b.Site, b.ScopeKind, b.ScopeRef, b.ParentBundleId, b.ChangeClass, b.State, b.EffectiveFrom, b.CreatedBy, b.CreatedAt, b.UpdatedAt, b.Note,
        validationErrors = b.Validation is { } v && v.ValueKind == JsonValueKind.Object && v.TryGetProperty("errors", out var e) && e.ValueKind == JsonValueKind.Array ? e.GetArrayLength() : 0,
    };

    internal static object Shape(BundleView b) => new
    {
        b.BundleId, b.Version, b.ContentHash, b.Site, b.ScopeKind, b.ScopeRef, b.ParentBundleId, b.ParentHash, b.CatalogueHash, b.ExecutionPlanHash, b.ChangeClass, b.State,
        b.Layers, b.Resolved, b.Validation, b.Shadow, b.EffectiveFrom, b.CreatedBy, b.CreatedAt, b.UpdatedAt, b.Etag, b.Note,
    };
}
