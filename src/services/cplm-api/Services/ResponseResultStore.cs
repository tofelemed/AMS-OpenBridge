// v2.5 Task 2B.2 (spec v6 §2.2, §2.8, §2.10): verbatim persistence of a G12Result record into
// analytics.response_event (the full record), analytics.response_metric (one row per catalogue
// quantity, null WITH reason) and analytics.system_model (a CANDIDATE row per estimated model,
// VALIDATED when the job validated it on an independent event). cplm-api never recomputes a
// metric. Idempotent on event_id / (method_run_id, quantity_id); a re-delivered result updates
// the same rows. Pure DB writer, no Kafka.
using System.Text.Json;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

public sealed class ResponseResultStore
{
    private readonly NpgsqlDataSource _db;

    public ResponseResultStore([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    private static string? S(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static long? L(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : null;
    private static double? D(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDouble() : null;
    private static Guid? G(string? s) => Guid.TryParse(s, out var g) ? g : null;

    /// <summary>Returns false when the record is not a G12Result (not JSON, or no method_run_id / event_id).</summary>
    public async Task<bool> ApplyAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; } catch (JsonException) { return false; }
        var eventId = G(S(root, "event_id"));
        var methodRunId = G(S(root, "method_run_id"));
        if (eventId is null || methodRunId is null || root.ValueKind != JsonValueKind.Object) return false;
        var loopId = S(root, "loop_id") ?? "";
        var pathId = S(root, "path_id") ?? "";
        var subgates = root.TryGetProperty("subgates", out var sg) ? sg : default;
        var b = subgates.ValueKind == JsonValueKind.Object && subgates.TryGetProperty("B", out var sb) ? sb : default;
        var bOut = b.ValueKind == JsonValueKind.Object && b.TryGetProperty("outputs", out var bo) ? bo : default;

        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO analytics.response_event
                (event_id, loop_id, method_run_id, event_type, path_id, t0_ms, t_end_ms, capture_state, censor_reason, evaluation_state,
                 eligibility, finding, model_state, purpose, analysis_run_id, bundle_hash, context_revision, result_revision, dataset_hash,
                 source_commit, jar_sha256, result, emitted_at_ms)
            VALUES (@event, @loop, @run, @type, @path, @t0, @tEnd, @capture, @censor, @eval, @elig, @finding, @modelState, @purpose, @analysisRun,
                    @bundle, @ctxRev, @resRev, @dataset, @commit, @jar, @result, @emitted)
            ON CONFLICT (event_id) DO UPDATE SET
                method_run_id = EXCLUDED.method_run_id, t_end_ms = EXCLUDED.t_end_ms, capture_state = EXCLUDED.capture_state,
                censor_reason = EXCLUDED.censor_reason, evaluation_state = EXCLUDED.evaluation_state, eligibility = EXCLUDED.eligibility,
                finding = EXCLUDED.finding, model_state = EXCLUDED.model_state, result_revision = EXCLUDED.result_revision,
                dataset_hash = EXCLUDED.dataset_hash, source_commit = EXCLUDED.source_commit, jar_sha256 = EXCLUDED.jar_sha256,
                result = EXCLUDED.result, emitted_at_ms = EXCLUDED.emitted_at_ms
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue("event", eventId.Value);
            cmd.Parameters.AddWithValue("loop", loopId);
            cmd.Parameters.AddWithValue("run", methodRunId.Value);
            cmd.Parameters.AddWithValue("type", S(bOut, "event_type") ?? "UNKNOWN");
            cmd.Parameters.AddWithValue("path", pathId);
            cmd.Parameters.AddWithValue("t0", L(root, "window_start_ms") ?? 0L);
            cmd.Parameters.AddWithValue("tEnd", (object?)L(root, "window_end_ms") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("capture", S(bOut, "capture_state") ?? "UNKNOWN");
            cmd.Parameters.AddWithValue("censor", S(bOut, "censor_reason") ?? "");
            cmd.Parameters.AddWithValue("eval", S(root, "evaluation_state") ?? "WAITING");
            cmd.Parameters.AddWithValue("elig", S(root, "eligibility") ?? "UNKNOWN");
            cmd.Parameters.AddWithValue("finding", S(root, "finding") ?? "NONE");
            cmd.Parameters.AddWithValue("modelState", S(root, "model_state") ?? "NONE");
            cmd.Parameters.AddWithValue("purpose", S(root, "purpose") ?? "LIVE");
            cmd.Parameters.AddWithValue("analysisRun", (object?)G(S(root, "analysis_run_id")) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("bundle", S(root, "bundle_hash") ?? "legacy");
            cmd.Parameters.AddWithValue("ctxRev", (int)(L(root, "context_revision") ?? 0));
            cmd.Parameters.AddWithValue("resRev", (int)(L(root, "result_revision") ?? 1));
            cmd.Parameters.AddWithValue("dataset", (object?)S(root, "dataset_hash") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("commit", (object?)S(root, "sourceCommit") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("jar", (object?)S(root, "jarSha256") ?? DBNull.Value);
            cmd.Parameters.Add(new NpgsqlParameter("result", NpgsqlDbType.Jsonb) { Value = json });
            cmd.Parameters.AddWithValue("emitted", (object?)L(root, "emitted_at_ms") ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        if (root.TryGetProperty("metrics", out var metrics) && metrics.ValueKind == JsonValueKind.Array)
        {
            var t0 = L(root, "window_start_ms");
            var tEnd = L(root, "window_end_ms");
            foreach (var m in metrics.EnumerateArray())
            {
                var qid = S(m, "quantity_id");
                if (string.IsNullOrEmpty(qid)) continue;
                await conn.ExecuteAsync("""
                    INSERT INTO analytics.response_metric (method_run_id, quantity_id, value, unit, path_id, uncertainty, method, support_from_ms, support_to_ms, config_hash, reason)
                    VALUES (@run, @qid, @value, @unit, @path, @unc, @method, @from, @to, @cfg, @reason)
                    ON CONFLICT (method_run_id, quantity_id) DO UPDATE SET
                        value = EXCLUDED.value, unit = EXCLUDED.unit, uncertainty = EXCLUDED.uncertainty, method = EXCLUDED.method,
                        support_from_ms = EXCLUDED.support_from_ms, support_to_ms = EXCLUDED.support_to_ms, config_hash = EXCLUDED.config_hash, reason = EXCLUDED.reason
                    """, new
                {
                    run = methodRunId.Value, qid, value = D(m, "value"), unit = S(m, "unit") ?? "", path = S(m, "path_id") ?? pathId,
                    unc = D(m, "uncertainty"), method = S(m, "method") ?? "", from = t0, to = tEnd,
                    cfg = S(m, "config_hash") ?? S(root, "bundle_hash") ?? "legacy", reason = S(m, "reason_if_null") ?? "",
                }, tx);
            }
        }

        // a model row whenever the job produced a candidate (model_state CANDIDATE / VALIDATED / REJECTED by validation)
        var modelState = S(root, "model_state") ?? "NONE";
        if (modelState is "CANDIDATE" or "VALIDATED" or "REJECTED")
        {
            var parameters = new Dictionary<string, object?>();
            string family = "UNKNOWN", estimator = "";
            if (metrics.ValueKind == JsonValueKind.Array)
            {
                foreach (var m in metrics.EnumerateArray())
                {
                    var qid = S(m, "quantity_id") ?? "";
                    if (qid is "process_gain" or "integrating_gain" or "dead_time" or "time_constant" or "time_constant_1" or "time_constant_2" or "damping_ratio" or "natural_frequency")
                    {
                        parameters[qid] = new { value = D(m, "value"), unit = S(m, "unit"), uncertainty = D(m, "uncertainty"), method = S(m, "method"), reason = S(m, "reason_if_null") };
                        if (D(m, "value") is not null) estimator = S(m, "method") ?? estimator;
                    }
                }
                family = parameters.TryGetValue("damping_ratio", out var z) && ((dynamic)z!).value is not null ? "SO_UNDERDAMPED"
                    : parameters.TryGetValue("time_constant_2", out var t2) && ((dynamic)t2!).value is not null ? "SOPDT"
                    : parameters.TryGetValue("integrating_gain", out var ki) && ((dynamic)ki!).value is not null
                        ? (parameters.TryGetValue("time_constant", out var tl) && ((dynamic)tl!).value is not null ? "INTEGRATOR_LAG" : "IPDT")
                    : "FOPDT";
            }
            var d = subgates.ValueKind == JsonValueKind.Object && subgates.TryGetProperty("D", out var sd) && sd.TryGetProperty("outputs", out var dOut) ? dOut : default;
            var e = subgates.ValueKind == JsonValueKind.Object && subgates.TryGetProperty("E", out var se) && se.TryGetProperty("outputs", out var eOut) ? eOut : default;
            var modelId = Guid.Parse(ResultIdentityUuid.V5("model|" + methodRunId.Value));
            await conn.ExecuteAsync("""
                INSERT INTO analytics.system_model
                    (model_id, loop_id, path_id, family, parameters, estimator, training_support, validation_support, model_state,
                     context_revision, created_from_event, method_run_id, bundle_hash)
                VALUES (@id, @loop, @path, @family, @params::jsonb, @estimator, @train::jsonb, @valid::jsonb, @state, @ctxRev, @event, @run, @bundle)
                ON CONFLICT (model_id) DO UPDATE SET
                    parameters = EXCLUDED.parameters, estimator = EXCLUDED.estimator, validation_support = EXCLUDED.validation_support,
                    -- a review decision (revision > 1) is server-owned and never overwritten by a re-delivered job result
                    model_state = CASE WHEN analytics.system_model.revision > 1 THEN analytics.system_model.model_state ELSE EXCLUDED.model_state END
                """, new
            {
                id = modelId, loop = loopId, path = pathId, family,
                @params = JsonSerializer.Serialize(parameters),
                estimator = d.ValueKind == JsonValueKind.Object ? (S(d, "method_id") ?? estimator) : estimator,
                train = JsonSerializer.Serialize(new { from_ms = L(root, "window_start_ms"), to_ms = L(root, "window_end_ms"), event_id = eventId, dataset_hash = S(root, "dataset_hash") }),
                valid = e.ValueKind == JsonValueKind.Object ? JsonSerializer.Serialize(new { verdict = S(e, "verdict"), reason = S(e, "reason"), whiteness_p = D(e, "whiteness_p"), lag_convention = S(e, "lag_convention") }) : "{}",
                state = modelState, ctxRev = (int)(L(root, "context_revision") ?? 0), @event = eventId.Value, run = methodRunId.Value,
                bundle = S(root, "bundle_hash") ?? "legacy",
            }, tx);
        }
        await tx.CommitAsync(ct);
        return true;
    }
}

/// <summary>RFC 4122 v5 UUID (SHA-1) in the CPLM namespace - the same derivation Flink's RunIdentity uses, so ids agree across the stack.</summary>
public static class ResultIdentityUuid
{
    public static readonly Guid CplmNamespace = Guid.Parse("7a3c2f1e-4b5d-5e6f-8a9b-0c1d2e3f4a5b");

    public static string V5(string name) => V5(CplmNamespace, name);

    public static string V5(Guid ns0, string name)
    {
        var ns = ns0.ToByteArray();
        // .NET Guid byte order: first three fields little-endian; RFC wants network order
        Array.Reverse(ns, 0, 4); Array.Reverse(ns, 4, 2); Array.Reverse(ns, 6, 2);
        var nameBytes = System.Text.Encoding.UTF8.GetBytes(name);
        var hash = System.Security.Cryptography.SHA1.HashData(ns.Concat(nameBytes).ToArray());
        var g = new byte[16];
        Array.Copy(hash, g, 16);
        g[6] = (byte)((g[6] & 0x0F) | 0x50);
        g[8] = (byte)((g[8] & 0x3F) | 0x80);
        Array.Reverse(g, 0, 4); Array.Reverse(g, 4, 2); Array.Reverse(g, 6, 2);
        return new Guid(g).ToString();
    }
}
