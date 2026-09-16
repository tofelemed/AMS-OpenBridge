using System.Text.Json;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// One role's observation inside the samples tuple's <c>roles{}</c> block (schema 1.1,
/// spec v6 R03/C02). The tuple's top-level pv/sp/op/vp/mode/quality/event_ts_ms are the
/// frozen 1.0 contract; this block is where per-role fidelity lives:
/// <list type="bullet">
/// <item><c>sample_ts_ms</c> — the source (OT) timestamp of THIS role's value.</item>
/// <item><c>verified_ts_ms</c> — when the source last confirmed the value. A change
/// publication is a verification, so today this equals sample_ts_ms; a future source that
/// re-reads unchanged values may advance it without moving sample_ts_ms.</item>
/// <item><c>held</c> — the value was carried forward from a previous tick (RBE hold).</item>
/// <item><c>age_ms</c> — tuple event time minus sample time, so a stale VP next to a fresh
/// PV is visible without comparing timestamps.</item>
/// <item><c>quality</c> — the normalised verdict for THIS role; <c>quality_native</c> the
/// source's own quality token, untouched.</item>
/// </list>
/// </summary>
public sealed record RoleObservation(
    double? Value,
    string? StringValue,
    long SampleTsMs,
    long VerifiedTsMs,
    string QualityNative,
    string Quality,
    string? Unit,
    bool Held,
    long AgeMs,
    /// <summary>MODE only: the source token before mode_value_map translation.</summary>
    string? ModeNative = null,
    /// <summary>The protocol the native token was decoded under (v2.5 R04); RESTORED for
    /// members that came back from the state store and have not republished.</summary>
    string QualityProtocol = "STRING_ENUM")
{
    public void WriteTo(Utf8JsonWriter w, string role)
    {
        w.WriteStartObject(role);
        if (Value is { } v) w.WriteNumber("value", v);
        else if (StringValue is not null) w.WriteString("value", StringValue);
        else w.WriteNull("value");
        if (ModeNative is not null) w.WriteString("mode_native", ModeNative);
        w.WriteNumber("sample_ts_ms", SampleTsMs);
        w.WriteNumber("verified_ts_ms", VerifiedTsMs);
        w.WriteString("quality_native", QualityNative);
        w.WriteString("quality_protocol", QualityProtocol);
        w.WriteString("quality", Quality);
        if (Unit is not null) w.WriteString("unit", Unit);
        w.WriteBoolean("held", Held);
        w.WriteNumber("age_ms", AgeMs);
        w.WriteEndObject();
    }
}
