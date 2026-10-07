package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;

/** CHG-049: the long tier re-fires every 15 min over overlapping windows; emit when the finding changes, else at most once per interval. */
public final class EvidenceThrottle {
    private EvidenceThrottle() {}

    /** CHG-049 (final review M1): CLEAR = the policy does not emit this window, forget its state; SKIP = throttled; EMIT = output it. */
    public enum Action { CLEAR, SKIP, EMIT }

    public static String signature(CplmLongDiagnosticsResult r) {
        return r.gate7Status + "|" + r.gate8Status + "|" + r.gate9Status + "|" + r.gate10Status + "|" + r.gate11Status;
    }

    /** CHG-049 (Task 10): the fusion tier throttles on the fused verdict, per window kind. */
    public static String signature(CplmGateResult r) {
        return r.diagnosis + "|" + r.selectedFamily + "|" + r.gate14Status + "|" + r.gate15Status;
    }

    public static boolean due(String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) {
        if (minIntervalMs <= 0 || prevSig == null || prevMs == null) return true;
        if (!prevSig.equals(sig)) return true;
        return nowMs - prevMs >= minIntervalMs;
    }

    /** CHG-049 (M1): a window the policy skips clears the state, so a finding that comes back after a PASS emits at once. */
    public static Action action(boolean policyEmits, String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) {
        if (!policyEmits) return Action.CLEAR;
        return due(prevSig, prevMs, sig, nowMs, minIntervalMs) ? Action.EMIT : Action.SKIP;
    }

    /** CHG-049 (M2): the throttle state is written only when at least one record was output. */
    public static boolean recordsState(int recordsOut) {
        return recordsOut > 0;
    }
}
