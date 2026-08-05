using AMS.Api.Services;
using Asp.Versioning;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace AMS.Api.Controllers.V1;

/// <summary>
/// CPLM Phase 5 — A12 event frames (read + operator state) and A14 the
/// calculations catalogue.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmEventsController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ICplmAuditEmitter _audit;
    private readonly ILogger<CpmEventsController> _logger;

    public CpmEventsController(
        NpgsqlDataSource dataSource, ICplmAuditEmitter audit, ILogger<CpmEventsController> logger)
    {
        _dataSource = dataSource;
        _audit = audit;
        _logger = logger;
    }

    private string Actor() =>
        User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>
    /// A12 — event frames. Defaults to open frames, because "what is wrong right
    /// now" is the question an operator opens this screen to answer.
    /// </summary>
    [HttpGet("events")]
    public async Task<IActionResult> GetEvents(
        [FromQuery] string? loopId = null,
        [FromQuery] bool openOnly = true,
        [FromQuery] bool includeShelved = false,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] int limit = 100,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("""
            SELECT id, loop_id, window_kind, family, opened_at, closed_at,
                   peak_diagnosis, peak_confidence, last_diagnosis, last_confidence,
                   severity, window_count, ack_state, acked_by, acked_at,
                   shelve_until, note, calculation_version, dynamics_profile_version
            FROM analytics.cplm_event_frames
            WHERE (@loopId::text IS NULL OR lower(loop_id) = lower(@loopId))
              AND (NOT @openOnly OR closed_at IS NULL)
              AND (@from::timestamptz IS NULL OR opened_at >= @from::timestamptz)
              -- A shelved frame is deliberately hidden until its shelve expires;
              -- an expired shelve must reappear rather than stay suppressed.
              AND (@includeShelved OR ack_state <> 'SHELVED' OR shelve_until IS NULL OR shelve_until <= NOW())
            ORDER BY closed_at IS NULL DESC, peak_confidence DESC, opened_at DESC
            LIMIT @limit
            """, new { loopId, openOnly, includeShelved, from, limit });

        var events = rows.ToList();
        return Ok(new { count = events.Count, openOnly, events });
    }

    /// <summary>A12 — acknowledge a frame.</summary>
    [HttpPost("events/{id:long}/acknowledge")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Acknowledge(long id, [FromBody] AckRequest? request, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var affected = await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames
            SET ack_state = 'ACKNOWLEDGED', acked_by = @user, acked_at = NOW(),
                note = COALESCE(@note, note), shelve_until = NULL, updated_at = NOW()
            WHERE id = @id
            """, new { id, user = User.Identity?.Name ?? "unknown", note = request?.Note });
        if (affected == 0) return NotFound();
        _logger.LogInformation("CPLM event frame {Id} acknowledged by {User}", id, User.Identity?.Name);
        _audit.Emit("CPM_EVENT_ACKNOWLEDGED", Actor(), "CpmEventFrame", id.ToString(),
            new { note = request?.Note });
        return Ok(new { id, ackState = "ACKNOWLEDGED" });
    }

    /// <summary>
    /// A12 — shelve a frame until a time. A shelve without an expiry is how
    /// diagnoses get forgotten, so <c>until</c> is required.
    /// </summary>
    [HttpPost("events/{id:long}/shelve")]
    [Authorize(Policy = "cpm.manage")]
    public async Task<IActionResult> Shelve(long id, [FromBody] ShelveRequest request, CancellationToken ct)
    {
        if (request.Until <= DateTimeOffset.UtcNow)
            return BadRequest(new { error = "shelve 'until' must be in the future" });

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var affected = await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames
            SET ack_state = 'SHELVED', shelve_until = @until, acked_by = @user,
                acked_at = NOW(), note = COALESCE(@note, note), updated_at = NOW()
            WHERE id = @id
            """, new { id, until = request.Until, user = User.Identity?.Name ?? "unknown", note = request.Note });
        if (affected == 0) return NotFound();
        _logger.LogInformation("CPLM event frame {Id} shelved until {Until} by {User}",
            id, request.Until, User.Identity?.Name);
        _audit.Emit("CPM_EVENT_SHELVED", Actor(), "CpmEventFrame", id.ToString(),
            new { until = request.Until, note = request.Note });
        return Ok(new { id, ackState = "SHELVED", shelveUntil = request.Until });
    }

    /// <summary>
    /// A14 — the calculations catalogue: what the engine actually computes, with
    /// the versions currently producing results.
    ///
    /// The versions are read from stored results rather than hardcoded. A
    /// catalogue that lists capabilities with no executor behind them (the
    /// pattern in analysis-service's /analyses/types) is worse than no
    /// catalogue: it tells a UI that features exist which will never return data.
    /// </summary>
    [HttpGet("calculations")]
    public async Task<IActionResult> GetCalculations(CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Only report gates that have actually produced a status in stored results.
        var observed = (await conn.QueryAsync<string>("""
            SELECT DISTINCT jsonb_object_keys(payload->'gates') AS gate
            FROM analytics.cplm_gate_results
            WHERE payload ? 'gates'
            LIMIT 100
            """)).ToHashSet(StringComparer.Ordinal);

        var versions = await conn.QueryFirstOrDefaultAsync("""
            SELECT payload->>'calculation_version' AS calculation_version,
                   payload->>'dynamics_profile_version' AS dynamics_profile_version
            FROM analytics.cplm_gate_results
            WHERE payload ? 'calculation_version'
            ORDER BY created_at DESC LIMIT 1
            """);

        var gates = new (string Key, string Name, string Tier, string Question)[]
        {
            ("G0",  "Data quality",       "short",  "Is the sample stream complete and trustworthy?"),
            ("G1",  "Mode / service",     "short",  "Was the loop in automatic long enough to judge?"),
            ("G2",  "SP activity",        "short",  "Did the setpoint move enough to confound the analysis?"),
            ("G2r", "Operating region",   "short",  "Was the loop inside its valid operating band?"),
            ("G3",  "Base performance",   "short",  "How large is the control error?"),
            ("G4",  "Actuator effort",    "short",  "How hard is the actuator working for that error?"),
            ("G5",  "Oscillation (ACF)",  "long",   "Is there a regular oscillation, and at what period?"),
            ("G6",  "Spectral (FFT)",     "long",   "Does the spectrum show a dominant peak and harmonics?"),
            ("G7",  "Stiction shape",     "long",   "Is the OP trace triangular, as stiction produces?"),
            ("G8",  "Horch oddness",      "long",   "Does the cross-correlation show the odd symmetry of stiction?"),
            ("G9",  "Phase geometry",     "long",   "Does the PV-OP phase plot show sharp corners?"),
            ("G10", "Valve / saturation", "long",   "Is the actuator saturated or cycling at a limit?"),
            ("G11", "Sensor health",      "long",   "Is the measurement frozen, quantised or drifting?"),
            ("G12", "Step-test evidence", "fusion", "Is there an approved step test to support tuning claims?"),
            ("G13", "Disturbance context","fusion", "Could an upstream loop be causing this oscillation?"),
            ("G14", "VP confirmation",    "fusion", "Is valve position available to confirm the diagnosis?"),
            ("G15", "Diagnosis band",     "fusion", "How confident is the final verdict?")
        };

        return Ok(new
        {
            calculationVersion = versions?.calculation_version,
            dynamicsProfileVersion = versions?.dynamics_profile_version,
            engine = "CplmGateFusionEngine (Flink)",
            gates = gates.Select(g => new
            {
                key = g.Key,
                name = g.Name,
                tier = g.Tier,
                question = g.Question,
                // Honest about coverage: a gate nothing has produced yet is
                // reported as such rather than implied to be working.
                observedInResults = observed.Contains(g.Key)
            }),
            families = new[]
            {
                new { key = "FINAL_ELEMENT_NONLINEARITY", label = "Stiction / final element", primaryGates = new[] { "G7", "G8", "G9" } },
                new { key = "OSCILLATION",                label = "Oscillation",              primaryGates = new[] { "G5", "G6" } },
                new { key = "EXCESSIVE_EFFORT",           label = "Excessive actuator effort",primaryGates = new[] { "G4" } },
                new { key = "GEOMETRY",                   label = "Phase geometry",           primaryGates = new[] { "G9" } }
            },
            bands = new[]
            {
                new { band = "NO_CALL",   maxConfidence = 0.35 },
                new { band = "DETECTED",  maxConfidence = 0.55 },
                new { band = "CLASSIFIED",maxConfidence = 0.75 },
                new { band = "SUSPECTED", maxConfidence = 0.90 },
                new { band = "CONFIRMED", maxConfidence = 1.00 }
            },
            note = "CONFIRMED requires a VP signal; without it G14 caps confidence at 0.89."
        });
    }

    public sealed record AckRequest(string? Note);
    public sealed record ShelveRequest(DateTimeOffset Until, string? Note);
}
