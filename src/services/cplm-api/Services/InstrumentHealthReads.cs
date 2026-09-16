using System.Text.Json;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>One active diagnostic as the transmitter reported it (contract v1 state.diagnostics[]); text is shown, never interpreted.</summary>
public sealed record HealthDiagnostic(
    string DiagnosticId, string? NativeCode, string? Message, string[] Flags, string[] AffectedVariableIds,
    string? MeasurementImpact, DateTime? FirstObservedAt, string? Cause, string? Remedy, string? SourceRecordRef);

public sealed record RoleHealth(
    string Role, string Eligibility, string DescriptiveEligibility, string Reason, string? DeviceId, Guid? BindingId,
    string[] ActiveFlags, string CollectionState, string MeasurementImpact, string? HealthStateId,
    DateTime? IntervalFrom, DateTime? IntervalTo, int IntervalRevision,
    DateTime? LastObservedAt, DateTime? LastVerifiedAt, double? ObservedAgeS, double? VerifiedAgeS, string? NativeStatus,
    int ActiveDiagnostics, IReadOnlyList<HealthDiagnostic> Diagnostics, int? InterpretationVersion);

public sealed record LoopInstrumentHealth(string LoopId, DateTime At, IReadOnlyList<RoleHealth> Roles, string? SourceState, DateTime? SourceSince);

/// <summary>
/// v2.5 Task 1H.5: reads over the mirror. A role's health as-of is the LOOP_CONTEXT row in
/// force at that instant (binding + device interval + policy, all decided in Flink), plus the
/// device's latest observed/verified times from the ledger. No binding = NOT_CONFIGURED; a
/// binding without a context yet = UNKNOWN (never OK). Nothing here re-derives eligibility.
/// </summary>
public sealed class InstrumentHealthReads
{
    private static readonly string[] Roles = { "PV", "SP", "OP", "VP", "MODE" };
    private readonly NpgsqlDataSource _db;

