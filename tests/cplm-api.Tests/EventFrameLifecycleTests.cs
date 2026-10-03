// v2.5 Task 1F.1 (spec v6 R10; NR-029, NR-030) — the event-frame lifecycle as a pure function.
//
// The defect: EXCLUDED_* / INSUFFICIENT_* / NO_CALL results CLOSED an open episode, so a loop
// whose data went bad "recovered" on paper. Now: missing evidence marks the frame UNOBSERVABLE
// and leaves the condition OPEN; only an evaluable, fault-free result with enough qualified
// support closes it; and overlapping windows add only their non-overlapping support, so a
// sliding 24h window reported every 15 min cannot inflate persistence (NR-029).
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EventFrameLifecycleTests
{
    private static readonly DateTime T0 = new(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc);
    private const long Day = 24L * 3600 * 1000;

    private static GateVerdict Verdict(string diagnosis, double confidence, DateTime start, DateTime end,
        long? supportMs = null, double recoverySupportS = 21600, string? severity = "HIGH") =>
        new("FIC101", "24h", diagnosis, confidence, severity, start, end,
            supportMs ?? (long)(end - start).TotalMilliseconds, recoverySupportS, 1, "3.0.0", "2.0.0");

    private static FrameState OpenFrame(string family = "OSCILLATION", int windowCount = 1) =>
        new(family, T0, null, "SUSPECTED_" + family, 0.8, "SUSPECTED_" + family, 0.8, "HIGH", windowCount,
            "OBSERVED", "OPEN", Day, T0.AddDays(1), 1);

    [Fact]
    public void Classify_separates_fault_from_clear_from_unobservable()
    {
        EventFrameLifecycle.Classify("CONFIRMED_OSCILLATION").Should().Be(ResultClass.Fault);
        EventFrameLifecycle.Classify("DETECTED_FINAL_ELEMENT_NONLINEARITY").Should().Be(ResultClass.Fault);
        EventFrameLifecycle.Classify("INSUFFICIENT_EVIDENCE").Should().Be(ResultClass.Clear);
        EventFrameLifecycle.Classify("NO_CALL").Should().Be(ResultClass.Clear);
        EventFrameLifecycle.Classify("EXCLUDED_MODE").Should().Be(ResultClass.Unobservable);
        EventFrameLifecycle.Classify("EXCLUDED_DATA_QUALITY").Should().Be(ResultClass.Unobservable);
        EventFrameLifecycle.Classify("INSUFFICIENT_DATA").Should().Be(ResultClass.Unobservable);
        EventFrameLifecycle.Classify(null).Should().Be(ResultClass.Unobservable);
        EventFrameLifecycle.FamilyOf("CLASSIFIED_EXCESSIVE_EFFORT").Should().Be("EXCESSIVE_EFFORT");
    }

    [Fact]
    public void Missing_evidence_marks_the_frame_unobservable_and_never_closes_it()
    {
        var t = EventFrameLifecycle.Apply(OpenFrame(), Verdict("EXCLUDED_DATA_QUALITY", 0, T0.AddDays(1), T0.AddDays(2)));
        t.Kind.Should().Be(TransitionKind.MarkUnobservable);
        t.Frame!.ConditionState.Should().Be("OPEN");
        t.Frame.ClosedAt.Should().BeNull();
        t.Frame.AvailabilityState.Should().Be("UNOBSERVABLE");
        t.Frame.LastDiagnosis.Should().Be("EXCLUDED_DATA_QUALITY");
        t.Frame.PeakDiagnosis.Should().Be("SUSPECTED_OSCILLATION");      // untouched
        t.Frame.WindowCount.Should().Be(1);                               // no support added
    }

    [Fact]
    public void Missing_evidence_with_no_open_frame_is_ignored()
    {
        EventFrameLifecycle.Apply(null, Verdict("INSUFFICIENT_DATA", 0, T0, T0.AddDays(1))).Kind.Should().Be(TransitionKind.Ignore);
        EventFrameLifecycle.Apply(null, Verdict("INSUFFICIENT_EVIDENCE", 0, T0, T0.AddDays(1))).Kind.Should().Be(TransitionKind.Ignore);
    }

    [Fact]
    public void Evidence_returning_restores_observed_availability()
    {
        var frame = OpenFrame() with { AvailabilityState = "UNOBSERVABLE" };
        var t = EventFrameLifecycle.Apply(frame, Verdict("SUSPECTED_OSCILLATION", 0.7, T0.AddDays(1), T0.AddDays(2)));
        t.Kind.Should().Be(TransitionKind.Extend);
        t.Frame!.AvailabilityState.Should().Be("OBSERVED");
    }

    [Fact]
    public void An_overlapping_window_adds_only_its_new_support_and_does_not_bump_the_count()
    {
        // frame covers [T0, T0+24h); a sliding 24h window ending 15 min later overlaps 23h45m
        var start = T0.AddMinutes(15); var end = T0.AddDays(1).AddMinutes(15);
        var t = EventFrameLifecycle.Apply(OpenFrame(), Verdict("SUSPECTED_OSCILLATION", 0.85, start, end));
        t.Kind.Should().Be(TransitionKind.Extend);
        t.Frame!.WindowCount.Should().Be(1);
        t.Frame.QualifiedSupportMs.Should().Be(Day + 15 * 60 * 1000);
        t.Frame.SupportUntil.Should().Be(end);
    }

    [Fact]
    public void A_disjoint_window_bumps_the_count_and_adds_its_whole_support()
    {
        var t = EventFrameLifecycle.Apply(OpenFrame(), Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2)));
        t.Frame!.WindowCount.Should().Be(2);
        t.Frame.QualifiedSupportMs.Should().Be(2 * Day);
    }

    [Fact]
    public void Peak_only_ratchets_upward_while_last_tracks_the_newest_result()
    {
        var t = EventFrameLifecycle.Apply(OpenFrame(), Verdict("DETECTED_OSCILLATION", 0.5, T0.AddDays(1), T0.AddDays(2)));
        t.Frame!.PeakDiagnosis.Should().Be("SUSPECTED_OSCILLATION");
        t.Frame.PeakConfidence.Should().Be(0.8);
        t.Frame.LastDiagnosis.Should().Be("DETECTED_OSCILLATION");
        t.Frame.LastConfidence.Should().Be(0.5);

        var up = EventFrameLifecycle.Apply(t.Frame, Verdict("CONFIRMED_OSCILLATION", 0.95, T0.AddDays(2), T0.AddDays(3)));
        up.Frame!.PeakDiagnosis.Should().Be("CONFIRMED_OSCILLATION");
        up.Frame.PeakConfidence.Should().Be(0.95);
    }

    [Fact]
    public void A_clear_result_without_enough_qualified_support_keeps_the_condition_open()
    {
        // 24h window but only 2 h of qualified samples; recovery needs 6 h
        var t = EventFrameLifecycle.Apply(OpenFrame(),
            Verdict("INSUFFICIENT_EVIDENCE", 0, T0.AddDays(1), T0.AddDays(2), supportMs: 2L * 3600 * 1000, recoverySupportS: 21600));
        t.Kind.Should().Be(TransitionKind.Observe);
        t.Frame!.ConditionState.Should().Be("OPEN");
        t.Frame.AvailabilityState.Should().Be("OBSERVED");
        t.Frame.LastDiagnosis.Should().Be("INSUFFICIENT_EVIDENCE");
        t.Reason.Should().Be("CLEAR_INSUFFICIENT_SUPPORT");
    }

    [Fact]
    public void A_clear_result_with_enough_qualified_support_closes_the_condition()
    {
        var end = T0.AddDays(2);
        var t = EventFrameLifecycle.Apply(OpenFrame(),
            Verdict("INSUFFICIENT_EVIDENCE", 0, T0.AddDays(1), end, supportMs: 20L * 3600 * 1000, recoverySupportS: 21600));
        t.Kind.Should().Be(TransitionKind.Close);
        t.Frame!.ConditionState.Should().Be("CLOSED");
        t.Frame.ClosedAt.Should().Be(end);
        t.Frame.CloseReason.Should().Be("RECOVERED");
        t.Frame.AvailabilityState.Should().Be("OBSERVED");
    }

    [Fact]
    public void A_pre_v25_payload_with_no_recovery_threshold_closes_on_any_evaluable_clear_result()
    {
        var t = EventFrameLifecycle.Apply(OpenFrame(),
            Verdict("INSUFFICIENT_EVIDENCE", 0, T0.AddDays(1), T0.AddDays(2), supportMs: 60_000, recoverySupportS: 0));
        t.Kind.Should().Be(TransitionKind.Close);
    }

    [Fact]
    public void A_different_family_becomes_a_candidate_and_does_not_close_the_frame()
    {
        // CHG-034: Marun flipped fault families window to window (348 FAMILY_CHANGED closes a day); a new family must hold
        // for FamilyChangeWindows consecutive windows before the episode changes hands
        var end = T0.AddDays(2);
        var t = EventFrameLifecycle.Apply(OpenFrame("OSCILLATION"), Verdict("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", 0.8, T0.AddDays(1), end));
        t.Kind.Should().Be(TransitionKind.Extend);
        t.Reason.Should().Be("FAMILY_CANDIDATE");
        t.Closed.Should().BeNull();
        t.Frame!.Family.Should().Be("OSCILLATION");
        t.Frame.ConditionState.Should().Be("OPEN");
        t.Frame.CandidateFamily.Should().Be("FINAL_ELEMENT_NONLINEARITY");
        t.Frame.CandidateWindows.Should().Be(1);
        t.Frame.LastDiagnosis.Should().Be("SUSPECTED_FINAL_ELEMENT_NONLINEARITY");
    }

    [Fact]
    public void The_candidate_family_takes_over_after_three_consecutive_windows()
    {
        var end = T0.AddDays(2);
        var open = OpenFrame("OSCILLATION") with { CandidateFamily = "FINAL_ELEMENT_NONLINEARITY", CandidateWindows = 2 };
        var t = EventFrameLifecycle.Apply(open, Verdict("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", 0.8, T0.AddDays(1), end));
        t.Kind.Should().Be(TransitionKind.CloseAndOpen);
        t.Closed!.ConditionState.Should().Be("CLOSED");
        t.Closed.CloseReason.Should().Be("FAMILY_CHANGED");
        t.Closed.ClosedAt.Should().Be(end);
        t.Frame!.Family.Should().Be("FINAL_ELEMENT_NONLINEARITY");
        t.Frame.WindowCount.Should().Be(1);
        t.Frame.OpenedAt.Should().Be(end);
        t.Frame.CandidateFamily.Should().BeNull();
        t.Frame.CandidateWindows.Should().Be(0);
        t.Closed.CandidateFamily.Should().BeNull();        // review L4: a closed row carries no stale candidate
        t.Closed.CandidateWindows.Should().Be(0);
    }

    [Fact]
    public void A_fault_with_no_open_frame_opens_one_with_the_windows_support()
    {
        var t = EventFrameLifecycle.Apply(null, Verdict("DETECTED_EXCESSIVE_EFFORT", 0.5, T0, T0.AddDays(1)));
        t.Kind.Should().Be(TransitionKind.Open);
        t.Frame!.Family.Should().Be("EXCESSIVE_EFFORT");
        t.Frame.QualifiedSupportMs.Should().Be(Day);
        t.Frame.SupportUntil.Should().Be(T0.AddDays(1));
        t.Frame.ConditionState.Should().Be("OPEN");
        t.Frame.AvailabilityState.Should().Be("OBSERVED");
    }

    [Fact]
    public void A_severity_band_rising_on_an_open_frame_is_an_escalation()
    {
        // CHG-033: the material change an episode capture is taken on. LOW -> MEDIUM and MEDIUM -> HIGH escalate;
        // the frame state is exactly what Extend would have produced.
        var low = OpenFrame() with { Severity = "LOW" };
        var t = EventFrameLifecycle.Apply(low, Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "MEDIUM"));
        t.Kind.Should().Be(TransitionKind.Escalate);
        t.Reason.Should().Be("ESCALATED");
        t.Frame!.Severity.Should().Be("MEDIUM");
        t.Frame.WindowCount.Should().Be(2);
        t.Frame.ConditionState.Should().Be("OPEN");
        EventFrameLifecycle.Apply(OpenFrame() with { Severity = "MEDIUM" },
            Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "HIGH")).Kind.Should().Be(TransitionKind.Escalate);
        // a frame with no band yet: the first band is a rise
        EventFrameLifecycle.Apply(OpenFrame() with { Severity = null },
            Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "LOW")).Kind.Should().Be(TransitionKind.Escalate);
    }

    [Fact]
    public void A_band_holding_falling_or_missing_only_extends()
    {
        EventFrameLifecycle.Apply(OpenFrame(), Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "HIGH")).Kind.Should().Be(TransitionKind.Extend);
        EventFrameLifecycle.Apply(OpenFrame(), Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "LOW")).Kind.Should().Be(TransitionKind.Extend);
        EventFrameLifecycle.Apply(OpenFrame(), Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: null)).Kind.Should().Be(TransitionKind.Extend);
    }

    [Fact]
    public void A_settled_family_change_closes_and_opens_whatever_the_band_does()
    {
        var t = EventFrameLifecycle.Apply(OpenFrame() with { Severity = "LOW", CandidateFamily = "STICTION", CandidateWindows = 2 },
            Verdict("SUSPECTED_STICTION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "HIGH"));
        t.Kind.Should().Be(TransitionKind.CloseAndOpen);
    }

    [Fact]
    public void Returning_to_the_frames_own_family_resets_the_candidate()
    {
        var open = OpenFrame("OSCILLATION") with { CandidateFamily = "STICTION", CandidateWindows = 2 };
        var t = EventFrameLifecycle.Apply(open, Verdict("SUSPECTED_OSCILLATION", 0.85, T0.AddDays(1), T0.AddDays(2)));
        t.Kind.Should().Be(TransitionKind.Extend);
        t.Frame!.CandidateFamily.Should().BeNull();
        t.Frame.CandidateWindows.Should().Be(0);
    }

    [Fact]
    public void A_third_family_restarts_the_candidate_count()
    {
        var open = OpenFrame("OSCILLATION") with { CandidateFamily = "STICTION", CandidateWindows = 2 };
        var t = EventFrameLifecycle.Apply(open, Verdict("SUSPECTED_TUNING", 0.85, T0.AddDays(1), T0.AddDays(2)));
        t.Kind.Should().Be(TransitionKind.Extend);
        t.Frame!.CandidateFamily.Should().Be("TUNING");
        t.Frame.CandidateWindows.Should().Be(1);
    }

    [Fact]
    public void A_candidate_window_never_escalates_nor_moves_the_severity()
    {
        // review M2: only the episode's own family may escalate; a family the lifecycle does not yet believe must not
        // flap the operator-facing severity or spend an ESCALATE capture
        var open = OpenFrame("OSCILLATION") with { Severity = "LOW" };
        var t = EventFrameLifecycle.Apply(open, Verdict("SUSPECTED_STICTION", 0.85, T0.AddDays(1), T0.AddDays(2), severity: "HIGH"));
        t.Kind.Should().Be(TransitionKind.Extend);
        t.Reason.Should().Be("FAMILY_CANDIDATE");
        t.Frame!.Severity.Should().Be("LOW");
        t.Frame.CandidateFamily.Should().Be("STICTION");
    }

    [Fact]
    public void Unjudged_windows_neither_count_nor_reset_the_candidate()
    {
        // review L1: a data gap between two STICTION windows must not make the change of family start over
        var open = OpenFrame("OSCILLATION") with { CandidateFamily = "STICTION", CandidateWindows = 2 };
        var u = EventFrameLifecycle.Apply(open, Verdict("EXCLUDED_DATA_QUALITY", 0, T0.AddDays(1), T0.AddDays(2)));
        u.Kind.Should().Be(TransitionKind.MarkUnobservable);
        u.Frame!.CandidateFamily.Should().Be("STICTION");
        u.Frame.CandidateWindows.Should().Be(2);
        var o = EventFrameLifecycle.Apply(open, Verdict("INSUFFICIENT_EVIDENCE", 0, T0.AddDays(1), T0.AddDays(2), supportMs: 1000, recoverySupportS: 21600));
        o.Kind.Should().Be(TransitionKind.Observe);
        o.Frame!.CandidateWindows.Should().Be(2);
    }

    [Fact]
    public void A_verdict_carries_its_method_run_ids_optionally()
    {
        // CHG-033: the fused verdict's run ids are what a transition captures; pre-v2.5 payloads have none.
        Verdict("SUSPECTED_OSCILLATION", 0.85, T0, T0.AddDays(1)).MethodRunIds.Should().BeNull();
        var id = Guid.NewGuid();
        var v = Verdict("SUSPECTED_OSCILLATION", 0.85, T0, T0.AddDays(1)) with { MethodRunIds = new[] { id } };
        v.MethodRunIds.Should().ContainSingle().Which.Should().Be(id);
    }
}
