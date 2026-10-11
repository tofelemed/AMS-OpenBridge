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
        [FromQuery] string windowKind = "12h",
        CancellationToken ct = default)
        => CachedAsync($"summary|{site}|{area}|{unit}|{windowKind}", async token =>
    {
        await using var conn = await _dataSource.OpenConnectionAsync(token);

        // CHG-059 (SME #23): an unmapped VP / missing peer links is a configuration gap only where it is EXPECTED;
        // a drive has no valve, a valve without a positioner is a plant fact (counted apart, not as gaps).
        var registry = await conn.QueryFirstOrDefaultAsync($"""
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE))::int AS monitored,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE))::int AS with_peer_links,
                   COUNT(*) FILTER (WHERE tags ? 'vp')::int AS with_vp,
                   COUNT(*) FILTER (WHERE NOT (tags ? 'vp') AND {Traverse.CplmApi.Services.Registry.OptionalInputs.VpApplicabilitySql} = 'EXPECTED')::int AS vp_expected_unmapped,
                   COUNT(*) FILTER (WHERE NOT (tags ? 'vp') AND {Traverse.CplmApi.Services.Registry.OptionalInputs.VpApplicabilitySql} = 'NOT_INSTALLED')::int AS vp_not_installed,
                   COUNT(*) FILTER (WHERE NOT (tags ? 'vp') AND {Traverse.CplmApi.Services.Registry.OptionalInputs.VpApplicabilitySql} = 'NOT_APPLICABLE')::int AS vp_not_applicable,
                   COUNT(*) FILTER (WHERE NOT COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE)
                                    AND {Traverse.CplmApi.Services.Registry.OptionalInputs.PeerApplicabilitySql} = 'EXPECTED')::int AS peers_expected_missing,
                   COUNT(*) FILTER (WHERE NOT COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE)
                                    AND {Traverse.CplmApi.Services.Registry.OptionalInputs.PeerApplicabilitySql} <> 'EXPECTED')::int AS peers_not_applicable
            FROM cpm.loop_registry
            WHERE (@site::text IS NULL OR site = @site)
              AND (@area::text IS NULL OR area = @area)
              AND (@unit::text IS NULL OR unit = @unit)
            """, new { site, area, unit });

        // One row per loop: its newest real verdict at this resolution.
        var byDiagnosis = await conn.QueryAsync<(string Diagnosis, int Count)>(
            FleetLatestSql.SummaryByDiagnosis, new { site, area, unit, windowKind });

        // CHG-043 (SME #5/#6): every monitored loop in exactly one operating state.
        var staleSeconds = FleetLatestSql.StaleAfterSeconds(windowKind);
        var byStatus = (await conn.QueryAsync<(string Status, int Count)>(
                FleetLatestSql.SummaryByStatus, new { site, area, unit, windowKind, staleSeconds }))
            .ToDictionary(x => x.Status, x => x.Count);
        int StatusCount(string key) => byStatus.TryGetValue(key, out var n) ? n : 0;

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
            // The operating picture: these add up to loops.monitored.
            statuses = new
            {
                poor = StatusCount("POOR"),
                healthy = StatusCount("HEALTHY"),
                excluded = StatusCount("EXCLUDED"),
                stale = StatusCount("STALE"),
                insufficientData = StatusCount("INSUFFICIENT_DATA"),
                noResult = StatusCount("NO_RESULT"),
                unclassified = StatusCount("UNCLASSIFIED"),
                staleAfterSeconds = staleSeconds
            },
            // Capability caveats, not decoration: a fleet without VP can never
            // report a CONFIRMED diagnosis, and one without peer links cannot
            // distinguish stiction from an upstream disturbance.
            capability = new
            {
                // CHG-059: expected-but-unmapped only (was: every loop without a VP tag, VFD loops included)
                loopsCappedByMissingVp = registry?.vp_expected_unmapped ?? 0,
                loopsWithoutDisturbanceContext = registry?.peers_expected_missing ?? 0,
                vpNotInstalled = registry?.vp_not_installed ?? 0,
                vpNotApplicable = registry?.vp_not_applicable ?? 0,
                peersNotApplicable = registry?.peers_not_applicable ?? 0
            }
        };
    }, ct);

    /// <summary>
    /// A11 — bad-actor ranking. Ordered by confidence within a real diagnosis, so
    /// the loops most likely to reward an engineer's time come first.
    /// </summary>
    /// <summary>Sentinel for orderBy=priority: not an ORDER BY fragment — it selects FleetPrioritySql.</summary>
    private const string PriorityOrder = "__priority__";

    [HttpGet("rankings")]
    public async Task<IActionResult> GetRankings(
        [FromQuery] string? site = null,
        // Plant scope (CPM-UX A5). site was already honoured; area/unit complete the
        // hierarchy so a section or unit owner sees only their own loops. All three are
        // optional and narrow independently — the registry stores them denormalised.
        [FromQuery] string? area = null,
        [FromQuery] string? unit = null,
        [FromQuery] string windowKind = "12h",
        [FromQuery] int limit = 50,
        [FromQuery] string orderBy = "confidence",
        // v2.5 (1H.6): server-side Instrumental health filter (see FleetLatestSql.HealthFilter).
        [FromQuery] string? health = null,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 200);
        var healthWhere = FleetLatestSql.HealthFilter(health);
        if (healthWhere is null)
            return BadRequest(new
            {
                error = $"Unknown health filter '{health}'",
                allowed = new[] { "missing-binding", "stale-collection", "active-affected" }
            });

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
            // CHG-045 (SME #7): the priority queue — its own query (FleetPrioritySql), current
            // findings only, ISA-18.2-style criticality × severity level, shelved loops left out.
            "priority" => PriorityOrder,
            _ => null
        };
        if (rankExpr is null)
            return BadRequest(new
            {
                error = $"Unknown orderBy '{orderBy}'",
                allowed = new[] { "confidence", "error", "mae", "effort", "priority" }
            });

        return await CachedAsync($"rankings|{site}|{area}|{unit}|{windowKind}|{rankExpr}|{limit}|{health}", async token =>
        {
            await using var conn = await _dataSource.OpenConnectionAsync(token);

            var isPriority = rankExpr == PriorityOrder;
            var staleSeconds = FleetLatestSql.StaleAfterSeconds(windowKind);
            var rows = await conn.QueryAsync(
                isPriority ? FleetPrioritySql.Queue(healthWhere) : FleetLatestSql.Rankings(rankExpr, healthWhere),
                new { site, area, unit, windowKind, limit, staleSeconds });
            int? shelvedCount = isPriority
                ? await conn.ExecuteScalarAsync<int>(FleetPrioritySql.ShelvedCount(healthWhere),
                    new { site, area, unit, windowKind, staleSeconds })
                : null;

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
                observabilityFlags = ReadStringArray((string?)r.flags),
                // v2.5 (1E.2): the fusion v2 leading hypothesis (STICTION | OSCILLATION_TUNING |
                // EXTERNAL_DISTURBANCE | EXCESSIVE_EFFORT | NONE); null on pre-v2.5 rows so the
                // UI's case vocabulary never has to string-match a diagnosis again.
                leadingHypothesis = (string?)r.leading_hypothesis,
                // CHG-045: the ranking reason (priority order only; null on the other orders).
                priority = isPriority ? FleetPrioritySql.PriorityLabel((int?)r.priority) : null,
                episodeOpenedAt = isPriority ? (DateTime?)r.episode_opened_at : null,
                episodeWindowCount = isPriority ? (int?)r.episode_window_count : null,
                ackState = isPriority ? (string?)r.ack_state : null
            }).ToList();

            // orderBy echoes back: with a LIMIT, the ordering determines WHICH loops
            // are in the response, so a caller must be able to tell what it got.
            return (object)new { site, area, unit, windowKind, orderBy, health, count = ranked.Count, shelvedCount, loops = ranked };
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
        [FromQuery] string windowKind = "12h",
        // CHG-025: the matrix pages and searches CLIENT-SIDE over this payload, so it must
        // carry every monitored loop in scope. The old default of 100 (cap 300) cut a
        // 171-loop plant after the 100th id and "PIC80140" could not be found. The answer
        // says how many loops exist (`total`) and whether it was cut (`truncated`).
        [FromQuery] int limit = 500,
        // CHG-066: the same server-side health filter as the rankings, so the matrix and the tiles agree
        [FromQuery] string? health = null,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 2000);
        var healthWhere = FleetLatestSql.HealthFilter(health);
        if (healthWhere is null)
            return Task.FromResult<IActionResult>(BadRequest(new { error = $"Unknown health filter '{health}'", allowed = new[] { "missing-binding", "stale-collection", "active-affected" } }));
        return CachedAsync($"heatmap|{site}|{area}|{unit}|{windowKind}|{limit}|{health}", async token =>
        {
            await using var conn = await _dataSource.OpenConnectionAsync(token);

            // CHG-066 fix: interpolated — the health clause is spliced in (it references r = cpm.loop_registry only)
            var total = await conn.ExecuteScalarAsync<int>($"""
                SELECT COUNT(*)::int FROM cpm.loop_registry r
                WHERE (@site::text IS NULL OR r.site = @site)
                  AND (@area::text IS NULL OR r.area = @area)
                  AND (@unit::text IS NULL OR r.unit = @unit)
                  AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
                {healthWhere}
                """, new { site, area, unit });

            var rows = await conn.QueryAsync(FleetLatestSql.HeatmapFiltered(healthWhere), new { site, area, unit, windowKind, limit });

            var gateKeys = new[] { "G0","G1","G2","G2r","G3","G4","G5","G6","G7","G8","G9","G10","G11","G12","G13","G14","G15" };
            var cells = rows.Select(r =>
            {
                // `gates` is payload->'gates' ({"G0":"PASS",...}); never the whole message.
                var stored = ParseJson((string?)r.gates);
                var gates = new Dictionary<string, string>();
                foreach (var key in gateKeys) gates[key] = ReadGateStatus(stored, key);
                var runIds = ParseJson((string?)r.method_run_ids);
                var methodRunIds = new Dictionary<string, string>();
                if (runIds.ValueKind == JsonValueKind.Object)
                    foreach (var p in runIds.EnumerateObject()) if (p.Value.ValueKind == JsonValueKind.String) methodRunIds[p.Name] = p.Value.GetString()!;
                DateTime? vEnd = r.v_window_end is DateTime vd ? DateTime.SpecifyKind(vd, DateTimeKind.Utc) : (DateTime?)null;
                return new
                {
                    loopId = r.loop_id,
                    displayName = r.display_name,
                    loopType = r.loop_type,
                    windowEnd = r.window_end,
                    diagnosis = (string?)r.diagnosis ?? "NOT_EVALUATED",
                    confidence = r.confidence,
                    insufficientEvidenceReason = (string?)r.insufficient_reason,
                    observabilityFlags = ReadStringArray((string?)r.flags),
                    gates,
                    // 2026-09-17 audit F4: the newest window's run ids (the workbench launcher) and the last real
                    // verdict when it is an OLDER window than the one shown - stated with its age, never as current
                    methodRunIds,
                    lastVerdict = vEnd is null ? null : new
                    {
                        windowEnd = r.v_window_end, diagnosis = (string?)r.v_diagnosis, confidence = r.v_confidence,
                        ageMs = (long)(DateTime.UtcNow - vEnd.Value).TotalMilliseconds,
                    },
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