    public InstrumentHealthReads([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    public async Task<LoopInstrumentHealth?> GetAsOfAsync(string loopId, DateTime at, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var known = await conn.ExecuteScalarAsync<string?>("SELECT loop_id FROM cpm.loop_registry WHERE lower(loop_id) = lower(@loopId)", new { loopId });
        if (known is null) return null;
        var bindings = (await conn.QueryAsync<InstrumentBinding>("""
            SELECT binding_id AS BindingId, loop_id AS LoopId, signal_role AS SignalRole, device_id AS DeviceId,
                   installation_id AS InstallationId, source_id AS SourceId, valid_from AS ValidFrom, valid_to AS ValidTo,
                   approved_by AS ApprovedBy, approved_at AS ApprovedAt, note AS Note
            FROM cpm.signal_device_binding_history WHERE loop_id = @loopId
            """, new { loopId = known })).ToList();
        var roles = new List<RoleHealth>();
        string? sourceState = null; DateTime? sourceSince = null;
        foreach (var role in Roles)
        {
            var b = BindingResolution.AsOf(bindings, role, at);
            if (b is null)
            {
                if (role is "PV" or "VP") roles.Add(new RoleHealth(role, "NOT_CONFIGURED", "NOT_CONFIGURED", "NO_BINDING", null, null,
                    Array.Empty<string>(), "UNKNOWN", "UNKNOWN", null, null, null, 0, null, null, null, null, null, 0,
                    Array.Empty<HealthDiagnostic>(), null));
                continue;
            }
            var ctx = await conn.QueryFirstOrDefaultAsync("""
                SELECT eligibility, descriptive_eligibility, reason, device_id, binding_id, active_flags, collection_state, measurement_impact,
                       health_state_id, from_at, to_at, interval_revision
                FROM cpm.loop_health_context
                WHERE loop_id = @loopId AND signal_role = @role AND from_at <= @at AND (to_at IS NULL OR @at < to_at)
                ORDER BY interval_revision DESC, from_at DESC LIMIT 1
                """, new { loopId = known, role, at });
            var obs = await conn.QueryFirstOrDefaultAsync("""
                SELECT observed_at, verified_at, payload->'observation'->'state'->>'native_status' AS native_status,
                       jsonb_array_length(COALESCE(payload->'observation'->'state'->'diagnostics', '[]'::jsonb)) AS diagnostics,
                       (payload->'observation'->'state'->'diagnostics')::text AS diagnostics_json, interpretation_version,
                       active_flags AS obs_flags, collection_state AS obs_collection, measurement_impact AS obs_impact,
                       source_id
                FROM cpm.instrument_health_observation
                WHERE device_id = @device AND message_kind <> 'SOURCE_AVAILABILITY' AND received_at <= @at
                ORDER BY observed_at DESC NULLS LAST, received_at DESC LIMIT 1
                """, new { device = b.DeviceId, at });
            if (obs is not null && sourceState is null)
            {
                var av = await conn.QueryFirstOrDefaultAsync("""
                    SELECT state, since_at FROM cpm.source_availability WHERE source_id = @source AND since_at <= @at
                    ORDER BY since_at DESC LIMIT 1
                    """, new { source = (string)obs.source_id, at });
                if (av is not null) { sourceState = (string)av.state; sourceSince = (DateTime?)av.since_at; }
            }
            DateTime? observedAt = obs is null ? null : (DateTime?)obs.observed_at;
            DateTime? verifiedAt = obs is null ? null : (DateTime?)obs.verified_at;
            // Before Flink has decided a context (or while it is down), the device's OWN reported
            // flags / collection / impact are still facts worth showing; only the eligibility stays
            // UNKNOWN with reason NO_CONTEXT_YET — never derived here.
            string[] flags = ctx is not null ? (string[])ctx.active_flags : obs is not null ? (string[])obs.obs_flags : Array.Empty<string>();
            string collection = ctx is not null ? (string)ctx.collection_state : obs is not null ? (string)obs.obs_collection : "UNKNOWN";
            string impact = ctx is not null ? (string)ctx.measurement_impact : obs is not null ? (string)obs.obs_impact : "UNKNOWN";
            roles.Add(new RoleHealth(role,
                ctx is null ? "UNKNOWN" : (string)ctx.eligibility,
                ctx is null ? "UNKNOWN" : (string)ctx.descriptive_eligibility,
                ctx is null ? "NO_CONTEXT_YET" : (string)ctx.reason,
                b.DeviceId, b.BindingId,
                flags, collection, impact,
                ctx is null ? null : (string?)ctx.health_state_id,
                ctx is null ? null : (DateTime?)ctx.from_at, ctx is null ? null : (DateTime?)ctx.to_at,
                ctx is null ? 0 : (int)ctx.interval_revision,
                observedAt, verifiedAt,
                observedAt is null ? null : (double?)Math.Round((at - observedAt.Value).TotalSeconds, 1),
                verifiedAt is null ? null : (double?)Math.Round((at - verifiedAt.Value).TotalSeconds, 1),
                obs is null ? null : (string?)obs.native_status,
                obs is null ? 0 : Convert.ToInt32(obs.diagnostics),
                obs is null ? Array.Empty<HealthDiagnostic>() : ParseDiagnostics((string?)obs.diagnostics_json),
                obs is null ? null : (int?)Convert.ToInt32(obs.interpretation_version)));
        }
        return new LoopInstrumentHealth(known, at, roles, sourceState, sourceSince);
    }

    private static string? Str(JsonElement e, string n) =>
        e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
    private static string[] StrArr(JsonElement e, string n) =>
        e.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.Array
            ? p.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray() : Array.Empty<string>();

    /// <summary>The transmitter's diagnostics verbatim; a malformed list yields an empty one, never a throw on the read path.</summary>
    internal static IReadOnlyList<HealthDiagnostic> ParseDiagnostics(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<HealthDiagnostic>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return Array.Empty<HealthDiagnostic>();
            return doc.RootElement.EnumerateArray().Where(d => d.ValueKind == JsonValueKind.Object).Select(d => new HealthDiagnostic(
                Str(d, "diagnostic_id") ?? "", Str(d, "native_code"), Str(d, "message"), StrArr(d, "flags"), StrArr(d, "affected_variable_ids"),
                Str(d, "measurement_impact"),
                DateTimeOffset.TryParse(Str(d, "first_observed_at"), null, System.Globalization.DateTimeStyles.AssumeUniversal, out var t) ? t.UtcDateTime : null,
                Str(d, "cause"), Str(d, "remedy"), Str(d, "source_record_ref"))).ToList();
        }
        catch (JsonException) { return Array.Empty<HealthDiagnostic>(); }
    }

    public async Task<IReadOnlyList<object>> HistoryAsync(string loopId, DateTime from, DateTime to, int limit, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("""
            SELECT c.signal_role, c.device_id, c.binding_id, c.from_at, c.to_at, c.eligibility, c.descriptive_eligibility, c.reason,
                   c.health_state_id, c.active_flags, c.collection_state, c.measurement_impact, c.interval_revision, c.emitted_at
            FROM cpm.loop_health_context c
            WHERE lower(c.loop_id) = lower(@loopId) AND c.from_at < @to AND (c.to_at IS NULL OR c.to_at > @from)
            ORDER BY c.from_at DESC, c.interval_revision DESC
            LIMIT @limit
            """, new { loopId, from, to, limit });
        return rows.Select(r => (object)new
        {
            role = (string)r.signal_role, deviceId = (string)r.device_id, bindingId = (string)r.binding_id,
            from = (DateTime)r.from_at, to = (DateTime?)r.to_at, eligibility = (string)r.eligibility,
            descriptiveEligibility = (string)r.descriptive_eligibility, reason = (string)r.reason,
            healthStateId = (string)r.health_state_id, activeFlags = (string[])r.active_flags,
            collectionState = (string)r.collection_state, measurementImpact = (string)r.measurement_impact,
            revision = (int)r.interval_revision, emittedAt = (DateTime)r.emitted_at,
        }).ToList();
    }
}
