namespace Traverse.CplmApi.Services;

/// <summary>How a gate verdict relates to an episode.</summary>
public enum ResultClass
{
    /// <summary>A banded fault verdict (DETECTED_/CLASSIFIED_/SUSPECTED_/CONFIRMED_ family).</summary>
    Fault,
    /// <summary>An EVALUABLE window in which no fault family qualified (INSUFFICIENT_EVIDENCE, NO_CALL).</summary>
    Clear,
    /// <summary>The window could not be judged (EXCLUDED_*, INSUFFICIENT_DATA, no diagnosis).</summary>
    Unobservable,
}

/// <summary>CHG-033: Escalate = an Extend whose severity band rose (LOW &lt; MEDIUM &lt; HIGH) - the material change an evidence capture is taken on.</summary>
public enum TransitionKind { Ignore, Open, Extend, Observe, MarkUnobservable, Close, CloseAndOpen, Escalate }

/// <summary>The durable state of one episode row (analytics.cplm_event_frames).</summary>
public sealed record FrameState(
    string Family,
    DateTime OpenedAt,
    DateTime? ClosedAt,
    string PeakDiagnosis,
    double PeakConfidence,
    string? LastDiagnosis,
    double? LastConfidence,
    string? Severity,
    int WindowCount,
    /// <summary>OBSERVED | UNOBSERVABLE — whether the newest result could judge the loop at all.</summary>
    string AvailabilityState,
    /// <summary>OPEN | CLOSED — whether the condition is still standing.</summary>
    string ConditionState,
    /// <summary>Union of the qualified support the episode rests on, in ms (overlaps counted once).</summary>
    long QualifiedSupportMs,
    /// <summary>End of the support covered so far; a window starting at or after it is a new, disjoint window.</summary>
    DateTime? SupportUntil,
    int ResultRevision,
    string? CloseReason = null,
    /// <summary>CHG-034: a fault family seen instead of ours, not yet settled; it takes over after FamilyChangeWindows consecutive windows.</summary>
    string? CandidateFamily = null,
    int CandidateWindows = 0);

/// <summary>What the lifecycle needs from one fused verdict.</summary>
public sealed record GateVerdict(
    string LoopId,
    string WindowKind,
    string? Diagnosis,
    double Confidence,
    string? Severity,
    DateTime WindowStart,
    DateTime WindowEnd,
    /// <summary>The support this result actually rests on (accepted samples × period, bounded by the window).</summary>
    long QualifiedSupportMs,
    /// <summary>Seconds of qualified support a contrary result needs before it may close an episode; 0 = legacy (any).</summary>
    double RecoverySupportS,
    int ResultRevision,
    string? CalculationVersion,
    string? DynamicsProfileVersion,
    /// <summary>CHG-033: the fused verdict's method runs (every gate); what a transition captures. Null on pre-v2.5 payloads.</summary>
    IReadOnlyList<Guid>? MethodRunIds = null);

public sealed record Transition(TransitionKind Kind, FrameState? Frame, string Reason, FrameState? Closed = null);

/// <summary>
/// v2.5 Task 1F.1 (spec v6 R10; NR-029, NR-030) — the event-frame lifecycle as a pure function
/// of (open frame, verdict). Frames are keyed on the fault FAMILY: DETECTED → SUSPECTED →
/// CONFIRMED of one family is one episode whose confidence grew.
///
/// Availability and condition are tracked SEPARATELY: a window the engine could not judge
/// (EXCLUDED_*, INSUFFICIENT_DATA) marks the frame UNOBSERVABLE and leaves the condition OPEN —
/// a loop whose data went bad has not recovered. Only an evaluable, fault-free result resting
/// on at least <see cref="GateVerdict.RecoverySupportS"/> of qualified support closes it.
/// Overlapping windows add only their non-overlapping support and do not bump the window
/// count, so a sliding window reported every 15 minutes cannot inflate persistence.
/// </summary>
public static class EventFrameLifecycle
{
    /// <summary>CHG-034: consecutive windows a different fault family must hold before the episode changes hands (Marun flipped
    /// families window to window: 348 FAMILY_CHANGED closes a day, each one an evidence capture). 3 windows = 45 minutes.
    /// Consecutive FAULT windows: an unjudged window (EXCLUDED_*, INSUFFICIENT_DATA) or a clear one without enough
    /// support neither counts nor resets the candidate; only the episode's own family resets it.</summary>
    public const int FamilyChangeWindows = 3;

    public static ResultClass Classify(string? diagnosis)
    {
        if (string.IsNullOrWhiteSpace(diagnosis)) return ResultClass.Unobservable;
        if (diagnosis.StartsWith("EXCLUDED", StringComparison.Ordinal) || diagnosis == "INSUFFICIENT_DATA")
            return ResultClass.Unobservable;
        if (diagnosis is "INSUFFICIENT_EVIDENCE" or "NO_CALL") return ResultClass.Clear;
        return ResultClass.Fault;
    }

    /// <summary>Strips the DETECTED_/CLASSIFIED_/SUSPECTED_/CONFIRMED_ band prefix, leaving the fault family.</summary>
    public static string FamilyOf(string diagnosis)
    {
        foreach (var band in new[] { "CONFIRMED_", "SUSPECTED_", "DETECTED_", "CLASSIFIED_" })
            if (diagnosis.StartsWith(band, StringComparison.Ordinal))
                return diagnosis[band.Length..];
        return diagnosis;
    }

