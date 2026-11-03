// CHG-102 Phase 6: three years of Overview-KPI history with the loops behind every point (analytics.cplm_kpi_daily).
// Plant day = the UTC calendar day (no plant time-zone setting exists in cplm-api or the engine; the 12 h / 24 h fused
// windows are UTC-aligned, so the 24 h window ending at 00:00 UTC is the day's boundary verdict). A day is stored as
// FleetKpiSnapshot.ClassifyAsync(as of the day end = next 00:00 UTC) - the same call GET fleet/kpis/loops?asOf makes - for
// the whole fleet, per fused window; scope filters (site / area / unit) apply on read to the registry scope stored that day.
using System.Text.Json;
using Dapper;
using Npgsql;
using Traverse.CplmApi.Data;

namespace Traverse.CplmApi.Services.Kpi;

public static class FleetKpiDaily
{
    /// <summary>A row of analytics.cplm_kpi_daily_run (Day = yyyy-MM-dd).</summary>
    public sealed class DailyRun
    {
        public string Day { get; set; } = "";
        public string WindowKind { get; set; } = "";
        public DateTime AsOf { get; set; }
        public int RuleVersion { get; set; }
        public int Loops { get; set; }
        public string? Thresholds { get; set; }
    }

    public sealed record StoredDay(DateOnly Day, DateTimeOffset AsOf, int RuleVersion, KpiThresholds Thresholds, IReadOnlyList<KpiLoop> Loops);

    public sealed record RunResult(int Computed, int Recomputed, int Pruned, bool TableMissing);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>The instant a plant day is classified at: the day's end (00:00 UTC of the next day).</summary>
    public static DateTimeOffset DayEnd(DateOnly day) => new(day.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

    /// <summary>The plant day whose end is exactly <paramref name="asOf"/>, or null when it is not a day end.</summary>
    public static DateOnly? DayEndingAt(DateTimeOffset asOf)
    {
        var u = asOf.ToUniversalTime();
        return u.TimeOfDay == TimeSpan.Zero ? DateOnly.FromDateTime(u.UtcDateTime).AddDays(-1) : null;
    }

    private static DateTimeOffset Utc(DateTime t) => new(DateTime.SpecifyKind(t, DateTimeKind.Utc));
    private static string D(DateOnly d) => d.ToString("yyyy-MM-dd");
    private static DateOnly P(string s) => DateOnly.ParseExact(s, "yyyy-MM-dd");
    private static bool Missing(PostgresException e) => e.SqlState is PostgresErrorCodes.UndefinedTable;

    /// <summary>The stored days in [from, to] (all windows). The tables not there yet (cpm-18 not applied) = none.</summary>
    public static async Task<IReadOnlyList<DailyRun>> RunsAsync(NpgsqlDataSource db, DateOnly from, DateOnly to, CancellationToken ct)
    {
        try
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            return (await conn.QueryAsync<DailyRun>(new CommandDefinition(FleetKpiDailySql.Runs,
                new { from = D(from), to = D(to) }, cancellationToken: ct))).ToList();
        }
        catch (PostgresException e) when (Missing(e)) { return Array.Empty<DailyRun>(); }
    }

