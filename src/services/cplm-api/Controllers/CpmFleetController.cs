// Fleet view — extracted from AMS.Api in Phase 3; CHG-023 replaced the whole-table
// DISTINCT ON reads with the per-loop probes in Data/FleetLatestSql.cs and put the
// three reads behind a short single-flight cache (Data/FleetReadCache.cs).
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Data;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CPLM Phase 5 (A11) — fleet view: summary, rankings and the loop×gate heatmap.
///
/// Every figure here is registry-driven (LEFT JOIN onto results), so a loop that
/// is onboarded but has produced no evidence yet appears with nulls rather than
/// vanishing. A fleet screen that silently omits unevaluated loops is how loops
/// stay unmonitored for months.
///
/// Read-path contract (CHG-023): each loop's "latest" verdict is its newest REAL
/// verdict if it has one, else its newest row of any kind — resolved by two index
/// probes per loop (see FleetLatestSql), not by sorting the gate table. The old
/// shape cost 10–23 s per call at plant size; these are ~20 ms and stay flat as
/// the table grows. Responses are cached for Cpm:FleetCacheSeconds (default 15) so
/// N polling consoles cost one query per key per TTL; X-Cpm-Cache says HIT or MISS.
/// </summary>
[ApiController]
[Route("api/v1/cpm/fleet")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmFleetController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly FleetReadCache _cache;
    private readonly TimeSpan _ttl;

    public CpmFleetController(
        [FromKeyedServices("cplm")] NpgsqlDataSource dataSource, FleetReadCache cache, IConfiguration config)
    {
        _dataSource = dataSource;
        _cache = cache;
        _ttl = TimeSpan.FromSeconds(config.GetValue("Cpm:FleetCacheSeconds", 15));
    }

    /// <summary>
    /// A11 — headline counts: how many loops are registered, monitored, evaluated,
    /// and how the evaluated ones distribute across diagnosis families.
    /// </summary>
    [HttpGet("summary")]
    public Task<IActionResult> GetSummary(
        [FromQuery] string? site = null,
        // Plant scope (CPM-UX A5). site was already honoured; area/unit complete the
        // hierarchy so a section or unit owner sees only their own loops. All three are
        // optional and narrow independently — the registry stores them denormalised.
        [FromQuery] string? area = null,
        [FromQuery] string? unit = null,
        [FromQuery] string windowKind = "24h",
        CancellationToken ct = default)
        => CachedAsync($"summary|{site}|{area}|{unit}|{windowKind}", async token =>
    {
        await using var conn = await _dataSource.OpenConnectionAsync(token);

        var registry = await conn.QueryFirstOrDefaultAsync("""
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE))::int AS monitored,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE))::int AS with_peer_links,
                   COUNT(*) FILTER (WHERE tags ? 'vp')::int AS with_vp
            FROM cpm.loop_registry
            WHERE (@site::text IS NULL OR site = @site)
              AND (@area::text IS NULL OR area = @area)
              AND (@unit::text IS NULL OR unit = @unit)
            """, new { site, area, unit });

        // One row per loop: its newest real verdict at this resolution.
        var byDiagnosis = await conn.QueryAsync<(string Diagnosis, int Count)>(
            FleetLatestSql.SummaryByDiagnosis, new { site, area, unit, windowKind });

        return (object)new
        {
            site, area, unit,
            windowKind,
            loops = new
            {
                total = registry?.total ?? 0,
                monitored = registry?.monitored ?? 0,
                withPeerLinks = registry?.with_peer_links ?? 0,
                withVp = registry?.with_vp ?? 0
            },
            diagnoses = byDiagnosis.Select(d => new { diagnosis = d.Diagnosis, count = d.Count }).ToList(),
            // Capability caveats, not decoration: a fleet without VP can never
            // report a CONFIRMED diagnosis, and one without peer links cannot
            // distinguish stiction from an upstream disturbance.
            capability = new
            {
                confidenceCappedWithoutVp = 0.89,
                loopsCappedByMissingVp = (registry?.total ?? 0) - (registry?.with_vp ?? 0),
                loopsWithoutDisturbanceContext = (registry?.total ?? 0) - (registry?.with_peer_links ?? 0)
            }
        };
    }, ct);

    /// <summary>
    /// A11 — bad-actor ranking. Ordered by confidence within a real diagnosis, so
    /// the loops most likely to reward an engineer's time come first.
    /// </summary>
    [HttpGet("rankings")]
    public async Task<IActionResult> GetRankings(
        [FromQuery] string? site = null,
        // Plant scope (CPM-UX A5). site was already honoured; area/unit complete the
        // hierarchy so a section or unit owner sees only their own loops. All three are
        // optional and narrow independently — the registry stores them denormalised.
        [FromQuery] string? area = null,
        [FromQuery] string? unit = null,
        [FromQuery] string windowKind = "24h",
        [FromQuery] int limit = 50,
        [FromQuery] string orderBy = "confidence",
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 200);

        // Whitelisted — this is interpolated into ORDER BY.
        //
        // Why the server has to do this: the caller applies LIMIT, so re-sorting
        // the returned page client-side ranks a SUBSET chosen by a different
        // metric. "Worst control error in the fleet" computed over the 50
        // most-confident loops is not the worst in the fleet, and the loop that
        // actually deserves attention can be absent from the page entirely.
        var rankExpr = orderBy?.Trim().ToLowerInvariant() switch
        {
            "confidence" or null or "" => "l.confidence DESC NULLS LAST",
            // good_error_pct is share-inside-band: LOWER is worse, so worst-first.
            "error" => "l.good_error_pct ASC NULLS LAST",
            "mae" => "l.mae DESC NULLS LAST",
            "effort" => "l.effort_ratio DESC NULLS LAST",
            _ => null
        };
        if (rankExpr is null)
            return BadRequest(new
            {
                error = $"Unknown orderBy '{orderBy}'",
                allowed = new[] { "confidence", "error", "mae", "effort" }
            });

        return await CachedAsync($"rankings|{site}|{area}|{unit}|{windowKind}|{rankExpr}|{limit}", async token =>
        {
            await using var conn = await _dataSource.OpenConnectionAsync(token);

            var rows = await conn.QueryAsync(FleetLatestSql.Rankings(rankExpr),
                new { site, area, unit, windowKind, limit });

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
                // `flags` is payload->'observability_flags' — the only part of the 3 KB
                // message this endpoint ever used.
                observabilityFlags = ReadStringArray((string?)r.flags)
            }).ToList();

            // orderBy echoes back: with a LIMIT, the ordering determines WHICH loops
            // are in the response, so a caller must be able to tell what it got.
            return (object)new { site, area, unit, windowKind, orderBy, count = ranked.Count, loops = ranked };
        }, ct);
    }

    /// <summary>
    /// A11 — loop × gate heatmap. Returns each loop's 17 gate statuses so the UI
    /// can render the grid without issuing one request per loop.
    /// </summary>
    [HttpGet("heatmap")]
    public Task<IActionResult> GetHeatmap(
        [FromQuery] string? site = null,
        // Plant scope (CPM-UX A5). site was already honoured; area/unit complete the
        // hierarchy so a section or unit owner sees only their own loops. All three are
        // optional and narrow independently — the registry stores them denormalised.
        [FromQuery] string? area = null,
        [FromQuery] string? unit = null,
        [FromQuery] string windowKind = "24h",
        // CHG-025: the matrix pages and searches CLIENT-SIDE over this payload, so it must
        // carry every monitored loop in scope. The old default of 100 (cap 300) cut a
        // 171-loop plant after the 100th id and "PIC80140" could not be found. The answer
        // says how many loops exist (`total`) and whether it was cut (`truncated`).
        [FromQuery] int limit = 500,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 2000);
        return CachedAsync($"heatmap|{site}|{area}|{unit}|{windowKind}|{limit}", async token =>
        {
            await using var conn = await _dataSource.OpenConnectionAsync(token);

            var total = await conn.ExecuteScalarAsync<int>("""
                SELECT COUNT(*)::int FROM cpm.loop_registry r
                WHERE (@site::text IS NULL OR r.site = @site)
                  AND (@area::text IS NULL OR r.area = @area)
                  AND (@unit::text IS NULL OR r.unit = @unit)
                  AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
                """, new { site, area, unit });

            var rows = await conn.QueryAsync(FleetLatestSql.Heatmap, new { site, area, unit, windowKind, limit });

            var gateKeys = new[] { "G0","G1","G2","G2r","G3","G4","G5","G6","G7","G8","G9","G10","G11","G12","G13","G14","G15" };
            var cells = rows.Select(r =>
            {
                // `gates` is payload->'gates' ({"G0":"PASS",...}); never the whole message.
                var stored = ParseJson((string?)r.gates);
                var gates = new Dictionary<string, string>();
                foreach (var key in gateKeys) gates[key] = ReadGateStatus(stored, key);
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

            return (object)new { site, area, unit, windowKind, gateKeys, count = cells.Count, total, truncated = cells.Count < total, loops = cells };
        }, ct);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /// <summary>Serve from the fleet cache (single-flight on a miss) and say which it was.</summary>
    private async Task<IActionResult> CachedAsync(string key, Func<CancellationToken, Task<object>> build, CancellationToken ct)
    {
        var (body, hit) = await _cache.GetOrCreateAsync(key, _ttl, build, ct);
        Response.Headers["X-Cpm-Cache"] = hit ? "HIT" : "MISS";
        return Ok(body);
    }

    private static string ReadGateStatus(JsonElement gates, string key)
    {
        if (gates.ValueKind == JsonValueKind.Object
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

    /// <summary>A JSON array fragment (e.g. <c>["VP_MISSING"]</c>) → its string members; anything else → empty.</summary>
    private static string[] ReadStringArray(string? jsonArray)
    {
        var el = ParseJson(jsonArray);
        if (el.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
        return el.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray();
    }
}
