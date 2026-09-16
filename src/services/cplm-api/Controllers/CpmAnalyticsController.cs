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
        string loopId, [FromQuery] string windowKind = "24h", CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        // CHG-023: two index probes (newest real verdict, else newest row) instead of
        // sorting the loop's rows by the expression on every click — see GateReadSql.
        var row = await conn.QueryFirstOrDefaultAsync(Traverse.CplmApi.Data.GateReadSql.LatestForLoop, new { loopId, windowKind });

        if (row is null)
            return NotFound(new { error = $"No gate results for loop '{loopId}' at resolution '{windowKind}'" });

        return Ok(Traverse.CplmApi.Data.GateMatrixProjection.Build(row));
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

        var results = rows.Select(r => (object)Traverse.CplmApi.Data.GateMatrixProjection.Build(r)).ToList();
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
    public IActionResult GetResolutions() => Ok(Services.WindowCatalog.ResolutionsPayload());
}
