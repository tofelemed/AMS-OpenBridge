using System.Text.Json;
using Dapper;
using Npgsql;
using Traverse.CplmApi.Data;

namespace Traverse.CplmApi.Services.Config;

/// <summary>
/// v2.5 Task 3B.3 / 3D.1 (spec §5.5): the before / after gate matrix of a draft's SHADOW run - the
/// SHADOW rows the run wrote (purpose = SHADOW, analysis_run_id = the run) against the LIVE rows of
/// the same loop, window kind and window end. Materialised server-side, read-only, no operational
/// output; when the shadow removes symptoms (a gate WARN/FAIL before, PASS after) the bundle is
/// marked POLICY_RECLASSIFICATION on its shadow record so the approver sees the change of meaning.
/// </summary>
public sealed class ShadowComparison
{
    public sealed record GateDelta(string Gate, string? Before, string? After);
    public sealed record WindowDelta(string WindowKind, DateTime WindowEnd, string? DiagnosisBefore, string? DiagnosisAfter, IReadOnlyList<GateDelta> Changed);
    public sealed record Report(Guid BundleId, Guid? AnalysisRunId, string RunState, string? LoopId, long? FromMs, long? ToMs, int ShadowRows, int ComparedWindows,
        IReadOnlyList<WindowDelta> Windows, int SymptomsRemoved, int SymptomsAdded, string? Reclassification, DateTimeOffset ComparedAt);

    private readonly NpgsqlDataSource _db;
    private readonly ConfigStore _store;
    private readonly ICplmRecomputeService? _recompute;

    public ShadowComparison([Microsoft.Extensions.DependencyInjection.FromKeyedServices("cplm")] NpgsqlDataSource db, ConfigStore store, ICplmRecomputeService? recompute = null)
    {
        _db = db;
        _store = store;
        _recompute = recompute;
    }

