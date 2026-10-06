package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;

/** CHG-049: the long tier re-fires every 15 min over overlapping windows; emit when the finding changes, else at most once per interval. */
public final class EvidenceThrottle {
    private EvidenceThrottle() {}

    public static String signature(CplmLongDiagnosticsResult r) {
        return r.gate7Status + "|" + r.gate8Status + "|" + r.gate9Status + "|" + r.gate10Status + "|" + r.gate11Status;
    }

    public static boolean due(String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) {
        if (minIntervalMs <= 0 || prevSig == null || prevMs == null) return true;
        if (!prevSig.equals(sig)) return true;
        return nowMs - prevMs >= minIntervalMs;
    }
}
