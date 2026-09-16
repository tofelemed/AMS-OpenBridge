package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * How the measured valve position followed the controller output (v2.5 Task 1E.1, R02).
 * Only ELIGIBLE VP samples count (Task 1A.2: a BAD or stale held VP is not evidence). OP is
 * the 0-100 pp normalised demand; VP is taken as percentage points of travel. The result is
 * the positive evidence (a non-following dwell) or the contradiction (healthy tracking) that
 * G14 v2 needs - never "VP exists".
 */
public final class VpTrackingMath {
    private VpTrackingMath() {
    }

    public static final class VpTracking {
        public int eligibleSamples;
        public double errorMeanPp;
        public double errorP95Pp;
        /** Longest run (seconds) with |OP - VP| >= the non-following error threshold. */
        public double nonFollowingDwellS;
        public boolean healthy;
    }

    /**
     * @param samples the window's samples in event-time order
     * @param opNorm  OP normalised to 0-100 pp, aligned with {@code samples}
     * @param gridMs  the inferred sample period (the last sample of a run holds for one grid)
     */
    public static VpTracking compute(List<CplmNormalizedSample> samples, double[] opNorm,
                                     CplmLoopDynamicsProfile profile, double gridMs) {
        VpTracking t = new VpTracking();
        int n = Math.min(samples.size(), opNorm.length);
        List<Double> errors = new ArrayList<>();
        double sum = 0;
        double maxDwellS = 0;
        long runStartMs = Long.MIN_VALUE;
        long lastTsMs = Long.MIN_VALUE;
        double threshold = profile.nonfollowingErrorPp;
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = samples.get(i);
            if (s.vp == null || !s.vpEligible(profile)) {
                if (runStartMs != Long.MIN_VALUE) {
                    maxDwellS = Math.max(maxDwellS, (lastTsMs + gridMs - runStartMs) / 1000.0);
                    runStartMs = Long.MIN_VALUE;
                }
                continue;
            }
            double err = Math.abs(opNorm[i] - s.vp);
            errors.add(err);
            sum += err;
            if (err >= threshold) {
                if (runStartMs == Long.MIN_VALUE) runStartMs = s.eventTsMs;
                lastTsMs = s.eventTsMs;
            } else if (runStartMs != Long.MIN_VALUE) {
                maxDwellS = Math.max(maxDwellS, (s.eventTsMs - runStartMs) / 1000.0);
                runStartMs = Long.MIN_VALUE;
            }
        }
        if (runStartMs != Long.MIN_VALUE) maxDwellS = Math.max(maxDwellS, (lastTsMs + gridMs - runStartMs) / 1000.0);

        t.eligibleSamples = errors.size();
        if (errors.isEmpty()) return t;
        t.errorMeanPp = sum / errors.size();
        Collections.sort(errors);
        t.errorP95Pp = errors.get(Math.min(errors.size() - 1, (int) Math.floor(0.95 * (errors.size() - 1))));
        t.nonFollowingDwellS = maxDwellS;
        t.healthy = t.eligibleSamples >= 30
                && t.errorP95Pp < threshold
                && t.nonFollowingDwellS < profile.nonfollowingDwellS;
        return t;
    }
}