    /// <summary>CHG-033: LOW &lt; MEDIUM &lt; HIGH; null or an unknown band ranks lowest.</summary>
    public static int BandRank(string? severity) =>
        severity?.Trim().ToUpperInvariant() switch { "LOW" => 1, "MEDIUM" => 2, "HIGH" => 3, _ => 0 };

    public static Transition Apply(FrameState? open, GateVerdict v) => Apply(open, v, FamilyChangeWindows);

    public static Transition Apply(FrameState? open, GateVerdict v, int familyChangeWindows)
    {
        var cls = Classify(v.Diagnosis);
        switch (cls)
        {
            case ResultClass.Unobservable:
                if (open is null) return new Transition(TransitionKind.Ignore, null, "NO_OPEN_FRAME");
                return new Transition(TransitionKind.MarkUnobservable, open with
                {
                    AvailabilityState = "UNOBSERVABLE",
                    LastDiagnosis = v.Diagnosis,
                    LastConfidence = v.Confidence,
                    ResultRevision = v.ResultRevision,
                }, "EVIDENCE_MISSING");

            case ResultClass.Clear:
            {
                if (open is null) return new Transition(TransitionKind.Ignore, null, "NO_OPEN_FRAME");
                bool enough = v.QualifiedSupportMs >= (long)(v.RecoverySupportS * 1000.0);
                if (!enough)
                {
                    return new Transition(TransitionKind.Observe, open with
                    {
                        AvailabilityState = "OBSERVED",
                        LastDiagnosis = v.Diagnosis,
                        LastConfidence = v.Confidence,
                        ResultRevision = v.ResultRevision,
                    }, "CLEAR_INSUFFICIENT_SUPPORT");
                }
                return new Transition(TransitionKind.Close, Close(open, v, "RECOVERED"), "RECOVERED");
            }

            default:
            {
                var family = FamilyOf(v.Diagnosis!);
                if (open is null)
                    return new Transition(TransitionKind.Open, Open(family, v), "OPENED");
                var kind = BandRank(v.Severity) > BandRank(open.Severity) ? TransitionKind.Escalate : TransitionKind.Extend;
                if (open.Family != family)
                {
                    // CHG-034: a different family is a candidate until it has held for familyChangeWindows windows in a row
                    var held = open.CandidateFamily == family ? open.CandidateWindows + 1 : 1;
                    if (held >= Math.Max(1, familyChangeWindows))
                        return new Transition(TransitionKind.CloseAndOpen, Open(family, v), "FAMILY_CHANGED",
                            Closed: Close(open, v, "FAMILY_CHANGED"));
                    // the episode's own family alone may escalate or move its severity: a family not yet believed does neither
                    var pending = Extend(open, v, peakEligible: false) with { CandidateFamily = family, CandidateWindows = held, Severity = open.Severity };
                    return new Transition(TransitionKind.Extend, pending, "FAMILY_CANDIDATE");
                }
                var extended = Extend(open, v, peakEligible: true) with { CandidateFamily = null, CandidateWindows = 0 };
                return new Transition(kind, extended, kind == TransitionKind.Escalate ? "ESCALATED" : "EXTENDED");
            }
        }
    }

    private static FrameState Open(string family, GateVerdict v) => new(
        family, v.WindowEnd, null, v.Diagnosis!, v.Confidence, v.Diagnosis, v.Confidence, v.Severity, 1,
        "OBSERVED", "OPEN", Math.Max(0, v.QualifiedSupportMs), v.WindowEnd, v.ResultRevision);

    private static FrameState Close(FrameState open, GateVerdict v, string reason) => open with
    {
        ClosedAt = v.WindowEnd,
        ConditionState = "CLOSED",
        AvailabilityState = "OBSERVED",
        LastDiagnosis = v.Diagnosis,
        LastConfidence = v.Confidence,
        ResultRevision = v.ResultRevision,
        CloseReason = reason,
        CandidateFamily = null,
        CandidateWindows = 0,
    };

    private static FrameState Extend(FrameState open, GateVerdict v, bool peakEligible = true)
    {
        // Support union: only the part of this window past what the episode already covers.
        var coveredUntil = open.SupportUntil ?? v.WindowStart;
        var newFrom = v.WindowStart > coveredUntil ? v.WindowStart : coveredUntil;
        long added = v.WindowEnd > newFrom ? (long)(v.WindowEnd - newFrom).TotalMilliseconds : 0;
        // A window's own support may be less than its span (rejected samples): scale the addition.
        double spanMs = Math.Max(1, (v.WindowEnd - v.WindowStart).TotalMilliseconds);
        double fraction = Math.Min(1.0, Math.Max(0.0, v.QualifiedSupportMs / spanMs));
        added = (long)Math.Round(added * fraction);
        bool disjoint = open.SupportUntil is null || v.WindowStart >= open.SupportUntil;
        bool peakUp = peakEligible && v.Confidence > open.PeakConfidence;   // a candidate family's verdict never becomes this episode's peak
        return open with
        {
            PeakDiagnosis = peakUp ? v.Diagnosis! : open.PeakDiagnosis,
            PeakConfidence = peakUp ? v.Confidence : open.PeakConfidence,
            LastDiagnosis = v.Diagnosis,
            LastConfidence = v.Confidence,
            Severity = v.Severity ?? open.Severity,
            WindowCount = open.WindowCount + (disjoint ? 1 : 0),
            AvailabilityState = "OBSERVED",
            ConditionState = "OPEN",
            QualifiedSupportMs = open.QualifiedSupportMs + added,
            SupportUntil = open.SupportUntil is null || v.WindowEnd > open.SupportUntil ? v.WindowEnd : open.SupportUntil,
            ResultRevision = v.ResultRevision,
        };
    }
}
