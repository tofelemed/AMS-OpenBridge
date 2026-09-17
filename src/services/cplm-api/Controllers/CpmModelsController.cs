using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 2B.2 (spec v6 §2.8 model governance): path models read AS-OF (the models applicable
/// at an instant, never "latest") and the server-owned review decision. A review is bound to the
/// model id and its evidence, guarded by If-Match on the model revision (409 on stale), recorded
/// with the acting user from the gateway headers, and audited. The job's later re-delivery of the
/// same result never overwrites a review (the store keeps a reviewed row's state).
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
public sealed class CpmModelsController : ControllerBase
{
    private static readonly HashSet<string> Decisions = new(StringComparer.Ordinal) { "VALIDATED", "REJECTED", "ACTIVE_BASELINE", "EXPIRED" };
    private readonly NpgsqlDataSource _db;
    private readonly ICplmAuditEmitter _audit;

    public CpmModelsController([FromKeyedServices("cplm")] NpgsqlDataSource db, ICplmAuditEmitter audit)
    {
        _db = db;
        _audit = audit;
    }

    public sealed record ReviewRequest(string Decision, JsonElement? Domain, string? Note);

    [HttpGet("loops/{loopId}/models")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> List(string loopId, [FromQuery] DateTimeOffset? at, [FromQuery] string? regime, [FromQuery] string? state,
        [FromQuery] int limit = 50, CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        var instant = at ?? DateTimeOffset.UtcNow;
        await using var conn = await _db.OpenConnectionAsync(ct);
        // as-of: models created at or before the instant and not superseded before it
        var rows = (await conn.QueryAsync("""
            SELECT m.model_id, m.loop_id, m.path_id, m.family, m.parameters::text AS parameters, m.estimator, m.uncertainty_method,
                   m.training_support::text AS training_support, m.validation_support::text AS validation_support, m.model_state,
                   m.approved_domain::text AS approved_domain, m.controller_snapshot_id, m.context_revision, m.created_from_event, m.method_run_id,
                   m.bundle_hash, m.revision, m.reviewed_by, m.reviewed_at, m.review_note, m.created_at, m.superseded_by
            FROM analytics.system_model m
            WHERE lower(m.loop_id) = lower(@loopId) AND m.created_at <= @at
              AND (@state::text IS NULL OR m.model_state = @state)
              AND (@regime::text IS NULL OR m.approved_domain->>'regime' IS NULL OR m.approved_domain->>'regime' = @regime)
            ORDER BY (m.model_state = 'ACTIVE_BASELINE') DESC, (m.model_state = 'VALIDATED') DESC, m.created_at DESC
            LIMIT @limit
            """, new { loopId, at = instant.UtcDateTime, state, regime, limit })).Select(Shape).ToList();
        return Ok(new { loopId, at = instant, count = rows.Count, models = rows });
    }

    [HttpGet("models/{modelId:guid}")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> Get(Guid modelId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var m = await conn.QueryFirstOrDefaultAsync("""
            SELECT model_id, loop_id, path_id, family, parameters::text AS parameters, estimator, uncertainty_method, training_support::text AS training_support,
                   validation_support::text AS validation_support, model_state, approved_domain::text AS approved_domain, controller_snapshot_id, context_revision,
                   created_from_event, method_run_id, bundle_hash, revision, reviewed_by, reviewed_at, review_note, created_at, superseded_by
            FROM analytics.system_model WHERE model_id = @modelId
            """, new { modelId });
        if (m is null) return NotFound(new { error = $"model {modelId} not found" });
        Response.Headers.ETag = $"\"{(int)m.revision}\"";
        return Ok(Shape(m));
    }

    /// <summary>Server-owned review: the decision is recorded against the model id, guarded by If-Match on its revision, audited.</summary>
    [HttpPost("models/{modelId:guid}/review")]
    [Authorize(Policy = "cpm.model.review")]
    public async Task<IActionResult> Review(Guid modelId, [FromBody] ReviewRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Decision) || !Decisions.Contains(req.Decision))
            return UnprocessableEntity(new { error = "decision must be one of VALIDATED, REJECTED, ACTIVE_BASELINE, EXPIRED", field = "decision" });
        var actor = User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";   // claims from the edge-trust handler, never a raw header
        if (string.IsNullOrWhiteSpace(actor)) return Forbid();
        int? expected = null;
        if (Request.Headers.TryGetValue("If-Match", out var ifMatch) && int.TryParse(ifMatch.ToString().Trim('"', ' '), out var rev)) expected = rev;

        await using var conn = await _db.OpenConnectionAsync(ct);
        var current = await conn.QueryFirstOrDefaultAsync("SELECT revision, model_state, loop_id FROM analytics.system_model WHERE model_id = @modelId", new { modelId });
        if (current is null) return NotFound(new { error = $"model {modelId} not found" });
        if (expected is not null && expected.Value != (int)current.revision)
            return Conflict(new { error = "stale revision", currentRevision = (int)current.revision, expected });
        var domain = req.Domain is { ValueKind: JsonValueKind.Object } d ? d.GetRawText() : "{}";
        var updated = await conn.QueryFirstAsync("""
            UPDATE analytics.system_model
            SET model_state = @decision, approved_domain = @domain::jsonb, revision = revision + 1, reviewed_by = @actor, reviewed_at = now(), review_note = @note
            WHERE model_id = @modelId AND revision = @rev
            RETURNING revision, model_state
            """, new { decision = req.Decision, domain, actor, note = req.Note, modelId, rev = (int)current.revision });
        // an ACTIVE_BASELINE supersedes any previous baseline of the same loop
        if (req.Decision == "ACTIVE_BASELINE")
        {
            await conn.ExecuteAsync("""
                UPDATE analytics.system_model SET model_state = 'SUPERSEDED', superseded_by = @modelId, revision = revision + 1
                WHERE lower(loop_id) = lower(@loop) AND model_id <> @modelId AND model_state = 'ACTIVE_BASELINE'
                """, new { modelId, loop = (string)current.loop_id });
        }
        _audit.Emit("cpm.model.reviewed", actor, "system_model", modelId.ToString(), new { decision = req.Decision, from = (string)current.model_state, note = req.Note, revision = (int)updated.revision });
        Response.Headers.ETag = $"\"{(int)updated.revision}\"";
        return Ok(new { modelId, modelState = (string)updated.model_state, revision = (int)updated.revision, reviewedBy = actor });
    }

    private static object Shape(dynamic m) => new
    {
        modelId = (Guid)m.model_id, loopId = (string)m.loop_id, pathId = (string)m.path_id, family = (string)m.family,
        parameters = Parse((string?)m.parameters), estimator = (string)m.estimator, uncertaintyMethod = (string)m.uncertainty_method,
        trainingSupport = Parse((string?)m.training_support), validationSupport = Parse((string?)m.validation_support),
        modelState = (string)m.model_state, approvedDomain = Parse((string?)m.approved_domain), controllerSnapshotId = (Guid?)m.controller_snapshot_id,
        contextRevision = (int)m.context_revision, createdFromEvent = (Guid?)m.created_from_event, methodRunId = (Guid?)m.method_run_id,
        bundleHash = (string)m.bundle_hash, revision = (int)m.revision, reviewedBy = (string?)m.reviewed_by, reviewedAt = (DateTime?)m.reviewed_at,
        reviewNote = (string?)m.review_note, createdAt = (DateTime)m.created_at, supersededBy = (Guid?)m.superseded_by,
    };

    private static JsonElement? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { using var doc = JsonDocument.Parse(json); return doc.RootElement.Clone(); } catch (JsonException) { return null; }
    }
}
