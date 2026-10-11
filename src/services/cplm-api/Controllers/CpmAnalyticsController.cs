// Extraction Phase 3 COPY of AMS.Api Controllers/V1/CpmAnalyticsController.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
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
    // v2.5 Task 0.4: gate and window catalogues moved to Services/GateCatalog and
    // Services/WindowCatalog so /capabilities, /resolutions and the tests share one copy.
    // v2.5 Task 1E.2: the row -> matrix projection moved to Data/GateMatrixProjection (pure, tested).

    private static readonly string[] ShortWindows = Services.WindowCatalog.ShortWindows;
    private static readonly string[] LongWindows = Services.WindowCatalog.LongWindows;

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
        string loopId, [FromQuery] string windowKind = "12h", [FromQuery] string? prefer = null, CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        // 2026-09-17 audit F4: the matrix served is the loop's NEWEST evaluated window (whatever its
        // diagnosis), never a weeks-old verdict presented as current; the newest real verdict rides
        // beside it as `lastVerdict` (null when the served row IS the verdict). `prefer=verdict` keeps
        // the pre-audit choice for a caller that wants the verdict row itself, with `newestWindow` beside it.
        var newest = await conn.QueryFirstOrDefaultAsync(Traverse.CplmApi.Data.GateReadSql.NewestForLoop, new { loopId, windowKind });
        if (newest is null)
            return NotFound(new { error = $"No gate results for loop '{loopId}' at resolution '{windowKind}'" });
        var verdict = await conn.QueryFirstOrDefaultAsync(Traverse.CplmApi.Data.GateReadSql.NewestVerdictForLoop, new { loopId, windowKind });
        var now = DateTime.UtcNow;
        var preferVerdict = string.Equals(prefer, "verdict", StringComparison.OrdinalIgnoreCase) && verdict is not null;
        var served = preferVerdict ? verdict! : newest;
        var matrix = Traverse.CplmApi.Data.GateMatrixProjection.Build(served);
        var sameRow = verdict is not null && (DateTime?)verdict.window_end == (DateTime?)newest.window_end && (DateTime?)verdict.created_at == (DateTime?)newest.created_at;
        matrix["served"] = preferVerdict ? "verdict" : "newest";
        matrix["lastVerdict"] = verdict is null || sameRow || preferVerdict ? null : Traverse.CplmApi.Data.GateMatrixProjection.WindowReference(verdict, now);
        matrix["newestWindow"] = preferVerdict && !sameRow ? Traverse.CplmApi.Data.GateMatrixProjection.WindowReference(newest, now) : null;
        return Ok(matrix);
    }

    /// <summary>A3 (history) — gate verdicts over a time range, newest first.</summary>
    [HttpGet("loops/{loopId}/gates")]
    public async Task<IActionResult> GetGateHistory(
        string loopId,
        [FromQuery] string windowKind = "12h",
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        [FromQuery] int limit = 100,
        [FromQuery] bool includeInsufficient = false,
        [FromQuery] string? projection = null,
        // CHG-066: LIVE results only by default (like gates/latest); ANY also returns REPLAY / SHADOW rows
        [FromQuery] string purpose = "LIVE",
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        purpose = string.IsNullOrWhiteSpace(purpose) ? "LIVE" : purpose.Trim().ToUpperInvariant();
        // v2.5 workbench: `projection=summary` serves the picker's ~0.5 KB row instead of the ~7.5 KB matrix
        var summary = string.Equals(projection, "summary", StringComparison.OrdinalIgnoreCase);
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("""
            SELECT loop_id, window_kind, window_start, window_end, sample_count,
                   diagnosis, severity, confidence, payload::text AS payload, created_at
            FROM analytics.cplm_gate_results
            WHERE lower(loop_id) = lower(@loopId) AND window_kind = @windowKind
              AND (@from::timestamptz IS NULL OR window_end >= @from::timestamptz)
              AND (@to::timestamptz   IS NULL OR window_end <= @to::timestamptz)
              AND (@includeInsufficient OR diagnosis IS DISTINCT FROM 'INSUFFICIENT_DATA')
              AND (@purpose = 'ANY' OR purpose = @purpose)
            ORDER BY window_end DESC NULLS LAST, created_at DESC
            LIMIT @limit
            """, new { loopId, windowKind, from, to, limit, includeInsufficient, purpose });

        var results = rows.Select(r => summary
            ? (object)Traverse.CplmApi.Data.GateMatrixProjection.Summary(r)
            : (object)Traverse.CplmApi.Data.GateMatrixProjection.Build(r)).ToList();
        return Ok(new { loopId, windowKind, count = results.Count, projection = summary ? "summary" : "full", windows = results });
    }

    /// <summary>
    /// A4 — KPI stream by resolution. Routes to the short-feature or
    /// long-diagnostics table depending on the requested window; they carry
    /// genuinely different metrics, so the response names which tier answered.
    /// </summary>
    [HttpGet("loops/{loopId}/kpis")]
    public async Task<IActionResult> GetKpiStream(
        string loopId,
        [FromQuery] string resolution = "12h",
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
    public IActionResult GetResolutions() => Ok(Services.WindowCatalog.ResolutionsPayload());
}