    public async Task<Report?> CompareAsync(Guid bundleId, CancellationToken ct)
    {
        var b = await _store.GetAsync(bundleId, ct);
        if (b is null) return null;
        var shadow = b.Shadow;
        Guid? runId = shadow is { ValueKind: JsonValueKind.Object } s && s.TryGetProperty("analysisRunId", out var r) && Guid.TryParse(r.GetString(), out var g) ? g : null;
        if (runId is null) return new Report(bundleId, null, "NOT_RUN", null, null, null, 0, 0, Array.Empty<WindowDelta>(), 0, 0, null, DateTimeOffset.UtcNow);
        // gap #7: the run's state was only refreshed from Flink when something read GET analysis-runs/{id}, so the comparison
        // stayed "SUBMITTED"; refresh it here the same way (a Flink hiccup leaves the stored state as it was)
        if (_recompute is not null)
        {
            try { await _recompute.GetAnalysisRunAsync(runId.Value, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { /* the stored state is still a valid answer */ }
        }
        await using var conn = await _db.OpenConnectionAsync(ct);
        // lab, 23 Nov: one LATERAL query took 13-30 s (sometimes a read timeout) - TimescaleDB's ColumnarScan estimates ~100,000
        // SHADOW rows for one run (0 actual), the 2.3 M cost crosses jit_above_cost, and JIT compilation alone took ~8.7 s.
        // Two plain reads instead (the shadow rows by run, then the LIVE rows of exactly those windows), with JIT off for this
        // transaction only - the database setting is left as it is.
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync("SET LOCAL jit = off", transaction: tx);
        var run = await conn.QueryFirstOrDefaultAsync("SELECT state, loop_id, requested_from_ms, requested_to_ms FROM analytics.analysis_run WHERE analysis_run_id = @id", new { id = runId }, tx);
        var rows = (await conn.QueryAsync("""
            SELECT loop_id, window_kind, window_start, window_end, sample_count, diagnosis, severity, confidence, payload::text AS payload, created_at
            FROM analytics.cplm_gate_results
            WHERE analysis_run_id = @id AND purpose = 'SHADOW'
            ORDER BY window_end
            """, new { id = runId }, tx)).ToList();
        var live = new Dictionary<(string Loop, string Kind, DateTime End), dynamic>();
        if (rows.Count > 0)
        {
            var liveRows = await conn.QueryAsync("""
                SELECT DISTINCT ON (l.loop_id, l.window_kind, l.window_end) l.loop_id, l.window_kind, l.window_end,
                       l.diagnosis, l.severity, l.confidence, l.sample_count, l.payload::text AS payload, l.created_at
                FROM analytics.cplm_gate_results l
                JOIN unnest(@loops::text[], @kinds::text[], @ends::timestamptz[]) AS w(loop_id, window_kind, window_end)
                  ON l.loop_id = w.loop_id AND l.window_kind = w.window_kind AND l.window_end = w.window_end
                WHERE l.purpose = 'LIVE' AND l.source = 'flink'
                ORDER BY l.loop_id, l.window_kind, l.window_end, l.result_revision DESC, l.created_at DESC
                """, new
            {
                loops = rows.Select(r => (string)r.loop_id).ToArray(),
                kinds = rows.Select(r => (string)r.window_kind).ToArray(),
                ends = rows.Select(r => DateTime.SpecifyKind((DateTime)r.window_end, DateTimeKind.Utc)).ToArray(),
            }, tx);
            foreach (var l in liveRows) live[((string)l.loop_id, (string)l.window_kind, DateTime.SpecifyKind((DateTime)l.window_end, DateTimeKind.Utc))] = l;
        }
        await tx.CommitAsync(ct);
        var windows = new List<WindowDelta>();
        int removed = 0, added = 0, compared = 0;
        foreach (var row in rows)
        {
            if (!live.TryGetValue(((string)row.loop_id, (string)row.window_kind, DateTime.SpecifyKind((DateTime)row.window_end, DateTimeKind.Utc)), out var l)) continue;
            compared++;
            var after = GateMatrixProjection.Build(row);
            // created_at too: the projection reads it ("computed at"); without it every compared window threw
            var before = GateMatrixProjection.Build(new { row.loop_id, row.window_kind, row.window_start, row.window_end, sample_count = l.sample_count, diagnosis = l.diagnosis, severity = l.severity, confidence = l.confidence, payload = l.payload, created_at = l.created_at });
            var changed = new List<GateDelta>();
            var afterGates = Gates(after);
            foreach (var (gate, statusBefore) in Gates(before))
            {
                afterGates.TryGetValue(gate, out string? statusAfter);
                if (string.Equals(statusBefore, statusAfter, StringComparison.Ordinal)) continue;
                changed.Add(new GateDelta(gate, statusBefore, statusAfter));
                if (IsSymptom(statusBefore) && !IsSymptom(statusAfter)) removed++;
                if (!IsSymptom(statusBefore) && IsSymptom(statusAfter)) added++;
            }
            if (changed.Count > 0 || !string.Equals((string?)l.diagnosis, (string?)row.diagnosis, StringComparison.Ordinal))
                windows.Add(new WindowDelta((string)row.window_kind, (DateTime)row.window_end, (string?)l.diagnosis, (string?)row.diagnosis, changed));
        }
        var runState = run is null ? "UNKNOWN" : (string)run.state;
        string? reclass = removed > 0 ? "POLICY_RECLASSIFICATION" : null;
        var report = new Report(bundleId, runId, runState, (string?)run?.loop_id, (long?)run?.requested_from_ms, (long?)run?.requested_to_ms, rows.Count, compared, windows, removed, added, reclass, DateTimeOffset.UtcNow);
        if (shadow is { ValueKind: JsonValueKind.Object } sh)
        {
            // record the comparison on the bundle so the approver reads the same numbers the workspace showed
            var merged = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(sh.GetRawText()) ?? new Dictionary<string, JsonElement>();
            var fingerprint = $"{runState}|{rows.Count}|{compared}|{removed}|{added}";
            var previous = merged.TryGetValue("comparison", out var c) && c.ValueKind == JsonValueKind.Object && c.TryGetProperty("fingerprint", out var f) ? f.GetString() : null;
            if (previous != fingerprint)                    // a read only writes when the numbers moved (the etag changes with the record)
            {
                merged["comparison"] = JsonSerializer.SerializeToElement(new { state = runState, shadowRows = rows.Count, comparedWindows = compared, symptomsRemoved = removed, symptomsAdded = added, reclassification = reclass, comparedAt = report.ComparedAt, fingerprint });
                merged["state"] = JsonSerializer.SerializeToElement(runState);
                await _store.SetStateAsync(bundleId, b.State, ct, null, JsonSerializer.Serialize(merged));
            }
        }
        return report;
    }

    private static Dictionary<string, string?> Gates(Dictionary<string, object?> matrix)
    {
        var out_ = new Dictionary<string, string?>(StringComparer.Ordinal);
        if (matrix.TryGetValue("gates", out var g) && g is IEnumerable<object> gates)
        {
            foreach (var cell in gates)
            {
                var t = cell.GetType();
                var key = t.GetProperty("key")?.GetValue(cell)?.ToString();
                var status = t.GetProperty("status")?.GetValue(cell)?.ToString();
                if (key is not null) out_[key] = status;
            }
        }
        return out_;
    }

    private static bool IsSymptom(string? status) => status is "FAIL" or "WARN" or "DETECTED" or "SUSPECTED" or "CONFIRMED" or "INTERACTION_DETECTED";
}
