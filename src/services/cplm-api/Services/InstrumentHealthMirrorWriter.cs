// v2.5 Task 1H.5 (spec v6 §4.5, §4.8): the durable mirror of the Instrumental health plane.
// Gateway-validated observations land in cpm.instrument_health_observation / cpm.source_availability
// (insert-ignore on the ledger key, so redelivery is idempotent); Flink context records land in
// cpm.device_health_interval / cpm.loop_health_context (upsert by device+from+revision, so a CLOSE
// updates the row its OPEN created while a REVISION is a new row). Pure DB writer, no Kafka.
using System.Text.Json;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

public sealed class InstrumentHealthMirrorWriter
{
    private readonly NpgsqlDataSource _db;

    public InstrumentHealthMirrorWriter([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    private static string? S(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static long L(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var v) ? v : 0;
    private static bool B(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.True;
    private static string[] Arr(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Array
            ? p.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray() : Array.Empty<string>();
    private static DateTime? Ts(string? iso) =>
        DateTimeOffset.TryParse(iso, null, System.Globalization.DateTimeStyles.AssumeUniversal, out var t) ? t.UtcDateTime : null;
    private static DateTime? Ms(long ms) => ms > 0 ? DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime : null;
    private static DateTime? OptMs(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Number ? Ms(p.GetInt64()) : null;

    /// <summary>One record from traverse.cpa.instrument.health.v1 (gateway wrapper + observation). Returns false when not JSON.</summary>
    public async Task<bool> ApplyObservationAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; } catch (JsonException) { return false; }
        var gw = root.TryGetProperty("gateway", out var g) ? g : default;
        var o = root.TryGetProperty("observation", out var ob) ? ob : root;
        var kind = S(o, "message_kind");
        var tenant = S(o, "tenant_id") ?? ""; var site = S(o, "site_id") ?? ""; var source = S(o, "source_id") ?? "";
        var receivedAt = Ts(S(gw, "received_at")) ?? Ts(S(o, "published_at")) ?? DateTime.UtcNow;
        await using var conn = await _db.OpenConnectionAsync(ct);
        if (kind == "SOURCE_AVAILABILITY")
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.source_availability (tenant_id, site, source_id, state, since_at, received_at, last_will)
                VALUES (@tenant, @site, @source, @state, @since, @received, @lastWill)
                ON CONFLICT (tenant_id, site, source_id, since_at) DO NOTHING
                """, new { tenant, site, source, state = S(o, "state") ?? "UNKNOWN", since = Ts(S(o, "since")) ?? receivedAt, received = receivedAt, lastWill = B(o, "last_will") });
            return true;
        }
        var state = o.TryGetProperty("state", out var st) ? st : default;
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO cpm.instrument_health_observation
                (observation_id, tenant_id, site, source_id, device_id, message_kind, producer_id, producer_epoch, sequence,
                 state_revision, state_complete, observed_at, verified_at, published_at, received_at, mqtt_retained,
                 authenticated_producer, gateway_flags, active_flags, collection_state, measurement_impact, payload)
            VALUES (@obs, @tenant, @site, @source, @device, @kind, @producer, @epoch, @seq, @rev, @complete, @observed, @verified,
                    @published, @received, @retained, @auth, @gwFlags, @flags, @collection, @impact, @payload)
            ON CONFLICT (tenant_id, site, source_id, observation_id) DO NOTHING
            """, conn);
        cmd.Parameters.AddWithValue("obs", S(o, "observation_id") ?? "");
        cmd.Parameters.AddWithValue("tenant", tenant);
        cmd.Parameters.AddWithValue("site", site);
        cmd.Parameters.AddWithValue("source", source);
        cmd.Parameters.AddWithValue("device", S(o, "device_id") ?? "");
        cmd.Parameters.AddWithValue("kind", kind ?? "");
        cmd.Parameters.AddWithValue("producer", S(o, "producer_id") ?? "");
        cmd.Parameters.AddWithValue("epoch", L(o, "producer_epoch"));
        cmd.Parameters.AddWithValue("seq", L(o, "sequence"));
        cmd.Parameters.AddWithValue("rev", L(o, "state_revision"));
        cmd.Parameters.AddWithValue("complete", B(o, "state_complete"));
        cmd.Parameters.AddWithValue("observed", (object?)Ts(S(o, "observed_at")) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("verified", (object?)Ts(S(o, "verified_at")) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("published", (object?)Ts(S(o, "published_at")) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("received", receivedAt);
        cmd.Parameters.AddWithValue("retained", B(gw, "mqtt_retained"));
        cmd.Parameters.AddWithValue("auth", (object?)S(gw, "authenticated_producer") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("gwFlags", Arr(gw, "flags"));
        cmd.Parameters.AddWithValue("flags", Arr(state, "active_flags"));
        cmd.Parameters.AddWithValue("collection", S(state, "collection_state") ?? "UNKNOWN");
        cmd.Parameters.AddWithValue("impact", S(state, "measurement_impact") ?? "UNKNOWN");
        cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = json });
        await cmd.ExecuteNonQueryAsync(ct);
        return true;
    }

    /// <summary>One record from traverse.cpa.context.instrument-health.v1 (DEVICE_INTERVAL or LOOP_CONTEXT).</summary>
    public async Task<bool> ApplyContextAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; } catch (JsonException) { return false; }
        var kind = S(root, "record_kind");
        await using var conn = await _db.OpenConnectionAsync(ct);
        if (kind == "DEVICE_INTERVAL" && root.TryGetProperty("interval", out var i) && i.ValueKind == JsonValueKind.Object)
        {
            await conn.ExecuteAsync("""
                INSERT INTO cpm.device_health_interval
                    (tenant_id, site, device_id, from_at, to_at, boundary_kind, active_flags, collection_state, measurement_impact,
                     health_state_id, affected_variable_ids, from_observation_id, revision)
                VALUES (@tenant, @site, @device, @from, @to, @boundary, @flags, @collection, @impact, @stateId, @affected, @obs, @rev)
                ON CONFLICT (tenant_id, site, device_id, from_at, revision) DO UPDATE SET
                    to_at = EXCLUDED.to_at, boundary_kind = EXCLUDED.boundary_kind, active_flags = EXCLUDED.active_flags,
                    collection_state = EXCLUDED.collection_state, measurement_impact = EXCLUDED.measurement_impact,
                    health_state_id = EXCLUDED.health_state_id, affected_variable_ids = EXCLUDED.affected_variable_ids,
                    recorded_at = now()
                """, new
                {
                    tenant = S(i, "tenant_id") ?? "", site = S(i, "site") ?? "", device = S(i, "device_id") ?? "",
                    from = Ms(L(i, "from_ms")) ?? DateTime.UtcNow, to = OptMs(i, "to_ms"),
                    boundary = S(i, "boundary_kind") ?? "OPEN", flags = Arr(i, "active_flags"),
                    collection = S(i, "collection_state") ?? "UNKNOWN", impact = S(i, "measurement_impact") ?? "UNKNOWN",
                    stateId = S(i, "health_state_id") ?? "", affected = Arr(i, "affected_variable_ids"),
                    obs = S(i, "from_observation_id") ?? "", rev = (int)L(i, "revision"),
                });
            return true;
        }
        if (kind != "LOOP_CONTEXT") return false;
        var hasInterval = root.TryGetProperty("interval", out var iv) && iv.ValueKind == JsonValueKind.Object;
        var emitted = Ms(L(root, "emitted_at_ms")) ?? DateTime.UtcNow;
        await conn.ExecuteAsync("""
            INSERT INTO cpm.loop_health_context
                (loop_id, signal_role, device_id, binding_id, from_at, to_at, eligibility, descriptive_eligibility, reason,
                 health_state_id, active_flags, collection_state, measurement_impact, interval_revision, emitted_at)
            VALUES (@loop, @role, @device, @binding, @from, @to, @elig, @desc, @reason, @stateId, @flags, @collection, @impact, @rev, @emitted)
            ON CONFLICT (loop_id, signal_role, from_at, interval_revision) DO UPDATE SET
                device_id = EXCLUDED.device_id, binding_id = EXCLUDED.binding_id, to_at = EXCLUDED.to_at,
                eligibility = EXCLUDED.eligibility, descriptive_eligibility = EXCLUDED.descriptive_eligibility,
                reason = EXCLUDED.reason, health_state_id = EXCLUDED.health_state_id, active_flags = EXCLUDED.active_flags,
                collection_state = EXCLUDED.collection_state, measurement_impact = EXCLUDED.measurement_impact,
                emitted_at = EXCLUDED.emitted_at
            """, new
            {
                loop = S(root, "loop_id") ?? "", role = S(root, "role") ?? "", device = S(root, "device_id") ?? "",
                binding = S(root, "binding_id") ?? "",
                from = hasInterval ? Ms(L(iv, "from_ms")) ?? emitted : emitted,
                to = hasInterval ? OptMs(iv, "to_ms") : null,
                elig = S(root, "eligibility") ?? "UNKNOWN", desc = S(root, "descriptive_eligibility") ?? "UNKNOWN",
                reason = S(root, "reason") ?? "", stateId = hasInterval ? S(iv, "health_state_id") ?? "" : "",
                flags = hasInterval ? Arr(iv, "active_flags") : Array.Empty<string>(),
                collection = hasInterval ? S(iv, "collection_state") ?? "UNKNOWN" : "UNKNOWN",
                impact = hasInterval ? S(iv, "measurement_impact") ?? "UNKNOWN" : "UNKNOWN",
                rev = hasInterval ? (int)L(iv, "revision") : 0, emitted,
            });
        return true;
    }
}
