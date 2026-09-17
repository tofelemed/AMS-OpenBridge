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

    public ShadowComparison([Microsoft.Extensions.DependencyInjection.FromKeyedServices("cplm")] NpgsqlDataSource db, ConfigStore store)
    {
        _db = db;
        _store = store;
    }

    public async Task<Report?> CompareAsync(Guid bundleId, CancellationToken ct)
    {
        var b = await _store.GetAsync(bundleId, ct);
        if (b is null) return null;
        var shadow = b.Shadow;
        Guid? runId = shadow is { ValueKind: JsonValueKind.Object } s && s.TryGetProperty("analysisRunId", out var r) && Guid.TryParse(r.GetString(), out var g) ? g : null;
        if (runId is null) return new Report(bundleId, null, "NOT_RUN", null, null, null, 0, 0, Array.Empty<WindowDelta>(), 0, 0, null, DateTimeOffset.UtcNow);
        await using var conn = await _db.OpenConnectionAsync(ct);
        var run = await conn.QueryFirstOrDefaultAsync("SELECT state, loop_id, requested_from_ms, requested_to_ms FROM analytics.analysis_run WHERE analysis_run_id = @id", new { id = runId });
        var rows = (await conn.QueryAsync("""
            SELECT s.loop_id, s.window_kind, s.window_start, s.window_end, s.sample_count, s.diagnosis, s.severity, s.confidence, s.payload::text AS payload,
                   l.diagnosis AS live_diagnosis, l.payload::text AS live_payload, l.sample_count AS live_sample_count, l.severity AS live_severity, l.confidence AS live_confidence
            FROM analytics.cplm_gate_results s
            LEFT JOIN LATERAL (
                SELECT diagnosis, severity, confidence, sample_count, payload FROM analytics.cplm_gate_results l
                WHERE l.loop_id = s.loop_id AND l.window_kind = s.window_kind AND l.window_end = s.window_end AND l.purpose = 'LIVE' AND l.source = 'flink'
                ORDER BY l.result_revision DESC, l.created_at DESC LIMIT 1) l ON true
            WHERE s.analysis_run_id = @id AND s.purpose = 'SHADOW'
            ORDER BY s.window_end
            """, new { id = runId })).ToList();
        var windows = new List<WindowDelta>();
        int removed = 0, added = 0, compared = 0;
        foreach (var row in rows)
        {
            if (row.live_payload is null) continue;
            compared++;
            var after = GateMatrixProjection.Build(row);
            var before = GateMatrixProjection.Build(new { row.loop_id, row.window_kind, row.window_start, row.window_end, sample_count = row.live_sample_count, diagnosis = row.live_diagnosis, severity = row.live_severity, confidence = row.live_confidence, payload = row.live_payload });
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
            if (changed.Count > 0 || !string.Equals((string?)row.live_diagnosis, (string?)row.diagnosis, StringComparison.Ordinal))
                windows.Add(new WindowDelta((string)row.window_kind, (DateTime)row.window_end, (string?)row.live_diagnosis, (string?)row.diagnosis, changed));
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
