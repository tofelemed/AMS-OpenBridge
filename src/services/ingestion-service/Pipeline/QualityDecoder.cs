using System.Globalization;
using System.Text.Json;

namespace Traverse.IngestionService.Pipeline;

/// <summary>How a data source encodes quality (v2.5, spec v6 R04 / §1.4).</summary>
public enum QualityProtocol
{
    /// <summary>Exact tokens GOOD | UNCERTAIN | BAD (case-insensitive). The plant gateway's
    /// contract and the default: anything else — "goodish", "Good_NonSpecific", a number — is UNKNOWN.</summary>
    STRING_ENUM,
    /// <summary>OPC DA 8-bit quality word: bits 7-6 = 11 Good, 01 Uncertain, 00 Bad.</summary>
    OPC_DA,
    /// <summary>OPC UA 32-bit StatusCode: severity bits 31-30 = 00 Good, 01 Uncertain, 1x Bad.</summary>
    OPC_UA,
    /// <summary>Sparkplug B metric quality property: 192 Good, 500 Stale, 0 Bad.</summary>
    SPARKPLUG,
    /// <summary>The source declares no quality at all: every value is UNKNOWN.</summary>
    NONE,
}

/// <summary>The per-role verdict. UNKNOWN is a first-class answer, and it is not GOOD.</summary>
public enum NormalizedQuality { GOOD, UNCERTAIN, BAD, UNKNOWN }

/// <summary>
/// Decodes a source's native quality token under its DECLARED protocol only. An OPC DA
/// word is not decoded by applying its thresholds to an OPC UA status code; a string
/// beginning with "g" is not a quality standard; a missing field is not GOOD. The native
/// token is always returned verbatim so the tuple can carry it beside the verdict.
/// </summary>
public static class QualityDecoder
{
    public const string ReasonMissing = "QUALITY_MISSING";

    public static bool TryParseProtocol(string? text, out QualityProtocol protocol)
    {
        protocol = QualityProtocol.STRING_ENUM;
        if (string.IsNullOrWhiteSpace(text)) return false;
        return Enum.TryParse(text.Trim().ToUpperInvariant(), ignoreCase: false, out protocol)
               && Enum.IsDefined(protocol);
    }

    /// <summary>Decode a raw JSON quality element (number, string or absent).</summary>
    public static (NormalizedQuality Quality, string Native, string? Reason) Decode(QualityProtocol protocol, JsonElement? raw)
    {
        if (raw is null) return Decode(protocol, (string?)null);
        var el = raw.Value;
        var native = el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => el.GetRawText(),
        };
        return Decode(protocol, native);
    }

    /// <summary>Decode the native token (as the parser preserved it; null = absent).</summary>
    public static (NormalizedQuality Quality, string Native, string? Reason) Decode(QualityProtocol protocol, string? native)
    {
        if (native is null) return (NormalizedQuality.UNKNOWN, "", ReasonMissing);
        var token = native.Trim();
        if (token.Length == 0) return (NormalizedQuality.UNKNOWN, native, ReasonMissing);

        switch (protocol)
        {
            case QualityProtocol.NONE:
                return (NormalizedQuality.UNKNOWN, native, "PROTOCOL_NONE");

            case QualityProtocol.STRING_ENUM:
                if (TryInteger(token, out _)) return (NormalizedQuality.UNKNOWN, native, "NUMERIC_UNDER_STRING_ENUM");
                return token.ToUpperInvariant() switch
                {
                    "GOOD" => (NormalizedQuality.GOOD, native, null),
                    "UNCERTAIN" => (NormalizedQuality.UNCERTAIN, native, null),
                    "BAD" => (NormalizedQuality.BAD, native, null),
                    _ => (NormalizedQuality.UNKNOWN, native, "NOT_IN_STRING_VOCABULARY"),
                };

            case QualityProtocol.OPC_DA:
            {
                if (!TryInteger(token, out var code)) return (NormalizedQuality.UNKNOWN, native, "NOT_A_NUMBER_FOR_OPC_DA");
                if (code < 0 || code > 255) return (NormalizedQuality.UNKNOWN, native, "OUT_OF_RANGE_FOR_OPC_DA");
                return ((code & 0xC0) switch
                {
                    0xC0 => NormalizedQuality.GOOD,
                    0x40 => NormalizedQuality.UNCERTAIN,
                    0x00 => NormalizedQuality.BAD,
                    _ => NormalizedQuality.UNKNOWN,          // 0x80: reserved quality group
                }, native, (code & 0xC0) == 0x80 ? "RESERVED_OPC_DA_QUALITY" : null);
            }

            case QualityProtocol.OPC_UA:
            {
                if (!TryInteger(token, out var code)) return (NormalizedQuality.UNKNOWN, native, "NOT_A_NUMBER_FOR_OPC_UA");
                if (code < 0 || code > 0xFFFF_FFFFL) return (NormalizedQuality.UNKNOWN, native, "OUT_OF_RANGE_FOR_OPC_UA");
                var severity = (code >> 30) & 0x3;
                return (severity switch
                {
                    0 => NormalizedQuality.GOOD,
                    1 => NormalizedQuality.UNCERTAIN,
                    _ => NormalizedQuality.BAD,
                }, native, null);
            }

            case QualityProtocol.SPARKPLUG:
            {
                if (!TryInteger(token, out var code)) return (NormalizedQuality.UNKNOWN, native, "NOT_A_NUMBER_FOR_SPARKPLUG");
                return code switch
                {
                    192 => (NormalizedQuality.GOOD, native, null),
                    500 => (NormalizedQuality.UNCERTAIN, native, null),   // STALE
                    0 => (NormalizedQuality.BAD, native, null),
                    _ => (NormalizedQuality.UNKNOWN, native, "UNKNOWN_SPARKPLUG_CODE"),
                };
            }

            default:
                return (NormalizedQuality.UNKNOWN, native, "UNSUPPORTED_PROTOCOL");
        }
    }

    /// <summary>BAD > UNCERTAIN > UNKNOWN > GOOD. The 1.0 tuple field is the worst of pv/sp/op.</summary>
    public static NormalizedQuality WorstOf(NormalizedQuality a, NormalizedQuality b) => Rank(a) >= Rank(b) ? a : b;

    private static int Rank(NormalizedQuality q) => q switch
    {
        NormalizedQuality.BAD => 3,
        NormalizedQuality.UNCERTAIN => 2,
        NormalizedQuality.UNKNOWN => 1,
        _ => 0,
    };

    /// <summary>Validated integer parse: digits only (optional sign), no floats, no exponents.</summary>
    private static bool TryInteger(string token, out long value) =>
        long.TryParse(token, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out value);
}
