// KPI Phase 4 (kpi_calculation_logic/KPI-LOGIC.md section 3.3): one loop's KPIs for the Loop Explorer.
//   GET /api/v1/cpm/loops/{loopId}/kpi-summary?windowKind=24h
// The loop's newest LIVE result of that window kind and the newest one that existed 24 h earlier (for the change), each with
// the stored metrics the per-loop cards show and the engine's own gate verdicts that judge them (G0 data, G1 mode, G3 error,
// G4 actuator effort, G10 limits) — the UI never invents a threshold the engine did not apply. Plus the registry spans so error
// and variability can be shown as % of the PV span.
// CHG-226: while the engine refills after a Flink restart (the newest window is a fresh refill window, Data/RefillSql) the window
// served is the loop's last real verdict in reach, marked lastStored with its time.
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Traverse.CplmApi.Controllers;

[ApiController]
[Route("api/v1/cpm/loops/{loopId}/kpi-summary")]   // not /kpis: that is the KPI stream (CpmAnalyticsController)
[Authorize(Policy = "analytics.view")]
public sealed class CpmLoopKpiController : ControllerBase
{
    private readonly NpgsqlDataSource _db;

    public CpmLoopKpiController([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    private const string Newest = """
        SELECT g.window_end, g.diagnosis, g.payload::text AS payload
        FROM analytics.cplm_gate_results g
        WHERE lower(g.loop_id) = lower(@loopId) AND g.window_kind = @windowKind AND g.purpose = 'LIVE'
          AND g.window_end <= @asOf
        ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
        LIMIT 1
        """;

    /// <summary>CHG-226: the last real verdict of the streaming engine in reach of a refill (window_end in [@reachFrom, @asOf]).</summary>
    private const string RefillVerdict = """
        SELECT g.window_end, g.diagnosis, g.payload::text AS payload
        FROM analytics.cplm_gate_results g
        WHERE lower(g.loop_id) = lower(@loopId) AND g.window_kind = @windowKind AND g.purpose = 'LIVE' AND g.source = 'flink'
          AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
          AND g.window_end <= @asOf AND g.window_end >= @reachFrom
        ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
        LIMIT 1
        """;

    private static readonly string[] Metrics =
    {
        "auto_pct", "manual_pct", "good_error_pct", "mae", "rmse", "pv_std", "op_std", "saturation_pct", "travel_per_day",
        "reversals_per_hour", "sp_changes_per_h", "completeness", "sample_count", "expected_sample_count", "effort_ratio",
    };
    private static readonly string[] Gates = { "G0", "G1", "G3", "G4", "G10" };

    [HttpGet("")]
    public async Task<IActionResult> Get(string loopId, [FromQuery] string windowKind = "12h", CancellationToken ct = default)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var reg = await conn.QuerySingleOrDefaultAsync(new CommandDefinition(
            "SELECT loop_id, engineering::text AS engineering FROM cpm.loop_registry WHERE lower(loop_id) = lower(@loopId)",
            new { loopId }, cancellationToken: ct));
        if (reg is null) return NotFound(new { error = $"Loop '{loopId}' is not registered" });

        var now = DateTimeOffset.UtcNow;
        async Task<object?> Read(DateTimeOffset asOf)
        {
            var row = await conn.QuerySingleOrDefaultAsync(new CommandDefinition(Newest,
                new { loopId, windowKind, asOf }, cancellationToken: ct));
            if (row is null) return null;
            var refill = Data.RefillSql.Read((string?)row.payload, Data.RefillSql.Utc((object?)row.window_end), asOf);
            dynamic? verdict = null;
            if (refill.Refilling && !Data.RefillSql.IsVerdictDiagnosis((string?)row.diagnosis)
                && refill.CoverageFrom is { } from && Data.RefillSql.WindowSpan(windowKind) is { } span)
                verdict = await conn.QuerySingleOrDefaultAsync(new CommandDefinition(RefillVerdict,
                    new { loopId, windowKind, asOf, reachFrom = from - span }, cancellationToken: ct));
            var shown = verdict ?? row;
            WindowView w = Window((object?)shown.window_end, (string?)shown.diagnosis, (string?)shown.payload);
            return new
            {
                windowEnd = w.WindowEnd, diagnosis = w.Diagnosis, values = w.Values, gates = w.Gates, limitSource = w.LimitSource,
                lastStored = verdict is not null,
                resultAt = w.WindowEnd,
                updatingSince = refill.UpdatingSince,
            };
        }
        return Ok(new
        {
            loopId = (string)reg.loop_id,
            windowKind,
            computedAt = now,
            span = Span((string?)reg.engineering),
            current = await Read(now),
            previous = await Read(now.AddHours(-24)),
            reference = "kpi_calculation_logic/KPI-LOGIC.md section 3.3",
        });
    }

    private sealed record WindowView(DateTimeOffset? WindowEnd, string? Diagnosis, Dictionary<string, double?> Values,
        Dictionary<string, string?> Gates, string? LimitSource);

    private static WindowView Window(object? windowEnd, string? diagnosis, string? payloadJson)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
        var p = doc.RootElement;
        var values = Metrics.ToDictionary(m => m, m =>
            p.TryGetProperty(m, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : (double?)null);
        var gates = Gates.ToDictionary(g => g, g =>
            p.TryGetProperty("gates", out var gs) && gs.ValueKind == JsonValueKind.Object && gs.TryGetProperty(g, out var s)
            && s.ValueKind == JsonValueKind.String ? s.GetString() : null);
        string? Str(string k) => p.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return new WindowView(Data.RefillSql.Utc(windowEnd), diagnosis, values, gates, Str("limit_source"));
    }

    private static object? Span(string? engineeringJson)
    {
        if (string.IsNullOrWhiteSpace(engineeringJson)) return null;
        using var doc = JsonDocument.Parse(engineeringJson);
        var e = doc.RootElement;
        double? N(string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
        string? S(string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return new { pvMin = N("pvMin"), pvMax = N("pvMax"), opMin = N("opMin"), opMax = N("opMax"), pvUnit = S("pvUnit") };
    }
}
