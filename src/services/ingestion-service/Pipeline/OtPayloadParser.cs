using System.Globalization;
using System.Text.Json;

namespace Traverse.IngestionService.Pipeline;

/// <summary>The gateway's per-leaf JSON envelope (docs/ot-data-integration/09 §3).</summary>
public sealed record OtLoopPayload(
    double? NumericValue, string? RawValue, string? Unit, string Quality, long TsMs,
    string? Source, long Seq, string? Device, string? Area, string? Line, string? Site,
    string? ProcessUnit, string? Equipment, string? Item);

/// <summary>Dead-letter reason codes (docs/ot-data-integration/09 §5).</summary>
public static class DlqReasons
{
    public const string MalformedJson = "MALFORMED_JSON";
    public const string MissingField = "MISSING_FIELD";
    public const string BadTimestamp = "BAD_TIMESTAMP";
    public const string FutureTimestamp = "FUTURE_TIMESTAMP";
    public const string TopicShapeMismatch = "TOPIC_SHAPE_MISMATCH";
    public const string LoopIdentityMismatch = "LOOP_IDENTITY_MISMATCH";
    public const string ParameterMismatch = "PARAMETER_MISMATCH";
    public const string LoopNotRegistered = "LOOP_NOT_REGISTERED";
    public const string UnknownParameter = "UNKNOWN_PARAMETER";
}

public static class OtPayloadParser
{
    /// <summary>Returns null with a DlqReasons code when the message must be dead-lettered.
    /// A non-numeric value is NOT rejected here — the role mapper decides whether the
    /// role requires a number (MODE legitimately arrives as a string on some gateways).</summary>
    public static OtLoopPayload? Parse(byte[] body, long nowMs, int futureSkewMaxSeconds,
        out string? reason, out string? detail)
    {
        reason = null; detail = null;
        JsonDocument doc;
        try { doc = JsonDocument.Parse(body); }
        catch (JsonException ex) { reason = DlqReasons.MalformedJson; detail = ex.Message; return null; }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                reason = DlqReasons.MalformedJson; detail = "payload is not a JSON object";
                return null;
            }

            if (!root.TryGetProperty("value", out var valueEl))
            { reason = DlqReasons.MissingField; detail = "value"; return null; }
            double? numeric = valueEl.ValueKind switch
            {
                JsonValueKind.Number => valueEl.GetDouble(),
                JsonValueKind.True => 1.0,
                JsonValueKind.False => 0.0,
                JsonValueKind.String when double.TryParse(valueEl.GetString(),
                    NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
                _ => null,
            };
            var raw = valueEl.ValueKind == JsonValueKind.String ? valueEl.GetString() : valueEl.GetRawText();

            if (!root.TryGetProperty("ts", out var tsEl))
            { reason = DlqReasons.MissingField; detail = "ts"; return null; }
            long tsMs;
            if (tsEl.ValueKind == JsonValueKind.Number && tsEl.TryGetInt64(out var epoch))
                tsMs = epoch;
            else if (tsEl.ValueKind == JsonValueKind.String &&
                     DateTimeOffset.TryParse(tsEl.GetString(), CultureInfo.InvariantCulture,
                         DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dto))
                tsMs = dto.ToUnixTimeMilliseconds();
            else
            { reason = DlqReasons.BadTimestamp; detail = tsEl.GetRawText(); return null; }

            if (tsMs > nowMs + futureSkewMaxSeconds * 1000L)
            {
                reason = DlqReasons.FutureTimestamp;
                detail = $"ts {tsMs} beyond +{futureSkewMaxSeconds}s of {nowMs}";
                return null;
            }

            static string? Str(JsonElement r, string name) =>
                r.TryGetProperty(name, out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;

            var seq = root.TryGetProperty("seq", out var seqEl) &&
                      seqEl.ValueKind == JsonValueKind.Number && seqEl.TryGetInt64(out var sq) ? sq : 0;

            return new OtLoopPayload(numeric, raw, Str(root, "unit"), Str(root, "quality") ?? "GOOD",
                tsMs, Str(root, "source"), seq, Str(root, "device"), Str(root, "area"), Str(root, "line"),
                Str(root, "site"), Str(root, "process_unit"), Str(root, "equipment"), Str(root, "item"));
        }
    }
}
