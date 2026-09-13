// Extraction Phase 3 COPY of AMS.Api Controllers/V1/CpmAnalyticsController.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CPLM Phase 5 — evidence read API (A3 gate matrix, A4 KPI stream, A13 window
/// metadata). Serves what the Flink pipeline actually computed, from
/// analytics.cplm_*; nothing here is derived or fabricated at request time.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
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

    /// <summary>
    /// The window contract the deployed Flink jobs actually implement.
    ///
    /// This exists because three UI surfaces (Overview's window ladder, the Window
    /// Inspector, the onboarding wizard) each hardcoded their own version of it and
    /// drifted apart — two of them claimed every short window was TUMBLING when
    /// five of the six are SLIDING with overlap, and that short-tier lateness was
    /// "watermark-bounded" when each branch sets an explicit 30s–3min.
    ///
    /// Honest about what this is: a hand-maintained mirror of the job sources, not
    /// something the jobs publish. It reduces four copies to one; it does not make
    /// drift impossible. If you change a window, change it here too:
    ///   • short  — CplmShortFeatureStreamJob (6 branches, .allowedLateness per branch)
    ///   • long   — CplmLongDiagnosticsStreamJob (TIMER_INTERVAL_MS, WINDOW_*_MS, MIN_SAMPLES)
    ///   • fusion — CplmGateFusionStreamJob.processElement2 (12h/24h guard)
    /// </summary>
    private sealed record WindowSpec(
        string Kind,
        string Tier,
        /// <summary>tumbling | sliding | rolling-buffer (the long tier is a
        /// KeyedProcessFunction over a retained buffer, not a Flink window).</summary>
        string Assigner,
        long SizeMs,
        long? SlideMs,
        long? AllowedLatenessMs,
        long? CadenceMs,
        int? MinSamples,
        string Feeds);

    private const long Min = 60_000L;
    private const long Hour = 60L * Min;

    private static readonly WindowSpec[] WindowSpecs =
    {
        // ── short tier: CplmShortFeatureStreamJob ────────────────────────────
        new("1m",  "short", "tumbling",       1 * Min,  null,    30_000,  null, null, "G0–G4 short features"),
        new("5m",  "short", "sliding",        5 * Min,  1 * Min, 60_000,  null, null, "G0–G4 short features"),
        new("10m", "short", "sliding",       10 * Min,  2 * Min, 90_000,  null, null, "G0–G4 short features"),
        new("15m", "short", "sliding",       15 * Min,  5 * Min, 2 * Min, null, null, "G0–G4 short features"),
        new("30m", "short", "sliding",       30 * Min,  5 * Min, 2 * Min, null, null, "G0–G4 short features"),
        new("60m", "short", "sliding",       60 * Min,  5 * Min, 3 * Min, null, null, "G0–G4 short features"),
        // ── long tier: CplmLongDiagnosticsStreamJob ──────────────────────────
        // Event-time timers on a 15-min cadence recompute each slice from the
        // retained buffer; a slice with < MinSamples is not emitted at all, which
        // is the usual reason a sparse loop never produces a verdict.
        // `feeds` is the same for all three: which of them additionally trigger
        // fusion is stated once by `fusion.firesOn` below, not duplicated here —
        // otherwise a UI grouping these rows cannot dedupe the shared caption.
        new("4h",  "long",  "rolling-buffer",  4 * Hour, null, null, 15 * Min, 32, "G5–G11 long diagnostics"),
        new("12h", "long",  "rolling-buffer", 12 * Hour, null, null, 15 * Min, 32, "G5–G11 long diagnostics"),
        new("24h", "long",  "rolling-buffer", 24 * Hour, null, null, 15 * Min, 32, "G5–G11 long diagnostics"),
    };

    /// <summary>Which long records trigger the fusion engine (G12–G15 → verdict).</summary>
    private static readonly string[] FusionTriggerWindows = { "12h", "24h" };

    /// <summary>Short-feature resolutions vs long-diagnostics resolutions.</summary>
    private static readonly string[] ShortWindows =
        WindowSpecs.Where(w => w.Tier == "short").Select(w => w.Kind).ToArray();
    private static readonly string[] LongWindows =
        WindowSpecs.Where(w => w.Tier == "long").Select(w => w.Kind).ToArray();

    private readonly NpgsqlDataSource _dataSource;

    public CpmAnalyticsController([FromKeyedServices("cplm")] NpgsqlDataSource dataSource) => _dataSource = dataSource;

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
        // CHG-023: two index probes (newest real verdict, else newest row) instead of
        // sorting the loop's rows by the expression on every click — see GateReadSql.
        var row = await conn.QueryFirstOrDefaultAsync(Traverse.CplmApi.Data.GateReadSql.LatestForLoop, new { loopId, windowKind });

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
        [FromQuery] DateTimeOffset? before = null,
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

        var sql = isLong ? Traverse.CplmApi.Data.KpiSql.Long : Traverse.CplmApi.Data.KpiSql.Short;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = (await conn.QueryAsync(sql, new { loopId, resolution, from, to, limit, before })).ToList();
        // Keyset cursor: rows are newest-first, so the oldest window_end on a full
        // page is the `before` value for the next page. Null when this page is the
        // end of the data (or the caller's range).
        DateTimeOffset? nextBefore = null;
        if (rows.Count == limit && rows[^1] is IDictionary<string, object?> last
            && last.TryGetValue("window_end", out var lastEnd) && lastEnd is DateTime dt)
            nextBefore = new DateTimeOffset(dt.ToUniversalTime());
        return Ok(new
        {
            loopId,
            resolution,
            tier = isLong ? "long" : "short",
            count = rows.Count,
            nextBefore,
            samples = rows
        });
    }

    /// <summary>
    /// CHG-024 — several resolutions' newest rows in ONE request. The Windows comparator
    /// used to issue six GET /kpis calls (one per short window kind) on every loop
    /// selection; this answers the same rows keyed by kind (Data/KpiReads.cs).
    /// </summary>
    [HttpGet("loops/{loopId}/kpis/latest")]
    public async Task<IActionResult> GetLatestKpisByResolution(
        string loopId,
        [FromQuery] string resolutions = "",
        [FromQuery] int limit = 12,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        var kinds = resolutions.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal).ToList();
        if (kinds.Count == 0)
            return BadRequest(new { error = "resolutions is required (comma-separated)", shortWindows = ShortWindows, longWindows = LongWindows });
        var unknown = kinds.Where(k => !ShortWindows.Contains(k) && !LongWindows.Contains(k)).ToList();
        if (unknown.Count > 0)
            return BadRequest(new { error = $"Unknown resolution(s) '{string.Join(", ", unknown)}'", shortWindows = ShortWindows, longWindows = LongWindows });

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var slices = await Traverse.CplmApi.Data.KpiReads.LatestByResolutionAsync(
            conn, loopId, kinds.Select(k => (k, LongWindows.Contains(k))).ToList(), limit);
        return Ok(new
        {
            loopId,
            limit,
            byResolution = slices.ToDictionary(kv => kv.Key, kv => new { tier = kv.Value.Tier, count = kv.Value.Count, samples = kv.Value.Samples }),
        });
    }

    /// <summary>
    /// Available resolutions, the full window contract, and the gate catalogue, so
    /// a UI need not hardcode any of it. `windows` is the addition: assigner, size,
    /// slide, allowed lateness, cadence and the minimum-sample floor per window
    /// kind — the facts three screens previously each guessed at differently.
    /// </summary>
    [HttpGet("resolutions")]
    public IActionResult GetResolutions() => Ok(new
    {
        shortWindows = ShortWindows,
        longWindows = LongWindows,
        windows = WindowSpecs.Select(w => new
        {
            kind = w.Kind,
            tier = w.Tier,
            assigner = w.Assigner,
            sizeMs = w.SizeMs,
            slideMs = w.SlideMs,
            allowedLatenessMs = w.AllowedLatenessMs,
            cadenceMs = w.CadenceMs,
            minSamples = w.MinSamples,
            feeds = w.Feeds,
            // Overlap is the fact the old UI copy got wrong, so state it outright
            // rather than leaving every caller to infer it from slide < size.
            overlapping = w.SlideMs != null && w.SlideMs < w.SizeMs
        }),
        fusion = new
        {
            firesOn = FusionTriggerWindows,
            produces = "G0–G15 fused diagnosis",
            note = "Fusion is triggered by long records, so no verdict exists before a loop completes a 12h slice."
        },
        gates = GateDefs.Select(g => new { key = g.Key, name = g.Name, tier = g.Tier }),
        note = "Gate results are produced only for 12h and 24h windows: fusion fires on long records. "
             + "Window values mirror the deployed Flink jobs (CplmShortFeatureStreamJob, "
             + "CplmLongDiagnosticsStreamJob, CplmGateFusionStreamJob)."
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
            // U5 Investigation — the numeric evidence behind the verdict (family
            // scores, freeze index, shape metrics, …). All numeric payload fields
            // pass through as-is; inventing a curated subset here would just mean
            // another schema to keep in sync with the engine.
            ["metrics"] = ReadNumericFields(payload),
            ["narrative"] = new
            {
                selectedFamily = ReadString(payload, "selected_family"),
                statusReason = ReadString(payload, "status_reason"),
                recommendation = ReadString(payload, "recommendation"),
            },
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

    private static Dictionary<string, double> ReadNumericFields(JsonElement el)
    {
        var result = new Dictionary<string, double>();
        if (el.ValueKind != JsonValueKind.Object) return result;
        foreach (var prop in el.EnumerateObject())
        {
            if (prop.Value.ValueKind == JsonValueKind.Number && prop.Value.TryGetDouble(out var v)
                && !double.IsNaN(v) && !double.IsInfinity(v))
            {
                result[prop.Name] = v;
            }
        }
        return result;
    }

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
