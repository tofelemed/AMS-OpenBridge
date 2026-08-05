using System.Text.Json;
using Asp.Versioning;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace AMS.Api.Controllers.V1;

/// <summary>
/// CPLM Phase 5 — evidence read API (A3 gate matrix, A4 KPI stream, A13 window
/// metadata). Serves what the Flink pipeline actually computed, from
/// analytics.cplm_*; nothing here is derived or fabricated at request time.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmAnalyticsController : ControllerBase
{
    /// <summary>
    /// The 17 gates in evaluation order, with the human-readable name each maps to.
    /// Order is meaningful: G0-G4 are short-window, G5-G11 long-window, G12-G15 fusion.
    /// </summary>
    private static readonly (string Key, string Name, string Tier)[] GateDefs =
    {
        ("G0",  "Data quality",        "short"),
        ("G1",  "Mode / service",      "short"),
        ("G2",  "SP activity",         "short"),
        ("G2r", "Operating region",    "short"),
        ("G3",  "Base performance",    "short"),
        ("G4",  "Actuator effort",     "short"),
        ("G5",  "Oscillation (ACF)",   "long"),
        ("G6",  "Spectral (FFT)",      "long"),
        ("G7",  "Stiction shape",      "long"),
        ("G8",  "Horch oddness",       "long"),
        ("G9",  "Phase geometry",      "long"),
        ("G10", "Valve / saturation",  "long"),
        ("G11", "Sensor health",       "long"),
        ("G12", "Step-test evidence",  "fusion"),
        ("G13", "Disturbance context", "fusion"),
        ("G14", "VP confirmation",     "fusion"),
        ("G15", "Diagnosis band",      "fusion")
    };

    /// <summary>Short-feature resolutions vs long-diagnostics resolutions.</summary>
    private static readonly string[] ShortWindows = { "1m", "5m", "10m", "15m", "30m", "60m" };
    private static readonly string[] LongWindows = { "4h", "12h", "24h" };

    private readonly NpgsqlDataSource _dataSource;

    public CpmAnalyticsController(NpgsqlDataSource dataSource) => _dataSource = dataSource;

    /// <summary>
    /// A3 — the gate matrix for a loop's most recent evaluated window.
    ///
    /// "Latest" prefers a real verdict over the INSUFFICIENT_DATA rows the engine
    /// emits for trailing partial windows, then the newest window end. Ordering by
    /// created_at alone (as the CPA view did) surfaces whichever row a replay
    /// rewrote most recently, which is not the same thing.
    /// </summary>
    [HttpGet("loops/{loopId}/gates/latest")]
    public async Task<IActionResult> GetLatestGateMatrix(
        string loopId, [FromQuery] string windowKind = "24h", CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync("""
            SELECT loop_id, window_kind, window_start, window_end, sample_count,
                   diagnosis, severity, confidence, payload::text AS payload, created_at
            FROM analytics.cplm_gate_results
            WHERE lower(loop_id) = lower(@loopId) AND window_kind = @windowKind
            ORDER BY (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC,
                     window_end DESC NULLS LAST, created_at DESC
            LIMIT 1
            """, new { loopId, windowKind });

        if (row is null)
            return NotFound(new { error = $"No gate results for loop '{loopId}' at resolution '{windowKind}'" });

        return Ok(BuildGateMatrix(row));
    }

    /// <summary>A3 (history) — gate verdicts over a time range, newest first.</summary>
    [HttpGet("loops/{loopId}/gates")]
    public async Task<IActionResult> GetGateHistory(
        string loopId,
        [FromQuery] string windowKind = "24h",
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        [FromQuery] int limit = 100,
        [FromQuery] bool includeInsufficient = false,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("""
            SELECT loop_id, window_kind, window_start, window_end, sample_count,
                   diagnosis, severity, confidence, payload::text AS payload, created_at
            FROM analytics.cplm_gate_results
            WHERE lower(loop_id) = lower(@loopId) AND window_kind = @windowKind
              AND (@from::timestamptz IS NULL OR window_end >= @from::timestamptz)
              AND (@to::timestamptz   IS NULL OR window_end <= @to::timestamptz)
              AND (@includeInsufficient OR diagnosis IS DISTINCT FROM 'INSUFFICIENT_DATA')
            ORDER BY window_end DESC NULLS LAST, created_at DESC
            LIMIT @limit
            """, new { loopId, windowKind, from, to, limit, includeInsufficient });

        var results = rows.Select(r => (object)BuildGateMatrix(r)).ToList();
        return Ok(new { loopId, windowKind, count = results.Count, windows = results });
    }

    /// <summary>
    /// A4 — KPI stream by resolution. Routes to the short-feature or
    /// long-diagnostics table depending on the requested window; they carry
    /// genuinely different metrics, so the response names which tier answered.
    /// </summary>
    [HttpGet("loops/{loopId}/kpis")]
    public async Task<IActionResult> GetKpiStream(
        string loopId,
        [FromQuery] string resolution = "24h",
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        [FromQuery] int limit = 200,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        var isLong = LongWindows.Contains(resolution);
        if (!isLong && !ShortWindows.Contains(resolution))
            return BadRequest(new
            {
                error = $"Unknown resolution '{resolution}'",
                shortWindows = ShortWindows,
                longWindows = LongWindows
            });

        var sql = isLong
            ? """
              SELECT window_start, window_end, sample_count, acf_period_s, acf_regularity,
                     effort_ratio, triangularity, horch_oddness, corner_score,
                     travel_per_day, reversals_per_hour,
                     harmonic_amplitude_ratio, harmonic_energy_ratio, created_at
              FROM analytics.cplm_long_feature_results
              WHERE lower(loop_id) = lower(@loopId) AND window_kind = @resolution
                AND (@from::timestamptz IS NULL OR window_end >= @from::timestamptz)
                AND (@to::timestamptz   IS NULL OR window_end <= @to::timestamptz)
              ORDER BY window_end DESC NULLS LAST LIMIT @limit
              """
            : """
              SELECT window_start, window_end, sample_count, iae, ise, mae, rmse,
                     good_error_pct, effort_ratio, travel_per_day, reversals_per_hour,
                     auto_pct, completeness, created_at
              FROM analytics.cplm_short_feature_results
              WHERE lower(loop_id) = lower(@loopId) AND window_kind = @resolution
                AND (@from::timestamptz IS NULL OR window_end >= @from::timestamptz)
                AND (@to::timestamptz   IS NULL OR window_end <= @to::timestamptz)
              ORDER BY window_end DESC NULLS LAST LIMIT @limit
              """;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = (await conn.QueryAsync(sql, new { loopId, resolution, from, to, limit })).ToList();
        return Ok(new
        {
            loopId,
            resolution,
            tier = isLong ? "long" : "short",
            count = rows.Count,
            samples = rows
        });
    }

    /// <summary>Available resolutions and the gate catalogue, so a UI need not hardcode them.</summary>
    [HttpGet("resolutions")]
    public IActionResult GetResolutions() => Ok(new
    {
        shortWindows = ShortWindows,
        longWindows = LongWindows,
        gates = GateDefs.Select(g => new { key = g.Key, name = g.Name, tier = g.Tier }),
        note = "Gate results are produced only for 12h and 24h windows: fusion fires on long records."
    });

    // ── Shaping ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Projects a stored gate row into the matrix the UI binds to. The 17 statuses
    /// and the version stamps live only in the payload JSONB (the typed columns
    /// carry metrics), so they are read from there; A13 metadata rides along so a
    /// window can always be attributed to the calculation that produced it.
    /// </summary>
    private static Dictionary<string, object?> BuildGateMatrix(dynamic row)
    {
        var payload = ParseJson((string?)row.payload);
        var gates = new List<object>();
        foreach (var (key, name, tier) in GateDefs)
        {
            gates.Add(new
            {
                key,
                name,
                tier,
                status = ReadGateStatus(payload, key),
                // Why a gate is not evaluated matters as much as its status:
                // NO_VP, NO_UPSTREAM_LINKS and NO_STEP_TEST are configuration
                // gaps the operator can close, not engine failures.
                reason = key == "G9" ? ReadString(payload, "gate9_reason") : null
            });
        }

        return new Dictionary<string, object?>
        {
            ["loopId"] = row.loop_id,
            ["windowKind"] = row.window_kind,
            ["windowStart"] = row.window_start,
            ["windowEnd"] = row.window_end,
            ["sampleCount"] = row.sample_count,
            ["diagnosis"] = row.diagnosis,
            ["severity"] = row.severity,
            ["confidence"] = row.confidence,
            ["gates"] = gates,
            ["observabilityFlags"] = ReadStringArray(payload, "observability_flags"),
            ["familyDisqualifiers"] = ReadStringArray(payload, "family_disqualifiers"),
            ["hasPeerLinks"] = ReadBool(payload, "has_peer_links"),
            ["insufficientEvidenceReason"] = ReadString(payload, "insufficient_evidence_reason"),
            // A13 — per-window provenance. Without these a stored verdict cannot be
            // attributed to the formula version that produced it, which makes
            // historical evidence unauditable after any engine change.
            ["metadata"] = new
            {
                schemaVersion = ReadInt(payload, "schemaVersion"),
                calculationVersion = ReadString(payload, "calculation_version") ?? ReadString(payload, "calculationVersion"),
                dynamicsProfileVersion = ReadString(payload, "dynamics_profile_version") ?? ReadString(payload, "dynamicsProfileVersion"),
                dynamicsClass = ReadString(payload, "dynamics_class"),
                profileSource = ReadString(payload, "profile_source"),
                calculationSource = ReadString(payload, "calculation_source"),
                replayId = ReadString(payload, "replay_id"),
                computedAt = row.created_at
            }
        };
    }

    private static string ReadGateStatus(JsonElement payload, string key)
    {
        // Preferred: the gates{} rollup the engine writes.
        if (payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("gates", out var gates)
            && gates.ValueKind == JsonValueKind.Object
            && gates.TryGetProperty(key, out var status)
            && status.ValueKind == JsonValueKind.String)
        {
            return status.GetString() ?? "UNKNOWN";
        }
        // Fallback: the flat gateN_status fields, for rows written before the
        // rollup existed. G2r and G10 do not follow the plain pattern.
        var flat = key switch
        {
            "G2r" => "gate2r_status",
            "G10" => "gate10_valve_output",
            _ => $"gate{key[1..]}_status"
        };
        return ReadString(payload, flat) ?? "UNKNOWN";
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }

    private static string? ReadString(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString() : null;

    private static bool ReadBool(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.True;

    private static int? ReadInt(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var p) && p.TryGetInt32(out var v) ? v : null;

    private static string[] ReadStringArray(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var arr) || arr.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        return arr.EnumerateArray()
            .Where(x => x.ValueKind == JsonValueKind.String)
            .Select(x => x.GetString()!)
            .ToArray();
    }
}
