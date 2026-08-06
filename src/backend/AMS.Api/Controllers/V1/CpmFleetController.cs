using System.Text.Json;
using Asp.Versioning;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace AMS.Api.Controllers.V1;

/// <summary>
/// CPLM Phase 5 (A11) — fleet view: summary, rankings and the loop×gate heatmap.
///
/// Every figure here is registry-driven (LEFT JOIN onto results), so a loop that
/// is onboarded but has produced no evidence yet appears with nulls rather than
/// vanishing. A fleet screen that silently omits unevaluated loops is how loops
/// stay unmonitored for months.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/cpm/fleet")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmFleetController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;

    public CpmFleetController([FromKeyedServices("cplm")] NpgsqlDataSource dataSource) => _dataSource = dataSource;

    /// <summary>
    /// A11 — headline counts: how many loops are registered, monitored, evaluated,
    /// and how the evaluated ones distribute across diagnosis families.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(
        [FromQuery] string? site = null,
        [FromQuery] string windowKind = "24h",
        CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var registry = await conn.QueryFirstOrDefaultAsync("""
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE))::int AS monitored,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE))::int AS with_peer_links,
                   COUNT(*) FILTER (WHERE tags ? 'vp')::int AS with_vp
            FROM cpm.loop_registry
            WHERE (@site::text IS NULL OR site = @site)
            """, new { site });

        // One row per loop: its newest real verdict at this resolution.
        var byDiagnosis = await conn.QueryAsync<(string Diagnosis, int Count)>("""
            WITH latest AS (
                SELECT DISTINCT ON (g.loop_id) g.loop_id, g.diagnosis
                FROM analytics.cplm_gate_results g
                JOIN cpm.loop_registry r ON r.loop_id = g.loop_id
                WHERE g.window_kind = @windowKind
                  AND g.diagnosis IS DISTINCT FROM 'INSUFFICIENT_DATA'
                  AND (@site::text IS NULL OR r.site = @site)
                ORDER BY g.loop_id, g.window_end DESC NULLS LAST, g.created_at DESC
            )
            SELECT diagnosis AS "Diagnosis", COUNT(*)::int AS "Count"
            FROM latest GROUP BY diagnosis ORDER BY 2 DESC
            """, new { site, windowKind });

        return Ok(new
        {
            site,
            windowKind,
            loops = new
            {
                total = registry?.total ?? 0,
                monitored = registry?.monitored ?? 0,
                withPeerLinks = registry?.with_peer_links ?? 0,
                withVp = registry?.with_vp ?? 0
            },
            diagnoses = byDiagnosis.Select(d => new { diagnosis = d.Diagnosis, count = d.Count }),
            // Capability caveats, not decoration: a fleet without VP can never
            // report a CONFIRMED diagnosis, and one without peer links cannot
            // distinguish stiction from an upstream disturbance.
            capability = new
            {
                confidenceCappedWithoutVp = 0.89,
                loopsCappedByMissingVp = (registry?.total ?? 0) - (registry?.with_vp ?? 0),
                loopsWithoutDisturbanceContext = (registry?.total ?? 0) - (registry?.with_peer_links ?? 0)
            }
        });
    }

    /// <summary>
    /// A11 — bad-actor ranking. Ordered by confidence within a real diagnosis, so
    /// the loops most likely to reward an engineer's time come first.
    /// </summary>
    [HttpGet("rankings")]
    public async Task<IActionResult> GetRankings(
        [FromQuery] string? site = null,
        [FromQuery] string windowKind = "24h",
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 200);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var rows = await conn.QueryAsync("""
            WITH latest AS (
                SELECT DISTINCT ON (g.loop_id)
                       g.loop_id, g.window_kind, g.window_end, g.diagnosis, g.severity,
                       g.confidence, g.effort_ratio, g.triangularity, g.horch_oddness,
                       g.acf_period_s, g.good_error_pct, g.mae, g.payload::text AS payload
                FROM analytics.cplm_gate_results g
                WHERE g.window_kind = @windowKind
                ORDER BY g.loop_id,
                         (g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') DESC,
                         g.window_end DESC NULLS LAST, g.created_at DESC
            )
            SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
                   l.window_end, l.diagnosis, l.severity, l.confidence,
                   l.effort_ratio, l.triangularity, l.horch_oddness, l.acf_period_s,
                   l.good_error_pct, l.mae, l.payload
            FROM cpm.loop_registry r
            LEFT JOIN latest l ON l.loop_id = r.loop_id
            WHERE (@site::text IS NULL OR r.site = @site)
              AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
            ORDER BY
                -- Real verdicts first, then by confidence; unevaluated loops sink
                -- to the bottom but are still listed.
                (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC,
                l.confidence DESC NULLS LAST,
                r.loop_id
            LIMIT @limit
            """, new { site, windowKind, limit });

        var ranked = rows.Select((r, i) => new
        {
            rank = i + 1,
            loopId = r.loop_id,
            displayName = r.display_name,
            site = r.site,
            area = r.area,
            unit = r.unit,
            loopType = r.loop_type,
            criticality = r.criticality,
            windowEnd = r.window_end,
            diagnosis = (string?)r.diagnosis ?? "NOT_EVALUATED",
            severity = r.severity,
            confidence = r.confidence,
            metrics = new
            {
                effortRatio = r.effort_ratio,
                triangularity = r.triangularity,
                horchOddness = r.horch_oddness,
                acfPeriodS = r.acf_period_s,
                goodErrorPct = r.good_error_pct,
                mae = r.mae
            },
            observabilityFlags = ReadStringArray((string?)r.payload, "observability_flags")
        }).ToList();

        return Ok(new { site, windowKind, count = ranked.Count, loops = ranked });
    }

    /// <summary>
    /// A11 — loop × gate heatmap. Returns each loop's 17 gate statuses so the UI
    /// can render the grid without issuing one request per loop.
    /// </summary>
    [HttpGet("heatmap")]
    public async Task<IActionResult> GetHeatmap(
        [FromQuery] string? site = null,
        [FromQuery] string windowKind = "24h",
        [FromQuery] int limit = 100,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 300);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var rows = await conn.QueryAsync("""
            WITH latest AS (
                SELECT DISTINCT ON (g.loop_id)
                       g.loop_id, g.window_end, g.diagnosis, g.confidence, g.payload::text AS payload
                FROM analytics.cplm_gate_results g
                WHERE g.window_kind = @windowKind
                ORDER BY g.loop_id,
                         (g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') DESC,
                         g.window_end DESC NULLS LAST, g.created_at DESC
            )
            SELECT r.loop_id, r.display_name, r.site, r.loop_type,
                   l.window_end, l.diagnosis, l.confidence, l.payload
            FROM cpm.loop_registry r
            LEFT JOIN latest l ON l.loop_id = r.loop_id
            WHERE (@site::text IS NULL OR r.site = @site)
              AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
            ORDER BY r.loop_id
            LIMIT @limit
            """, new { site, windowKind, limit });

        var gateKeys = new[] { "G0","G1","G2","G2r","G3","G4","G5","G6","G7","G8","G9","G10","G11","G12","G13","G14","G15" };
        var cells = rows.Select(r =>
        {
            var payload = ParseJson((string?)r.payload);
            var gates = new Dictionary<string, string>();
            foreach (var key in gateKeys) gates[key] = ReadGateStatus(payload, key);
            return new
            {
                loopId = r.loop_id,
                displayName = r.display_name,
                loopType = r.loop_type,
                windowEnd = r.window_end,
                diagnosis = (string?)r.diagnosis ?? "NOT_EVALUATED",
                confidence = r.confidence,
                gates
            };
        }).ToList();

        return Ok(new { site, windowKind, gateKeys, count = cells.Count, loops = cells });
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static string ReadGateStatus(JsonElement payload, string key)
    {
        if (payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("gates", out var gates)
            && gates.ValueKind == JsonValueKind.Object
            && gates.TryGetProperty(key, out var status)
            && status.ValueKind == JsonValueKind.String)
        {
            return status.GetString() ?? "NOT_EVALUATED";
        }
        return "NOT_EVALUATED";
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }

    private static string[] ReadStringArray(string? json, string name)
    {
        var el = ParseJson(json);
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var arr) || arr.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        return arr.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray();
    }
}