    /// <summary>Classify one day for the whole fleet on one window and replace its stored rows (one transaction).</summary>
    public static async Task<int> StoreDayAsync(NpgsqlDataSource db, KpiThresholds t, DateOnly day, DateTimeOffset computedAt, CancellationToken ct)
    {
        var asOf = DayEnd(day);
        var loops = await FleetKpiSnapshot.ClassifyAsync(db, t, null, null, null, asOf, ct);
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        var key = new { day = D(day), windowKind = t.WindowKind };
        await conn.ExecuteAsync(new CommandDefinition(FleetKpiDailySql.DeleteDay, key, tx, cancellationToken: ct));
        var at = computedAt.ToUniversalTime();
        await conn.ExecuteAsync(new CommandDefinition(FleetKpiDailySql.InsertRow, loops.Select(l => new
        {
            day = D(day), windowKind = t.WindowKind, loopId = l.Row.LoopId, asOf, l.Row.Site, l.Row.Area, l.Row.Unit,
            state = l.State.ToString(), l.Reason, outcome = l.Outcome.ToString(), l.Band, l.Family, l.Row.Diagnosis,
            windowEnd = l.Row.WindowEnd?.ToUniversalTime(), l.AgeSeconds, l.Fresh, l.NormalModeMeasured, l.InNormalMode,
            l.SaturationMeasured, l.Saturated, l.ManualModeMeasured, l.InManualMode,
            limitedBy = (l.LimitedBy ?? Array.Empty<string>()).ToArray(),
            inputs = JsonSerializer.Serialize(l.Row, Json), ruleVersion = FleetKpiClassifier.RuleVersion, computedAt = at,
        }), tx, cancellationToken: ct));
        await conn.ExecuteAsync(new CommandDefinition(FleetKpiDailySql.UpsertRun, new
        {
            day = D(day), windowKind = t.WindowKind, asOf, ruleVersion = FleetKpiClassifier.RuleVersion, loops = loops.Count,
            thresholds = JsonSerializer.Serialize(t, Json), computedAt = at,
        }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
        return loops.Count;
    }

    private sealed class FlagRow
    {
        public string Day { get; set; } = "";
        public string LoopId { get; set; } = "";
        public string State { get; set; } = "";
        public string? Reason { get; set; }
        public string Outcome { get; set; } = "";
        public string? Band { get; set; }
        public string? Family { get; set; }
        public double? AgeSeconds { get; set; }
        public bool Fresh { get; set; }
        public bool NormalModeMeasured { get; set; }
        public bool InNormalMode { get; set; }
        public bool SaturationMeasured { get; set; }
        public bool Saturated { get; set; }
        public bool ManualModeMeasured { get; set; }
        public bool InManualMode { get; set; }
        public string[]? LimitedBy { get; set; }
        public string? Inputs { get; set; }

        public KpiLoop ToLoop()
        {
            var row = Inputs is null ? new KpiLoopRow { LoopId = LoopId }
                : JsonSerializer.Deserialize<KpiLoopRow>(Inputs, Json) ?? new KpiLoopRow { LoopId = LoopId };
            return new KpiLoop(row, Enum.Parse<KpiState>(State), Reason, Enum.Parse<KpiOutcome>(Outcome), Band, Family, Fresh,
                NormalModeMeasured, InNormalMode, SaturationMeasured, Saturated, AgeSeconds, ManualModeMeasured, InManualMode,
                LimitedBy ?? Array.Empty<string>());
        }
    }

    /// <summary>One stored day in scope, in full (the drill-down), or null when the day is not stored.</summary>
    public static async Task<StoredDay?> ReadDayAsync(NpgsqlDataSource db, string windowKind, DateOnly day,
        string? site, string? area, string? unit, CancellationToken ct)
    {
        try
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            var r = await conn.QuerySingleOrDefaultAsync<DailyRun>(
                new CommandDefinition(FleetKpiDailySql.Run, new { day = D(day), windowKind }, cancellationToken: ct));
            if (r is null) return null;
            var rows = await conn.QueryAsync<FlagRow>(new CommandDefinition(FleetKpiDailySql.Day,
                new { day = D(day), windowKind, site, area, unit }, cancellationToken: ct));
            var t = (r.Thresholds is null ? null : JsonSerializer.Deserialize<KpiThresholds>(r.Thresholds, Json)) ?? new KpiThresholds();
            return new StoredDay(day, Utc(r.AsOf), r.RuleVersion, t with { WindowKind = windowKind }, rows.Select(x => x.ToLoop()).ToList());
        }
        catch (PostgresException e) when (Missing(e)) { return null; }
    }

    /// <summary>The classification flags of every stored day in [from, to] in scope (no inputs): what the trend counts.</summary>
    public static async Task<Dictionary<DateOnly, List<KpiLoop>>> ReadFlagsAsync(NpgsqlDataSource db, string windowKind,
        DateOnly from, DateOnly to, string? site, string? area, string? unit, CancellationToken ct)
    {
        try
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            var rows = await conn.QueryAsync<FlagRow>(new CommandDefinition(FleetKpiDailySql.Flags,
                new { windowKind, from = D(from), to = D(to), site, area, unit }, cancellationToken: ct));
            return rows.GroupBy(x => P(x.Day)).ToDictionary(g => g.Key, g => g.Select(x => x.ToLoop()).ToList());
        }
        catch (PostgresException e) when (Missing(e)) { return new(); }
    }

