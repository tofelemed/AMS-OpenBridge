using System.Text.Json;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services.OnDemand;

/// <summary>An EVALUATE analysis_run row as GET /analysis-runs/{id} serves it.</summary>
public sealed record EvaluationRunView(
    Guid AnalysisRunId, string LoopId, string State, string? CreatedBy, DateTime CreatedAt, DateTime? FinishedAt, string? Error,
    string WindowKind, long FromMs, long ToMs, IReadOnlyDictionary<string, string> MethodRunIds,
    int? Samples, int? Artifacts, long? ElapsedMs, int GateResults, int EvidenceManifests, int EvidenceComplete, int EvidenceIdentical);

/// <summary>
/// CHG-102 Phase 5c — the SQL behind EVALUATE runs on analytics.analysis_run: the reuse probe (a finished run whose
/// evidence is still held, or the same window in flight), the per-user in-flight count, the timeout, and the job's status
/// records applied idempotently and out-of-order-safe (a terminal state is never left for RUNNING; a late SUCCEEDED does
/// replace the timeout's FAILED, because the job did answer).
/// </summary>
public sealed class EvaluationRunStore
{
    private readonly NpgsqlDataSource _db;

    public EvaluationRunStore(NpgsqlDataSource db) => _db = db;

    /// <summary>
    /// The governed bundle (hash, resolved properties as base64) the loop's LIVE verdicts carried at the window end - the
    /// newest LIVE row ending at or before it (2 days back), else the loop's newest LIVE row (a window older than the gate
    /// results' retention evaluates under today's configuration). Null when that hash is not a governed bundle: the job
    /// then resolves the profile from the parameter set exactly as the live jobs do. Without it the evaluated bundle hash,
    /// and with it every method run id, would differ from the live run of the same window.
    /// </summary>
    public async Task<(string Hash, string PropertiesB64)?> LiveBundleAsync(string loopId, long toMs, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var hash = await conn.ExecuteScalarAsync<string?>(new CommandDefinition("""
            SELECT bundle_hash FROM analytics.cplm_gate_results
            WHERE loop_id = @loop AND purpose = 'LIVE'
              AND window_end <= to_timestamp(@to / 1000.0) AND window_end > to_timestamp(@to / 1000.0) - interval '2 days'
            ORDER BY window_end DESC LIMIT 1
            """, new { loop = loopId, to = (double)toMs }, cancellationToken: ct))
            ?? await conn.ExecuteScalarAsync<string?>(new CommandDefinition("""
                SELECT bundle_hash FROM analytics.cplm_gate_results
                WHERE loop_id = @loop AND purpose = 'LIVE' ORDER BY window_end DESC LIMIT 1
                """, new { loop = loopId }, cancellationToken: ct));
        if (string.IsNullOrEmpty(hash) || hash.Length != 64) return null;
        var props = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
            "SELECT (resolved->'properties')::text FROM cpm.gate_config_bundle WHERE content_hash = @h ORDER BY created_at DESC LIMIT 1",
            new { h = hash }, cancellationToken: ct));
        return props is null ? null : (hash, Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(props)));
    }

    /// <summary>When the run last heard anything: the newest status record, else its creation.</summary>
    private const string LastHeard =
        "COALESCE(to_timestamp(NULLIF(r.manifest->>'status_at_ms', '')::bigint / 1000.0), r.created_at)";

    /// <summary>QUEUED / RUNNING runs past the timeout become FAILED NO_RESPONSE_FROM_EVALUATION_JOB (persisted, so the
    /// reuse probe and the in-flight count see it). <paramref name="id"/> null = every EVALUATE run.</summary>
    public async Task<int> ExpireStaleAsync(int timeoutMinutes, Guid? id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition($"""
            UPDATE analytics.analysis_run r
            SET state = 'FAILED', error = @err, finished_at = NOW()
            WHERE r.purpose = 'EVALUATE' AND r.state IN ('QUEUED', 'RUNNING')
              AND (@id::uuid IS NULL OR r.analysis_run_id = @id)
              AND {LastHeard} < NOW() - make_interval(mins => @mins)
            """, new { err = EvaluationStates.NoResponse, id, mins = Math.Max(1, timeoutMinutes) }, cancellationToken: ct));
    }

    /// <summary>A run to hand back instead of a new one: the same loop and window, either FINISHED with its evidence still
    /// held (none of it EXPIRED / FAILED, and something stored or matched) or QUEUED / RUNNING. Call ExpireStaleAsync first.</summary>
    public async Task<(Guid Id, string State)?> FindReusableAsync(string loopId, EvaluationWindow w, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync<(Guid id, string state)?>(new CommandDefinition("""
            SELECT r.analysis_run_id, r.state
            FROM analytics.analysis_run r
            WHERE r.purpose = 'EVALUATE' AND lower(r.loop_id) = lower(@loop)
              AND r.requested_from_ms = @f AND r.requested_to_ms = @t AND r.manifest->>'window_kind' = @kind
              AND (r.state IN ('QUEUED', 'RUNNING')
                   OR (r.state = 'FINISHED'
                       AND (EXISTS (SELECT 1 FROM analytics.evidence_manifest m
                                    WHERE m.provenance->>'analysis_run_id' = r.analysis_run_id::text)
                            OR COALESCE(jsonb_array_length(r.manifest->'identical_evidence'), 0) > 0)
                       AND NOT EXISTS (SELECT 1 FROM analytics.evidence_manifest m
                                       WHERE m.provenance->>'analysis_run_id' = r.analysis_run_id::text
                                         AND m.readiness IN ('EXPIRED', 'FAILED'))))
            ORDER BY (r.state = 'FINISHED') DESC, r.created_at DESC
            LIMIT 1
            """, new { loop = loopId, f = w.FromMs, t = w.ToMs, kind = w.WindowKind }, cancellationToken: ct));
        return row is { } r ? (r.id, r.state) : null;
    }

    /// <summary>The caller's own run under this key (never another user's: a key is only meaningful to whoever sent it), with
    /// its loop and window so the caller can refuse a key reused for a different request. A caller without an identity
    /// matches only runs without one.</summary>
    public async Task<(Guid Id, string LoopId, long FromMs, long ToMs, string? WindowKind)?> FindByIdempotencyKeyAsync(
        string key, string? createdBy, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync<(Guid id, string loop, long? f, long? t, string? kind)?>(new CommandDefinition("""
            SELECT analysis_run_id, loop_id, requested_from_ms, requested_to_ms, manifest->>'window_kind'
            FROM analytics.analysis_run
            WHERE manifest->>'idempotency_key' = @key AND purpose = 'EVALUATE' AND created_by IS NOT DISTINCT FROM @by
            ORDER BY created_at DESC LIMIT 1
            """, new { key, by = createdBy }, cancellationToken: ct));
        return row is { } r ? (r.id, r.loop, r.f ?? 0, r.t ?? 0, r.kind) : null;
    }

    public async Task<int> CountInFlightAsync(string createdBy, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition("""
            SELECT count(*)::int FROM analytics.analysis_run
            WHERE purpose = 'EVALUATE' AND state IN ('QUEUED', 'RUNNING') AND created_by = @by
            """, new { by = createdBy }, cancellationToken: ct));
    }

    public async Task InsertAsync(Guid id, string loopId, string site, EvaluationWindow w, string? device, string? createdBy,
        string? idempotencyKey, CancellationToken ct)
    {
        var manifest = new Dictionary<string, object?> { ["window_kind"] = w.WindowKind, ["source"] = "iotdb", ["iotdb_device"] = device };
        if (idempotencyKey is not null) manifest["idempotency_key"] = idempotencyKey;
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO analytics.analysis_run
                (analysis_run_id, site, loop_id, purpose, state, created_by, requested_from_ms, requested_to_ms, manifest)
            VALUES (@id, @site, @loop, 'EVALUATE', 'QUEUED', @by, @f, @t, @manifest::jsonb)
            """, new { id, site = site ?? "", loop = loopId, by = createdBy, f = w.FromMs, t = w.ToMs,
                manifest = JsonSerializer.Serialize(manifest) }, cancellationToken: ct));
    }

    /// <summary>The request never left (Kafka refused it): FAILED with the reason, so the run is not counted in flight.</summary>
    public async Task MarkFailedAsync(Guid id, string error, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE analytics.analysis_run SET state = 'FAILED', error = @error, finished_at = NOW()
            WHERE analysis_run_id = @id AND state IN ('QUEUED', 'RUNNING')
            """, new { id, error }, cancellationToken: ct));
    }

    /// <summary>
    /// One status record. Returns false when it was not applied: an unknown run, a run that is not EVALUATE, a RUNNING after
    /// a terminal state, or a second terminal state (the first one stands - except over the timeout's FAILED, which a real
    /// answer replaces). The record's figures are merged into the manifest.
    /// </summary>
    public async Task<bool> ApplyStatusAsync(EvaluationStatus s, CancellationToken ct)
    {
        var state = EvaluationStates.FromJob(s.State);
        if (state is null) return false;
        var patch = new Dictionary<string, object?> { ["status_at_ms"] = s.AtMs, ["job_state"] = s.State };
        if (s.MethodRunIds is { Count: > 0 }) patch["method_run_ids"] = s.MethodRunIds;
        if (s.Samples is { } n) patch["samples"] = n;
        if (s.Artifacts is { } a) patch["artifacts"] = a;
        if (s.ElapsedMs is { } e) patch["elapsed_ms"] = e;
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE analytics.analysis_run
            SET state = @state,
                error = CASE WHEN @state = 'FAILED' THEN COALESCE(@error, 'EVALUATION_FAILED') ELSE NULL END,
                finished_at = CASE WHEN @state IN ('FINISHED', 'FAILED') THEN NOW() ELSE finished_at END,
                actual_from_ms = COALESCE(@ws, actual_from_ms),
                actual_to_ms = COALESCE(@we, actual_to_ms),
                manifest = manifest || @patch::jsonb
            WHERE analysis_run_id = @id AND purpose = 'EVALUATE'
              AND (state IN ('CREATED', 'QUEUED', 'RUNNING')
                   OR (state = 'FAILED' AND error = @noResponse AND @state IN ('FINISHED', 'FAILED')))
              AND NOT (@state = 'RUNNING' AND state NOT IN ('CREATED', 'QUEUED', 'RUNNING'))
            """, new
        {
            id = s.AnalysisRunId, state, error = s.Error, ws = s.WindowStartMs, we = s.WindowEndMs,
            patch = JsonSerializer.Serialize(patch), noResponse = EvaluationStates.NoResponse,
        }, cancellationToken: ct));
        return rows > 0;
    }

    public async Task<EvaluationRunView?> ReadAsync(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync(new CommandDefinition("""
            SELECT r.loop_id, r.state, r.created_by, r.created_at, r.finished_at, r.error,
                   r.requested_from_ms, r.requested_to_ms, r.manifest::text AS manifest,
                   (SELECT count(*)::int FROM analytics.cplm_gate_results g WHERE g.analysis_run_id = r.analysis_run_id) AS gate_results,
                   (SELECT count(*)::int FROM analytics.evidence_manifest m WHERE m.provenance->>'analysis_run_id' = r.analysis_run_id::text) AS manifests,
                   (SELECT count(*)::int FROM analytics.evidence_manifest m WHERE m.provenance->>'analysis_run_id' = r.analysis_run_id::text
                      AND m.readiness = 'COMPLETE') AS complete
            FROM analytics.analysis_run r WHERE r.analysis_run_id = @id AND r.purpose = 'EVALUATE'
            """, new { id }, cancellationToken: ct));
        if (r is null) return null;
        using var doc = JsonDocument.Parse((string)r.manifest);
        var m = doc.RootElement;
        var ids = new Dictionary<string, string>();
        if (m.TryGetProperty("method_run_ids", out var mr) && mr.ValueKind == JsonValueKind.Object)
            foreach (var p in mr.EnumerateObject()) if (p.Value.ValueKind == JsonValueKind.String) ids[p.Name] = p.Value.GetString()!;
        return new EvaluationRunView(id, (string)r.loop_id, (string)r.state, (string?)r.created_by, (DateTime)r.created_at,
            (DateTime?)r.finished_at, (string?)r.error, Str(m, "window_kind") ?? "", (long?)r.requested_from_ms ?? 0, (long?)r.requested_to_ms ?? 0,
            ids, (int?)Num(m, "samples"), (int?)Num(m, "artifacts"), Num(m, "elapsed_ms"), (int)r.gate_results, (int)r.manifests, (int)r.complete,
            m.TryGetProperty("identical_evidence", out var ie) && ie.ValueKind == JsonValueKind.Array ? ie.GetArrayLength() : 0);
    }

    private static string? Str(JsonElement e, string n) => e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static long? Num(JsonElement e, string n) => e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : null;
}
