namespace Traverse.CplmApi.Services;

/// <summary>Where a referenced column comes from in the loop's raw historian device.</summary>
public static class TraceSource
{
    /// <summary>The sample timestamps (ms epoch) as f64.</summary>
    public const string Time = "time";
    public const string Pv = "pv";
    public const string Op = "op";
    /// <summary>The measurements every trace query selects: the row set of a select is the union of the non-null
    /// rows of what it selects, so the archive and the read always ask for exactly this list.</summary>
    public static readonly string[] Query = { "pv", "op", "vp" };
}

/// <summary>
/// CHG-102 Phase 5b-2 — which evidence columns are exact copies of the loop's raw historian samples, so the boundary
/// archive may store a verified reference to the historian instead of the bytes. Derived columns (detrended, tracking
/// error, flags, validity, turning angle, ...) are never listed and always stay inline.
///
/// Every candidate is only a candidate: <see cref="EvidenceTraceReferencer"/> compares it bit for bit with the historian
/// and keeps it inline on any difference, so a wrong entry here costs bytes, never correctness.
///
/// Source (src/flink/src/main/java/com/ams/flink/cplm/...):
///   * the long tier's window samples: <c>engine/LongDiagnosticsCalculator.java:73</c> filterHalfOpen(raw, start, end) of
///     the normalized sample stream (the same Kafka samples ams-api RawLoopIotDbConsumer writes to IoTDB);
///     <c>:92</c> pv[i] = s.pv (raw); <c>:94</c> op[i] = profile.normalizeOp(s.op) - identity unless the loop declares
///     an OP range (<c>CplmLoopDynamicsProfile.java:242-246</c>), so op is raw only for most loops (verified per column);
///     <c>:227-229</c> tsMs[i] = s.eventTsMs.
///   * <c>evidence/ArtifactSupport.java:55-59</c> times(tsMs) = the f64 sample-time axis.
///   * G11 measurement  <c>evidence/LongArtifacts.java:275</c>: x = times(tsMs), y = k.pv.
///   * G9 corners       <c>LongArtifacts.java:232-233</c>: x = tsMs[i] (NaN past the axis - then it simply does not verify).
///   * G10 actuator_limits <c>LongArtifacts.java:245-252</c>: x = times(tsMs); u_requested = k.op; y = u_applied =
///     (vp finite ? vp : op) and the vp column is NaN everywhere because LongIntermediates.vp is never assigned
///     (<c>engine/LongIntermediates.java:19</c>), so y is k.op as well and the vp column is NOT a raw copy (not listed).
///   * G5 preprocessed_signal <c>LongArtifacts.java:109-110</c>: x = times(tsMs); y is detrended (inline).
/// Not listed: G9 cycle_polygon (pv / op slices addressed by sample index, <c>LongArtifacts.java:201-211</c>; small),
/// the fusion artifacts (<c>FusionArtifacts.java</c>: intervals and records, no per-sample raw column) and the short
/// tier (never in a boundary set).
/// </summary>
public static class EvidenceTraceMap
{
    private static readonly Dictionary<(string Gate, string Kind), (string Column, string Source)[]> Map = new()
    {
        [("G11", "measurement")] = new[] { ("x", TraceSource.Time), ("y", TraceSource.Pv) },
        [("G9", "corners")] = new[] { ("x", TraceSource.Time) },
        [("G10", "actuator_limits")] = new[] { ("x", TraceSource.Time), ("y", TraceSource.Op), ("u_requested", TraceSource.Op) },
        [("G5", "preprocessed_signal")] = new[] { ("x", TraceSource.Time) },
    };

    /// <summary>The candidate (column, source) pairs of an artifact; empty when it has none or its x axis is not sample time.</summary>
    public static IReadOnlyList<(string Column, string Source)> Candidates(ArchivedManifest m, IReadOnlyList<string> columns)
    {
        if (m.XQuantity != "sample_time" || m.XUnit != "ms_epoch" || m.Encoding != "f64le+gzip") return Array.Empty<(string, string)>();
        if (!Map.TryGetValue((m.GateId, m.ArtifactKind), out var list)) return Array.Empty<(string, string)>();
        return list.Where(c => columns.Contains(c.Column)).ToArray();
    }
}