    /// <summary>
    /// One pass of the daily job: every ended plant day (day end + <paramref name="settle"/> passed) inside the gate-result
    /// retention that is not stored - or was stored by an older rule version - is classified and stored, for both fused
    /// windows; days older than retention_policy KPI_DAILY (1095 d) are deleted. Idempotent: a stored day under the current
    /// rule version is never recomputed; days whose gate results are gone are never recomputed (their source is gone).
    /// </summary>
    public static async Task<RunResult> RunOnceAsync(NpgsqlDataSource db, KpiThresholds baseT, DateTimeOffset now, TimeSpan settle,
        ILogger? logger, CancellationToken ct)
    {
        int gateDays, keepDays;
        int? kept;
        await using (var conn = await db.OpenConnectionAsync(ct))
        {
            gateDays = await conn.ExecuteScalarAsync<int?>(FleetKpiDailySql.RetentionDays, new { c = "GATE_RESULTS" }) ?? 14;
            kept = await conn.ExecuteScalarAsync<int?>(FleetKpiDailySql.RetentionDays, new { c = FleetKpiDailySql.RetentionClass });
            var hasRow = await conn.ExecuteScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM analytics.retention_policy WHERE record_class = @c)", new { c = FleetKpiDailySql.RetentionClass });
            keepDays = hasRow ? kept ?? int.MaxValue : FleetKpiDailySql.DefaultRetentionDays;   // a row with NULL days = forever
            if (await conn.ExecuteScalarAsync<string?>("SELECT to_regclass('analytics.cplm_kpi_daily_run')::text") is null)
                return new RunResult(0, 0, 0, true);
        }
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        // the gate results of the oldest kept day may already be partly dropped: one day of margin
        var first = today.AddDays(-Math.Max(1, gateDays - 1));
        var last = today.AddDays(-1);
        while (last >= first && DayEnd(last) + settle > now) last = last.AddDays(-1);
        int computed = 0, recomputed = 0;
        if (last >= first)
        {
            var stored = (await RunsAsync(db, first, last, ct)).ToDictionary(r => (r.Day, r.WindowKind), r => r.RuleVersion);
            for (var day = first; day <= last; day = day.AddDays(1))
                foreach (var w in KpiThresholds.Windows)
                {
                    var has = stored.TryGetValue((D(day), w), out var version);
                    if (has && version == FleetKpiClassifier.RuleVersion) continue;
                    var n = await StoreDayAsync(db, baseT with { WindowKind = w }, day, now, ct);
                    if (has) recomputed++; else computed++;
                    logger?.LogInformation("KPI daily: {Day} {Window} stored ({Loops} loops, rule v{Rule}{Re})",
                        D(day), w, n, FleetKpiClassifier.RuleVersion, has ? $", recomputed from v{version}" : "");
                }
        }
        var pruned = 0;
        if (keepDays != int.MaxValue)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            pruned = await conn.ExecuteScalarAsync<int>(new CommandDefinition(FleetKpiDailySql.Prune,
                new { before = D(today.AddDays(-keepDays)) }, cancellationToken: ct));
        }
        return new RunResult(computed, recomputed, pruned, false);
    }
}
