// KPI Phase 1 (kpi_calculation_logic/KPI-LOGIC.md): the Overview KPIs and their proof.
//   GET fleet/kpis        — every figure (count, denominator, rule) + the state partition, from ONE classification
//   GET fleet/kpis/loops  — the drill-down: the loops behind one figure, each with the values that decided it
// Both read FleetKpiSql once per scope and classify with FleetKpiClassifier, through the fleet cache — so a tile's count is
// always the length of its list (tested).
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services.Kpi;

namespace Traverse.CplmApi.Controllers;

[ApiController]
[Route("api/v1/cpm/fleet/kpis")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmFleetKpiController : ControllerBase
{
    private readonly NpgsqlDataSource _db;
    private readonly FleetReadCache _cache;
    private readonly TimeSpan _ttl;
    private readonly KpiThresholds _t;

    public CpmFleetKpiController([FromKeyedServices("cplm")] NpgsqlDataSource db, FleetReadCache cache, IConfiguration config)
    {
        _db = db;
        _cache = cache;
        _ttl = TimeSpan.FromSeconds(config.GetValue("Cpm:FleetCacheSeconds", 15));
        var d = new KpiThresholds();
        _t = new KpiThresholds(
            config.GetValue("Cpm:Kpi:FreshSeconds", d.FreshSeconds),
            config.GetValue("Cpm:Kpi:NormalModeMin", d.NormalModeMin),
            config.GetValue("Cpm:Kpi:SaturationMax", d.SaturationMax),
            config.GetValue("Cpm:Kpi:G0CompletenessMin", d.G0CompletenessMin),
            config.GetValue("Cpm:Kpi:G0BadQualityMax", d.G0BadQualityMax));
    }

    [HttpGet("")]
    public async Task<IActionResult> GetKpis([FromQuery] string? site = null, [FromQuery] string? area = null,
        [FromQuery] string? unit = null, CancellationToken ct = default)
    {
        var (loops, computedAt, hit) = await ClassifiedAsync(site, area, unit, ct);
        Response.Headers["X-Cpm-Cache"] = hit ? "HIT" : "MISS";
        // the same classification as it stood 24 h earlier: the "change since yesterday" on each card
        var (before, beforeAt, _) = await ClassifiedAsync(site, area, unit, ct, TimeSpan.FromHours(24));
        int Count(string k, string? reason = null) => loops.Count(l => FleetKpiClassifier.Matches(l, k, reason));
        return Ok(new
        {
            basis = Basis(),
            computedAt,
            monitored = loops.Count,
            states = new
            {
                assessed = Count("assessed"), notAssessable = Count("not-assessable"),
                stale = Count("stale"), neverEvaluated = Count("never-evaluated"),
            },
            notAssessableByReason = loops.Where(l => l.State == KpiState.NotAssessable)
                .GroupBy(l => l.Reason ?? "UNKNOWN").OrderByDescending(g => g.Count())
                .Select(g => new { reason = g.Key, count = g.Count() }),
            assessed = new
            {
                acceptable = Count("acceptable"), noFaultLimited = Count("no-fault-limited"), finding = Count("finding"),
                symptomOnly = Count("symptom"), unrecognised = loops.Count(l => l.Outcome == KpiOutcome.Unrecognised),
            },
            kpis = FleetKpiClassifier.Figures(loops, _t),
            previous = new
            {
                asOf = beforeAt,
                monitored = before.Count,
                kpis = FleetKpiClassifier.Figures(before, _t).Select(f => new { f.Key, f.Count, f.Denominator }),
            },
        });
    }

    [HttpGet("loops")]
    public async Task<IActionResult> GetKpiLoops([FromQuery] string kpi, [FromQuery] string? reason = null,
        [FromQuery] string? q = null, [FromQuery] string? site = null, [FromQuery] string? area = null,
        [FromQuery] string? unit = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        kpi = (kpi ?? "").Trim().ToLowerInvariant();
        if (!FleetKpiClassifier.Keys.Contains(kpi))
            return BadRequest(new { error = $"Unknown kpi '{kpi}'", allowed = FleetKpiClassifier.Keys });
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var (loops, computedAt, hit) = await ClassifiedAsync(site, area, unit, ct);
        Response.Headers["X-Cpm-Cache"] = hit ? "HIT" : "MISS";

        var matched = loops.Where(l => FleetKpiClassifier.Matches(l, kpi, reason)).ToList();
        var total = matched.Count;    // == the tile's count for the same scope (no search applied)
        if (!string.IsNullOrWhiteSpace(q))
        {
            var s = q.Trim();
            matched = matched.Where(l => l.Row.LoopId.Contains(s, StringComparison.OrdinalIgnoreCase)
                || (l.Row.DisplayName ?? "").Contains(s, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        var rows = FleetKpiRows.Order(matched, kpi).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(l => FleetKpiRows.Row(l, kpi, _t)).ToList();
        return Ok(new
        {
            kpi, reason, basis = Basis(), computedAt,
            figure = FleetKpiClassifier.Figures(loops, _t).FirstOrDefault(f => f.Key == kpi),
            total, matched = matched.Count, page, pageSize, rows,
        });
    }

    private object Basis() => new
    {
        windowKind = _t.WindowKind, freshSeconds = _t.FreshSeconds, normalModeMin = _t.NormalModeMin,
        saturationMax = _t.SaturationMax, g0CompletenessMin = _t.G0CompletenessMin, g0BadQualityMax = _t.G0BadQualityMax,
        findingBands = new[] { "SUSPECTED", "CONFIRMED" }, symptomBands = new[] { "DETECTED", "CLASSIFIED" },
        noFaultCodes = new[] { "NO_CALL", "INSUFFICIENT_EVIDENCE" },
        reference = "kpi_calculation_logic/KPI-LOGIC.md",
    };

    /// <summary>One read + one classification per scope, cached like the other fleet reads.</summary>
    private async Task<(IReadOnlyList<KpiLoop> Loops, DateTimeOffset ComputedAt, bool Hit)> ClassifiedAsync(
        string? site, string? area, string? unit, CancellationToken ct, TimeSpan? ago = null)
    {
        var back = ago ?? TimeSpan.Zero;
        var (body, hit) = await _cache.GetOrCreateAsync<Snapshot>($"kpis|{site}|{area}|{unit}|{_t}|{back.TotalHours}", _ttl, async token =>
        {
            var now = DateTimeOffset.UtcNow - back;   // classify "as of" that instant, from the rows that existed then
            await using var conn = await _db.OpenConnectionAsync(token);
            var raw = await conn.QueryAsync(new CommandDefinition(FleetKpiSql.Rows,
                new { site, area, unit, windowKind = _t.WindowKind, asOf = now }, cancellationToken: token));
            IReadOnlyList<KpiLoop> loops = raw.Select(r => FleetKpiClassifier.Classify((KpiLoopRow)FleetKpiRows.FromDb(r), _t, now)).ToList();
            return new Snapshot(loops, now);
        }, ct);
        return (body.Loops, body.ComputedAt, hit);
    }

    private sealed record Snapshot(IReadOnlyList<KpiLoop> Loops, DateTimeOffset ComputedAt);
}
