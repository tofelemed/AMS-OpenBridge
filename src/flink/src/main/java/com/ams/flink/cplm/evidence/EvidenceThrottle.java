package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;

/**
 * CHG-049: the long tier re-fires every 15 min over overlapping windows; emit at most once per interval.
 * CHG-102 phase 5a: the interval applies to a changed finding too (a flapping W,F,W,F gate emitted ~1.8 times
 * per loop per hour on the plant), and a window the policy skips forgets only the signature, never the time,
 * so a finding that returns inside the interval waits for it. A plant boundary (local 00:00 / 12:00) always emits.
 */
public final class EvidenceThrottle {
    private EvidenceThrottle() {}

    /**
     * CLEAR = the policy does not emit this window: forget its signature, KEEP its time; SKIP = throttled;
     * EMIT = output it as a finding; BOUNDARY = output it as the plant-boundary record, whatever the throttle says.
     */
    public enum Action { CLEAR, SKIP, EMIT, BOUNDARY }

    public static String signature(CplmLongDiagnosticsResult r) {
        return r.gate7Status + "|" + r.gate8Status + "|" + r.gate9Status + "|" + r.gate10Status + "|" + r.gate11Status;
    }

    /** CHG-049 (Task 10): the fusion tier throttles on the fused verdict, per window kind. */
    public static String signature(CplmGateResult r) {
        return r.diagnosis + "|" + r.selectedFamily + "|" + r.gate14Status + "|" + r.gate15Status;
    }

    /** CHG-102 5a: due when nothing was emitted yet or the interval has passed - a changed signature no longer bypasses it. */
    public static boolean due(String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) {
        if (minIntervalMs <= 0 || prevMs == null) return true;
        return nowMs - prevMs >= minIntervalMs;
    }

    public static Action action(boolean policyEmits, String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) {
        return action(false, policyEmits, prevSig, prevMs, sig, nowMs, minIntervalMs);
    }

    /** CHG-102 5a: a boundary window emits first; otherwise the policy and the interval decide. */
    public static Action action(boolean boundary, boolean policyEmits, String prevSig, Long prevMs, String sig,
                                long nowMs, long minIntervalMs) {
        if (boundary) return Action.BOUNDARY;
        if (!policyEmits) return Action.CLEAR;
        return due(prevSig, prevMs, sig, nowMs, minIntervalMs) ? Action.EMIT : Action.SKIP;
    }

    /** CHG-049 (M2): the throttle state is written only when at least one record was output. */
    public static boolean recordsState(int recordsOut) {
        return recordsOut > 0;
    }
}
