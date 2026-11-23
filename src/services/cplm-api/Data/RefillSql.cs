// CHG-226 (docs/next-release/flink-restart-data-gap.md, option D): after a Flink restart the Long job refills its 24 h buffer and,
// for 11.5 h (12 h) / 23 h (24 h), every 12 h / 24 h window is "not enough data". The engine (option C) marks those windows in
// the gate payload: "warming_up": true and "coverage_from_ms" (from when its buffer covers; missing = false). Owner's rule
// (23 Nov): the last calculated result stays on screen, marked as the last stored result with its time, until new results arrive.
//
// The ONE rule, used by every read that serves a loop's 12 h / 24 h result:
//   the loop is REFILLING - its newest LIVE row carries warming_up = true, is not itself a real verdict, and is fresh (ended
//   within FreshSeconds, the CHG-170 "pipeline produces" rule: a refill that stopped is a stale loop, not a refill) - and it has
//   a real LIVE verdict from the streaming engine (source 'flink') whose window_end >= coverage_from - one window length
//   => that verdict is the loop's result ("lastStored" = true); in EVERY other case lastStored = false and the newest row is
//   served as before: normal running, a stale loop, a real outage (G0 INCOMPLETE without the flag), no earlier verdict in reach,
//   rows without the flag (older data). Only 12h and 24h fall back (WindowLength is NULL for any other kind).
using System.Text.Json;

namespace Traverse.CplmApi.Data;

public static class RefillSql
{
    /// <summary>The newest row must have ended within this many seconds for the loop to count as refilling: the default of
    /// KpiThresholds.FreshSeconds (Cpm:Kpi:FreshSeconds, not overridden in any deployment). The KPI read passes its own value.</summary>
    public const int FreshSeconds = 3600;

    /// <summary>One window length of a refilled kind, as SQL over @windowKind; NULL for any other kind.</summary>
    public const string WindowLength = "(CASE @windowKind WHEN '12h' THEN interval '12 hours' WHEN '24h' THEN interval '24 hours' END)";

    /// <summary>The row's warming_up flag (missing or anything but true = false; never a cast error).</summary>
    public static string WarmingUp(string a) => $"COALESCE(lower({a}.payload->>'warming_up') = 'true', FALSE)";

    /// <summary>The row is a fresh refill window: flagged and ended within <paramref name="freshSeconds"/> of <paramref name="asOf"/>.</summary>
    public static string Refilling(string a, string asOf = "now()", string? freshSeconds = null) =>
        $"COALESCE({WarmingUp(a)} AND {a}.window_end >= {asOf} - make_interval(secs => {freshSeconds ?? FreshSeconds.ToString()}), FALSE)";

    /// <summary>The row's coverage_from_ms as timestamptz (NULL when missing or not a number).</summary>
    public static string CoverageFrom(string a) =>
        $"(CASE WHEN jsonb_typeof({a}.payload->'coverage_from_ms') = 'number' THEN to_timestamp(({a}.payload->>'coverage_from_ms')::float8 / 1000.0) END)";

    public static string IsVerdict(string a) => $"({a}.diagnosis IS NOT NULL AND {a}.diagnosis <> 'INSUFFICIENT_DATA')";

    /// <summary>
    /// Per registry loop r: the newest LIVE row of the kind (the any-row index probe) with its refill facts, as
    /// <c>rf.has_row, rf.newest_end, rf.newest_is_verdict, rf.refilling, rf.coverage_from</c>.
    /// </summary>
    public static readonly string NewestProbe = $"""
        LEFT JOIN LATERAL (
            SELECT TRUE AS has_row, g.window_end AS newest_end, {IsVerdict("g")} AS newest_is_verdict,
                   {Refilling("g")} AS refilling, {CoverageFrom("g")} AS coverage_from
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) rf ON TRUE
        """;

    /// <summary>TRUE when the verdict row <paramref name="v"/> (needs window_end, diagnosis, source) is shown in place of the
    /// newest row <paramref name="n"/> (needs newest_is_verdict, refilling, coverage_from) because the loop refills.</summary>
    public static string LastStored(string v, string n = "rf") =>
        $"COALESCE({n}.refilling AND NOT {n}.newest_is_verdict AND {IsVerdict(v)} AND {v}.source = 'flink' " +
        $"AND {v}.window_end >= {n}.coverage_from - {WindowLength}, FALSE)";

    /// <summary>The newest row's coverage start while the loop refills, else NULL.</summary>
    public static string UpdatingSince(string n = "rf") => $"CASE WHEN {n}.refilling THEN {n}.coverage_from END";

    // ── the same rule in C#, for the per-loop reads that load the rows themselves ──

    public static TimeSpan? WindowSpan(string? windowKind) => windowKind?.Trim().ToLowerInvariant() switch
    {
        "12h" => TimeSpan.FromHours(12),
        "24h" => TimeSpan.FromHours(24),
        _ => null,
    };

    /// <summary>The refill facts of a newest row: refilling (flagged and fresh) and from when the engine's buffer covers.</summary>
    public readonly record struct Refill(bool Refilling, DateTimeOffset? CoverageFrom)
    {
        /// <summary>updatingSince: the coverage start while the loop refills, else null.</summary>
        public DateTimeOffset? UpdatingSince => Refilling ? CoverageFrom : null;
    }

    /// <summary>The newest row's payload and window end, judged at <paramref name="asOf"/>.</summary>
    public static Refill Read(string? payloadJson, DateTimeOffset? newestEnd, DateTimeOffset asOf, int freshSeconds = FreshSeconds)
    {
        if (string.IsNullOrWhiteSpace(payloadJson) || newestEnd is not { } end) return default;
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            var p = doc.RootElement;
            if (p.ValueKind != JsonValueKind.Object) return default;
            var warming = p.TryGetProperty("warming_up", out var w)
                && (w.ValueKind == JsonValueKind.True || (w.ValueKind == JsonValueKind.String && string.Equals(w.GetString(), "true", StringComparison.OrdinalIgnoreCase)));
            DateTimeOffset? from = p.TryGetProperty("coverage_from_ms", out var c) && c.ValueKind == JsonValueKind.Number && c.TryGetDouble(out var ms)
                ? DateTimeOffset.FromUnixTimeMilliseconds((long)ms) : null;
            return new Refill(warming && end >= asOf.AddSeconds(-freshSeconds), from);
        }
        catch (JsonException) { return default; }
    }

    public static bool IsVerdictDiagnosis(string? diagnosis) => diagnosis is not null && diagnosis != "INSUFFICIENT_DATA";

    /// <summary>The rule above for a verdict row already loaded: true = show the verdict as the loop's result.</summary>
    public static bool Qualifies(Refill newest, string? newestDiagnosis, DateTimeOffset? verdictEnd, string? verdictDiagnosis,
        string? verdictSource, string? windowKind) =>
        newest.Refilling && !IsVerdictDiagnosis(newestDiagnosis) && IsVerdictDiagnosis(verdictDiagnosis)
        && string.Equals(verdictSource, "flink", StringComparison.Ordinal)
        && newest.CoverageFrom is { } from && WindowSpan(windowKind) is { } span && verdictEnd is { } end && end >= from - span;

    /// <summary>A timestamp column as read by Dapper (DateTime UTC or DateTimeOffset), as a UTC DateTimeOffset.</summary>
    public static DateTimeOffset? Utc(object? v) => v switch
    {
        DateTimeOffset o => o.ToUniversalTime(),
        DateTime t => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)),
        _ => null,
    };
}
