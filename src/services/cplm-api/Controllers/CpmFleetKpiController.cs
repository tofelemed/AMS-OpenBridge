// KPI Phase 1 (kpi_calculation_logic/KPI-LOGIC.md): the Overview KPIs and their proof.
//   GET fleet/kpis        — every figure (count, denominator, rule) + the state partition, from ONE classification
//   GET fleet/kpis/loops  — the drill-down: the loops behind one figure, each with the values that decided it
// Both read FleetKpiSql once per scope and classify with FleetKpiClassifier, through the fleet cache — so a tile's count is
// always the length of its list (tested).
// CHG-102 Phase 6: ended plant days (PlantClock: Cpm:PlantTimeZone, local | UTC | IR) are read from analytics.cplm_kpi_daily
// (FleetKpiDaily, 3 years) - the trend's past points and loops?asOf=<day end> - so the history outlives the 14-day gate
// results; today stays the live snapshot.
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
    private readonly PlantClock _clock;

    public CpmFleetKpiController([FromKeyedServices("cplm")] NpgsqlDataSource db, FleetReadCache cache, IConfiguration config,
        PlantClock clock)
    {
        _db = db;
        _cache = cache;
        _clock = clock;
        _ttl = TimeSpan.FromSeconds(config.GetValue("Cpm:FleetCacheSeconds", 15));
        _t = FleetKpiSnapshot.Thresholds(config);   // the daily job reads the same Cpm:Kpi:* thresholds
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
        IReadOnlyList<KpiLoop> loops;
        DateTimeOffset computedAt;
        bool hit;
        var source = "live";
        // CHG-102: a stored plant day (asOf = the day end it was stored with) is read from the daily table with the thresholds
        // it was classified with; inside the gate-result window any other instant is classified live, as before
        if (asOf is { } da && await StoredDayAsync(t.WindowKind, da, site, area, unit, ct) is { } stored)
        {
            (loops, computedAt, hit, t, source) = (stored.Value.Loops, stored.Value.AsOf, stored.Hit, stored.Value.Thresholds, "daily");
        }
        else if (asOf is { } at)
        {
            if (at < DateTimeOffset.UtcNow.AddDays(-LiveDays - 1))
                return BadRequest(new { error = $"asOf older than {LiveDays} days must be the end of a stored plant day (the asOf of a GET trend point)" });
            (loops, computedAt, hit) = await ClassifiedAtAsync(t, site, area, unit, at, ct);
        }
        else (loops, computedAt, hit) = await ClassifiedAsync(t, site, area, unit, ct);
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
            kpi, reason, basis = Basis(t), computedAt, asOf, source, plantDay = _clock.Describe(DateTimeOffset.UtcNow),
            figure = FleetKpiClassifier.Figures(loops, t).FirstOrDefault(f => f.Key == kpi),
            total, matched = matched.Count, page, pageSize, rows,
        });
    }

    /// <summary>CHG-102: days of history a trend may cover - the daily table keeps 3 years (retention_policy KPI_DAILY).</summary>
    private const int MaxTrendDays = 1095;

    /// <summary>Days the gate results are kept (cpm-10b retention): inside them a day missing from the table is classified live.</summary>
    private const int LiveDays = 14;

    /// <summary>
    /// KPI Phase 5 / CHG-102 Phase 6: every Overview figure on each of the last `days` days, one point per plant day
    /// (PlantClock) as it stood at the day's end (the next plant midnight; a day stored under an earlier zone keeps its own
    /// end): read from analytics.cplm_kpi_daily when the day is stored
    /// (`source` "daily"), else - inside the 14-day gate-result window - classified live at the same instant ("live"), else an
    /// empty point ("none", drawn as "no data"). Each point carries its exact `asOf`, which GET loops accepts, so a day's point
    /// and that day's list of loops come from one classification (count = list, as for the cards). Today's point is the live
    /// snapshot of the cards (`isNow`; its list is GET loops without asOf).
    /// </summary>
    [HttpGet("trend")]
    public async Task<IActionResult> GetTrend([FromQuery] int days = LiveDays, [FromQuery] string? site = null,
        [FromQuery] string? area = null, [FromQuery] string? unit = null, [FromQuery] string? windowKind = null, CancellationToken ct = default)
    {
        if (For(windowKind) is not { } t) return BadWindow(windowKind);
        days = Math.Clamp(days, 2, MaxTrendDays);
        var now = DateTimeOffset.UtcNow;
        var today = _clock.DayOf(now);
        var from = today.AddDays(-(days - 1));
        var (stored, _) = await _cache.GetOrCreateAsync($"kpis-daily|{site}|{area}|{unit}|{t}|{_clock.ZoneId}|{from:O}|{today:O}", TimeSpan.FromMinutes(10),
            token => StoredPointsAsync(t, from, today.AddDays(-1), site, area, unit, token), ct);
        var points = new object[days];
        using var gate = new SemaphoreSlim(4);    // four live classifications at a time: bounded load on the shared database
        await Task.WhenAll(Enumerable.Range(0, days).Select(async k =>
        {
            var day = today.AddDays(-k);
            var asOf = _clock.DayEnd(day);
            if (k > 0 && stored.TryGetValue(day, out var p))
            {
                points[days - 1 - k] = Point(p.AsOf, day, "daily", p.Monitored, p.Assessed, p.Kpis);
                return;
            }
            if (k > 0 && asOf < now.AddDays(-LiveDays))
            {
                points[days - 1 - k] = Point(asOf, day, "none", 0, 0, Array.Empty<TrendFigure>());
                return;
            }
            await gate.WaitAsync(ct);
            try
            {
                // today = the live snapshot the cards use (so today's bar equals the card); a past day at its end
                var (loops, at, _) = k == 0 ? await ClassifiedAsync(t, site, area, unit, ct) : await ClassifiedAtAsync(t, site, area, unit, asOf, ct);
                var kpis = Figures(loops, t);
                points[days - 1 - k] = k == 0
                    ? new { asOf = at, day = (string?)day.ToString("yyyy-MM-dd"), isNow = true, source = "live", monitored = loops.Count, assessed = Assessed(loops), kpis }
                    : Point(asOf, day, "live", loops.Count, Assessed(loops), kpis);
            }
            finally { gate.Release(); }
        }));
        return Ok(new { basis = Basis(t), days, anchor = _clock.DayEnd(today.AddDays(-1)), plantDay = _clock.Describe(now), points });
    }

    private static int Assessed(IEnumerable<KpiLoop> loops) => loops.Count(l => l.State == KpiState.Assessed);

    private static IReadOnlyList<TrendFigure> Figures(IReadOnlyList<KpiLoop> loops, KpiThresholds t) =>
        FleetKpiClassifier.Figures(loops, t).Select(f => new TrendFigure(f.Key, f.Count, f.Denominator)).ToList();

    private static object Point(DateTimeOffset asOf, DateOnly day, string source, int monitored, int assessed, IReadOnlyList<TrendFigure> kpis) =>
        new { asOf, day = day.ToString("yyyy-MM-dd"), isNow = false, source, monitored, assessed, kpis };

    private sealed record TrendFigure(string Key, int Count, int Denominator);
    private sealed record TrendPoint(DateTimeOffset AsOf, int Monitored, int Assessed, IReadOnlyList<TrendFigure> Kpis);

    /// <summary>The stored days in [from, to], one point each (a stored day with no loop in scope is 0 monitored, not missing).</summary>
    private async Task<Dictionary<DateOnly, TrendPoint>> StoredPointsAsync(KpiThresholds t, DateOnly from, DateOnly to,
        string? site, string? area, string? unit, CancellationToken ct)
    {
        var result = new Dictionary<DateOnly, TrendPoint>();
        if (to < from) return result;
        var runs = (await FleetKpiDaily.RunsAsync(_db, from, to, ct)).Where(r => r.WindowKind == t.WindowKind).ToList();
        if (runs.Count == 0) return result;
        var flags = await FleetKpiDaily.ReadFlagsAsync(_db, t.WindowKind, from, to, site, area, unit, ct);
        foreach (var r in runs)
        {
            var day = DateOnly.ParseExact(r.Day, "yyyy-MM-dd");
            IReadOnlyList<KpiLoop> loops = flags.TryGetValue(day, out var l) ? l : new List<KpiLoop>();
            var asOf = new DateTimeOffset(DateTime.SpecifyKind(r.AsOf, DateTimeKind.Utc));
            result[day] = new TrendPoint(asOf, loops.Count, Assessed(loops), Figures(loops, t));
        }
        return result;
    }

    /// <summary>The stored day ending exactly at asOf in full (the drill-down of a trend point), cached like the other past
    /// instants; null = no stored day ends there.</summary>
    private async Task<(FleetKpiDaily.StoredDay Value, bool Hit)?> StoredDayAsync(string windowKind, DateTimeOffset asOf,
        string? site, string? area, string? unit, CancellationToken ct)
    {
        var at = asOf.ToUniversalTime();
        var (body, hit) = await _cache.GetOrCreateAsync($"kpis-day|{site}|{area}|{unit}|{windowKind}|{at:O}", TimeSpan.FromMinutes(10),
            async token => new[] { await FleetKpiDaily.ReadDayAtAsync(_db, windowKind, at, site, area, unit, token) }, ct);
        return body[0] is { } v ? (v, hit) : null;
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
            return new Snapshot(await FleetKpiSnapshot.ClassifyAsync(_db, t, site, area, unit, now, token), now);
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
            return new Snapshot(await FleetKpiSnapshot.ClassifyAsync(_db, t, site, area, unit, at, token), at);
        }, ct);
        return (body.Loops, body.ComputedAt, hit);
    }

    private sealed record Snapshot(IReadOnlyList<KpiLoop> Loops, DateTimeOffset ComputedAt);
}
