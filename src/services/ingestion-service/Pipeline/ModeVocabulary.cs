namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// The mode vocabulary the CPLM engine understands, mirrored here so ingestion can
/// tell — at the moment it maps a MODE — whether the value it is about to publish
/// will mean anything downstream.
///
/// Why this exists: the engine's <c>isAutoMode()</c> is binary. Anything it does not
/// recognise is simply "not auto", so a wrong or missing <c>mode_value_map</c> does not
/// error — it silently marks every sample manual and G1 excludes the whole window.
/// That is exactly what happened on the HDPE plant (2026-09-09): the map named CENTUM
/// value 4 as AUT while 1 was the controlling mode, so the entire fleet was excluded
/// while G0 stayed green and the data looked perfectly healthy. Nothing in the chain
/// said a word. This class is the missing word.
///
/// Keep in sync with CplmNormalizedSample.AUTO_MODE_TOKENS / MANUAL_MODE_TOKENS
/// (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java).
/// </summary>
public static class ModeVocabulary
{
    private static readonly HashSet<string> Auto = new(StringComparer.Ordinal)
    {
        "AUTO", "AUT", "A", "AUTOMATIC", "NORMAL", "NORM",
        "CAS", "CASC", "CASCADE", "RSP", "DDC", "SUP", "SUPERVISORY",
    };

    private static readonly HashSet<string> Manual = new(StringComparer.Ordinal)
    {
        "MAN", "MANUAL", "M", "IMAN", "ROUT", "LO", "LOCAL", "OFF", "TRACK",
    };

    /// <summary>
    /// False when the engine would fall through to its substring fallback and treat the
    /// value as not-auto by default rather than by recognition — i.e. the loop will be
    /// excluded and nobody will be told why.
    /// </summary>
    public static bool IsRecognised(string? mode)
    {
        if (string.IsNullOrWhiteSpace(mode)) return false;
        var m = mode.Trim().ToUpperInvariant();
        if (m.Length == 0 || m == "UNKNOWN") return false;
        if (Manual.Contains(m) || Auto.Contains(m)) return true;
        // The engine's own compound-vendor-string fallback; recognised, if loosely.
        return m.Contains("AUTO", StringComparison.Ordinal)
            || m.Contains("CASCADE", StringComparison.Ordinal);
    }

    /// <summary>True when the engine will count this mode as closed-loop control.</summary>
    public static bool IsAuto(string? mode)
    {
        if (string.IsNullOrWhiteSpace(mode)) return false;
        var m = mode.Trim().ToUpperInvariant();
        if (m.Length == 0 || m == "UNKNOWN") return false;
        if (Manual.Contains(m)) return false;          // manual wins, as in the engine
        if (Auto.Contains(m)) return true;
        return m.Contains("AUTO", StringComparison.Ordinal)
            || m.Contains("CASCADE", StringComparison.Ordinal);
    }
}
