// CHG-107 (System Response plan Phase 2d): the controller tuning history. The response engine (CHG-212/213) reads the
// loop's P / I / D from the plant feed and puts the tuning on every G12Result whose event had a known P:
//   controller_snapshot_ref = "ctl:" + hash of the raw values, spans and adapter (the same tuning = the same ref)
//   controller_snapshot     = { form, kc, ti_s, td_s, action, scan_s, raw_p, raw_i, raw_d, pv_span_eu, op_low_eu, op_high_eu,
//                               effective_from, source, adapter_version, usable, reason }
// cpm.controller_snapshot is effective-dated per loop: a row starts at effective_from (the first sample with those values)
// and ends where the next different tuning starts. A result whose tuning equals the row in force changes nothing (the
// tuning simply continues, also after a stateless resubmit moves effective_from later); A -> B -> A gives three rows.
// Runs inside the result's transaction; idempotent (the row id is derived from loop, ref and effective_from).
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

public static class ControllerSnapshotStore
{
    private static readonly string[] NativeFields = { "raw_p", "raw_i", "raw_d", "pv_span_eu", "op_low_eu", "op_high_eu" };
    private static readonly string[] NormalizedFields = { "kc", "ti_s", "td_s", "action", "scan_s", "usable", "reason" };
    private static readonly HashSet<string> Forms = new(StringComparer.Ordinal) { "PARALLEL", "IDEAL", "SERIES", "UNKNOWN" };

    /// <summary>
    /// The snapshot row the result's event ran under (inserting and dating it when it is new), or null when the result
    /// carries no tuning (P not published yet, or an older engine).
    /// </summary>
    public static async Task<Guid?> ApplyAsync(NpgsqlConnection conn, NpgsqlTransaction tx, string loopId, JsonElement result, CancellationToken ct)
    {
        var reference = Str(result, "controller_snapshot_ref");
        if (string.IsNullOrEmpty(reference) || string.IsNullOrEmpty(loopId)) return null;
        if (!result.TryGetProperty("controller_snapshot", out var snap) || snap.ValueKind != JsonValueKind.Object)
            return await ByRefAsync(conn, tx, loopId, reference, ct);
        if (!DateTimeOffset.TryParse(Str(snap, "effective_from"), CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var from))
            return await ByRefAsync(conn, tx, loopId, reference, ct);
        var fromUtc = from.UtcDateTime;

        // the tuning in force at effective_from: the same ref means the same tuning continues
        var inForce = await conn.QueryFirstOrDefaultAsync<(Guid Id, string? Ref)>(new CommandDefinition("""
            SELECT snapshot_id, normalized->>'ref'
            FROM cpm.controller_snapshot
            WHERE lower(loop_id) = lower(@loopId) AND valid_from <= @from
            ORDER BY valid_from DESC LIMIT 1
            """, new { loopId, from = fromUtc }, tx, cancellationToken: ct));
        if (inForce.Id != Guid.Empty && inForce.Ref == reference) return inForce.Id;

        var id = Guid.Parse(ResultIdentityUuid.V5("ctl|" + loopId.ToLowerInvariant() + "|" + reference + "|" + fromUtc.ToString("O", CultureInfo.InvariantCulture)));
        var adapter = Str(snap, "adapter_version") ?? "NONE";
        var form = Str(snap, "form") ?? "UNKNOWN";
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO cpm.controller_snapshot
                (snapshot_id, loop_id, valid_from, valid_to, vendor, algorithm_family, form, native, normalized, adapter_version, source, imported_by)
            VALUES (@id, @loopId, @from,
                    (SELECT min(valid_from) FROM cpm.controller_snapshot WHERE lower(loop_id) = lower(@loopId) AND valid_from > @from),
                    @vendor, 'PID', @form, @native::jsonb, @normalized::jsonb, @adapter, @source, 'response-engine')
            ON CONFLICT (snapshot_id) DO NOTHING
            """, new
        {
            id, loopId, from = fromUtc,
            vendor = adapter.StartsWith("CENTUM", StringComparison.OrdinalIgnoreCase) ? "CENTUM" : "",
            form = Forms.Contains(form) ? form : "UNKNOWN",
            native = Pick(snap, NativeFields, null),
            normalized = Pick(snap, NormalizedFields, reference),
            adapter = Trunc(adapter, 32), source = Trunc(Str(snap, "source") ?? "DCS", 64),
        }, tx, cancellationToken: ct));
        // the tuning that was in force ends where this one starts
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE cpm.controller_snapshot SET valid_to = @from
            WHERE lower(loop_id) = lower(@loopId) AND snapshot_id <> @id AND valid_from < @from AND (valid_to IS NULL OR valid_to > @from)
            """, new { id, loopId, from = fromUtc }, tx, cancellationToken: ct));
        return id;
    }

    /// <summary>An older-shape result (ref only): the newest row with that ref, if any.</summary>
    private static Task<Guid?> ByRefAsync(NpgsqlConnection conn, NpgsqlTransaction tx, string loopId, string reference, CancellationToken ct) =>
        conn.QueryFirstOrDefaultAsync<Guid?>(new CommandDefinition("""
            SELECT snapshot_id FROM cpm.controller_snapshot
            WHERE lower(loop_id) = lower(@loopId) AND normalized->>'ref' = @reference
            ORDER BY valid_from DESC LIMIT 1
            """, new { loopId, reference }, tx, cancellationToken: ct));

    private static string Pick(JsonElement snap, string[] fields, string? reference)
    {
        var o = new JsonObject();
        if (reference is not null) o["ref"] = reference;
        foreach (var f in fields)
            if (snap.TryGetProperty(f, out var v)) o[f] = JsonNode.Parse(v.GetRawText());
        return o.ToJsonString();
    }

    private static string? Str(JsonElement e, string n) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static string Trunc(string s, int n) => s.Length <= n ? s : s[..n];
}
