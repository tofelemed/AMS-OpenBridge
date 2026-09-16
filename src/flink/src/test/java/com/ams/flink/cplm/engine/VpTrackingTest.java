package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1E.1 (spec v6 R02): the long stage MEASURES how the valve position followed the
 * controller output, so fusion has positive evidence (a non-following dwell) or a contradiction
 * (healthy tracking) - never just "VP exists". Only eligible VP samples count (a BAD or stale
 * held VP is not evidence, Task 1A.2).
 */
public class VpTrackingTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final long GRID = 5_000L;

    private static List<CplmNormalizedSample> window(int n, java.util.function.IntToDoubleFunction vpOf) {
        List<CplmNormalizedSample> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "VP_LOOP"; s.eventTsMs = T0 + i * GRID;
            s.pv = 50 + 2 * Math.sin(i / 20.0); s.sp = 50;
            s.op = 40 + 10 * Math.sin(i / 20.0);
            double vp = vpOf.applyAsDouble(i);
            s.vp = Double.isNaN(vp) ? null : vp;
            s.mode = "AUT"; s.quality = "GOOD";
            out.add(s);
        }
        return out;
    }

    private static CplmLongDiagnosticsResult run(List<CplmNormalizedSample> w) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("VP_LOOP", "FIC", null).copy();
        return LongDiagnosticsCalculator.computeLongDiagnostics(w, T0, T0 + w.size() * GRID, "4h", p);
    }

    @Test
    public void healthyTrackingIsMeasuredAsHealthy() {
        List<CplmNormalizedSample> w = window(2_000, i -> 40 + 10 * Math.sin(i / 20.0) + 0.3 * Math.sin(i));   // follows within 0.3 pp
        CplmLongDiagnosticsResult r = run(w);
        assertTrue(r.hasVp);
        assertEquals(2_000, r.vpEligibleSamples);
        assertTrue(r.vpTrackingErrorP95Pp < 1.0);
        assertEquals(0.0, r.vpNonFollowingDwellS, 1e-9);
        assertTrue(r.vpTrackingHealthy);
    }

    @Test
    public void aStuckValveShowsUpAsANonFollowingDwell() {
        // VP freezes at 40 pp for 200 samples (1000 s) while OP keeps swinging +/-10 pp.
        // |OP - VP| = 10|sin| clears the 5 pp threshold for two thirds of each half-cycle
        // (~42 samples = 210 s), so the LONGEST non-following run is ~210 s - well past the
        // 60 s dwell that makes it positive evidence, and nowhere near "healthy".
        List<CplmNormalizedSample> w = window(2_000, i -> i >= 500 && i < 700 ? 40.0 : 40 + 10 * Math.sin(i / 20.0));
        CplmLongDiagnosticsResult r = run(w);
        assertFalse(r.vpTrackingHealthy);
        assertTrue("dwell " + r.vpNonFollowingDwellS, r.vpNonFollowingDwellS >= 200);
        assertTrue("dwell " + r.vpNonFollowingDwellS, r.vpNonFollowingDwellS < 300);
        assertTrue(r.vpTrackingErrorP95Pp > 5.0);
    }

    @Test
    public void staleOrBadVpSamplesAreNotEvidenceEitherWay() {
        List<CplmNormalizedSample> w = window(2_000, i -> Double.NaN);      // VP never published
        CplmLongDiagnosticsResult r = run(w);
        assertFalse(r.hasVp);
        assertEquals(0, r.vpEligibleSamples);
        assertFalse(r.vpTrackingHealthy);
        assertEquals(0.0, r.vpNonFollowingDwellS, 1e-9);
    }
}
