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
            config.GetValue("Cpm:Kpi:G0BadQualityMax", d.G0BadQualityMax),
            config.GetValue("Cpm:Kpi:WindowKind", d.WindowKind),
            config.GetValue("Cpm:Kpi:ManualModeMin", d.ManualModeMin));
    }

    /// <summary>CHG-089: the thresholds for the requested fused window (12h default, 24h on request); null = not a fused window.</summary>
    private KpiThresholds? For(string? windowKind)
    {
        var w = string.IsNullOrWhiteSpace(windowKind) ? _t.WindowKind : windowKind.Trim().ToLowerInvariant();
        return KpiThresholds.Windows.Contains(w) ? _t with { WindowKind = w } : null;
    }

    private BadRequestObjectResult BadWindow(string? windowKind) =>
        BadRequest(new { error = $"Unknown windowKind '{windowKind}'", allowed = KpiThresholds.Windows });

    [HttpGet("")]
    public async Task<IActionResult> GetKpis([FromQuery] string? site = null, [FromQuery] string? area = null,
        [FromQuery] string? unit = null, [FromQuery] string? windowKind = null, CancellationToken ct = default)
    {
        if (For(windowKind) is not { } t) return BadWindow(windowKind);
        var (loops, computedAt, hit) = await ClassifiedAsync(t, site, area, unit, ct);
        Response.Headers["X-Cpm-Cache"] = hit ? "HIT" : "MISS";
        // the same classification as it stood 24 h earlier: the "change since yesterday" on each card
        var (before, beforeAt, _) = await ClassifiedAsync(t, site, area, unit, ct, TimeSpan.FromHours(24));
        int Count(string k, string? reason = null) => loops.Count(l => FleetKpiClassifier.Matches(l, k, reason));
        return Ok(new
        {
            basis = Basis(t),
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
            kpis = FleetKpiClassifier.Figures(loops, t),
            // CHG-093 (SME review 2 #10/#11): the Performance headline over the whole scope, with its basis
            performance = FleetKpiPerformance.Summarise(loops),
            previous = new
            {
                asOf = beforeAt,
                monitored = before.Count,
                kpis = FleetKpiClassifier.Figures(before, t).Select(f => new { f.Key, f.Count, f.Denominator }),
            },
        });
    }

    [HttpGet("loops")]
    public async Task<IActionResult> GetKpiLoops([FromQuery] string kpi, [FromQuery] string? reason = null,
        [FromQuery] string? q = null, [FromQuery] string? site = null, [FromQuery] string? area = null,
        [FromQuery] string? unit = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        // KPI Phase 5: a trend day's exact as-of instant (from GET trend) — the list of loops that day's point counted
        [FromQuery] DateTimeOffset? asOf = null, [FromQuery] string? windowKind = null, CancellationToken ct = default)
    {
        if (For(windowKind) is not { } t) return BadWindow(windowKind);
        kpi = (kpi ?? "").Trim().ToLowerInvariant();
        if (!FleetKpiClassifier.Keys.Contains(kpi))
            return BadRequest(new { error = $"Unknown kpi '{kpi}'", allowed = FleetKpiClassifier.Keys });
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        if (asOf is { } a && (a > DateTimeOffset.UtcNow.AddMinutes(1) || a < DateTimeOffset.UtcNow.AddDays(-MaxTrendDays - 1)))
            return BadRequest(new { error = $"asOf must lie within the last {MaxTrendDays} days" });
        var (loops, computedAt, hit) = asOf is { } at ? await ClassifiedAtAsync(t, site, area, unit, at, ct) : await ClassifiedAsync(t, site, area, unit, ct);
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
            .Select(l => FleetKpiRows.Row(l, kpi, t)).ToList();
        return Ok(new
        {
            kpi, reason, basis = Basis(t), computedAt, asOf,
            figure = FleetKpiClassifier.Figures(loops, t).FirstOrDefault(f => f.Key == kpi),
            total, matched = matched.Count, page, pageSize, rows,
        });
    }

    /// <summary>Days of history a trend may cover: the plant keeps the gate results 14 days (cpm-10b retention).</summary>
    private const int MaxTrendDays = 14;

    /// <summary>
    /// KPI Phase 5: every Overview figure as it stood at the same time of day on each of the last `days` days — the same
    /// classification, applied to the rows that existed at that instant. Each point carries its exact `asOf`, which GET loops
    /// accepts, so a day's point and that day's list of loops come from one classification (count = list, as for the cards).
    /// Past days sit at the anchor rounded down to 15 min (the engine's evaluation step), so they are cached between
    /// evaluations; today's point is the live snapshot of the cards (`isNow`; its list is GET loops without asOf).
    /// </summary>
    [HttpGet("trend")]
    public async Task<IActionResult> GetTrend([FromQuery] int days = MaxTrendDays, [FromQuery] string? site = null,
        [FromQuery] string? area = null, [FromQuery] string? unit = null, [FromQuery] string? windowKind = null, CancellationToken ct = default)
    {
        if (For(windowKind) is not { } t) return BadWindow(windowKind);
        days = Math.Clamp(days, 2, MaxTrendDays);
        var now = DateTimeOffset.UtcNow;
        var anchor = new DateTimeOffset(now.Ticks - now.Ticks % TimeSpan.FromMinutes(15).Ticks, TimeSpan.Zero);
        var points = new object[days];
        using var gate = new SemaphoreSlim(4);    // four classifications at a time: bounded load on the shared database
        await Task.WhenAll(Enumerable.Range(0, days).Select(async k =>
        {
            await gate.WaitAsync(ct);
            try
            {
                // today = the live snapshot the cards use (so today's bar equals the card); past days at the 15-min slot
                var (loops, asOf, _) = k == 0
                    ? await ClassifiedAsync(t, site, area, unit, ct)
                    : await ClassifiedAtAsync(t, site, area, unit, anchor.AddDays(-k), ct);
                points[days - 1 - k] = new
                {
                    asOf, isNow = k == 0, monitored = loops.Count,
                    assessed = loops.Count(l => l.State == KpiState.Assessed),
                    kpis = FleetKpiClassifier.Figures(loops, t).Select(f => new { f.Key, f.Count, f.Denominator }),
                };
            }
            finally { gate.Release(); }
        }));
        return Ok(new { basis = Basis(t), days, anchor, points });
    }

    private static object Basis(KpiThresholds t) => new
    {
        windowKind = t.WindowKind, windows = KpiThresholds.Windows, freshSeconds = t.FreshSeconds, normalModeMin = t.NormalModeMin,
        manualModeMin = t.ManualModeMin,
        saturationMax = t.SaturationMax, g0CompletenessMin = t.G0CompletenessMin, g0BadQualityMax = t.G0BadQualityMax,
        findingBands = new[] { "SUSPECTED", "CONFIRMED" }, symptomBands = new[] { "DETECTED", "CLASSIFIED" },
        noFaultCodes = new[] { "NO_CALL", "INSUFFICIENT_EVIDENCE" },
        acceptableNeeds = new[] { "NORMAL_MODE", "NOT_SATURATED", "G3_PASS", "G4_NOT_STRONG" },   // CHG-093
        reference = "kpi_calculation_logic/KPI-LOGIC.md",
    };

    /// <summary>One read + one classification per scope, cached like the other fleet reads.</summary>
    private async Task<(IReadOnlyList<KpiLoop> Loops, DateTimeOffset ComputedAt, bool Hit)> ClassifiedAsync(
        KpiThresholds t, string? site, string? area, string? unit, CancellationToken ct, TimeSpan? ago = null)
    {
        var back = ago ?? TimeSpan.Zero;
        // the key carries t (its WindowKind included): the 12 h and 24 h pictures are cached apart
        var (body, hit) = await _cache.GetOrCreateAsync<Snapshot>($"kpis|{site}|{area}|{unit}|{t}|{back.TotalHours}", _ttl, async token =>
        {
            var now = DateTimeOffset.UtcNow - back;   // classify "as of" that instant, from the rows that existed then
            await using var conn = await _db.OpenConnectionAsync(token);
            var raw = await conn.QueryAsync(new CommandDefinition(FleetKpiSql.Rows,
                new { site, area, unit, windowKind = t.WindowKind, asOf = now }, cancellationToken: token));
            IReadOnlyList<KpiLoop> loops = raw.Select(r => FleetKpiClassifier.Classify((KpiLoopRow)FleetKpiRows.FromDb(r), t, now)).ToList();
            return new Snapshot(loops, now);
        }, ct);
        return (body.Loops, body.ComputedAt, hit);
    }

    /// <summary>The classification as of an exact instant (a trend day). Past instants change little, so they are cached
    /// for 10 min; the key is the instant itself, so the trend point and its drill-down share one snapshot.</summary>
    private async Task<(IReadOnlyList<KpiLoop> Loops, DateTimeOffset ComputedAt, bool Hit)> ClassifiedAtAsync(
        KpiThresholds t, string? site, string? area, string? unit, DateTimeOffset asOf, CancellationToken ct)
    {
        var at = asOf.ToUniversalTime();
        var (body, hit) = await _cache.GetOrCreateAsync<Snapshot>($"kpis-at|{site}|{area}|{unit}|{t}|{at:O}", TimeSpan.FromMinutes(10), async token =>
        {
            await using var conn = await _db.OpenConnectionAsync(token);
            var raw = await conn.QueryAsync(new CommandDefinition(FleetKpiSql.Rows,
                new { site, area, unit, windowKind = t.WindowKind, asOf = at }, cancellationToken: token));
            IReadOnlyList<KpiLoop> loops = raw.Select(r => FleetKpiClassifier.Classify((KpiLoopRow)FleetKpiRows.FromDb(r), t, at)).ToList();
            return new Snapshot(loops, at);
        }, ct);
        return (body.Loops, body.ComputedAt, hit);
    }

    private sealed record Snapshot(IReadOnlyList<KpiLoop> Loops, DateTimeOffset ComputedAt);
}
