package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * Marun 2026-09-27: G0 read FAIL / INCOMPLETE on roughly two thirds of every short window across the
 * whole fleet, which blocked every downstream gate (EXCLUDED_DATA_QUALITY) and left the plant with no
 * usable verdict a day after go-live. The tell was that the windows which did pass reported
 * completeness of 1.13 to 1.19 - impossible for a fraction of an expected count.
 *
 * <p>Cause: the expected sample count was derived from the MEDIAN of observed intervals. The gateway
 * timestamps on whole seconds around a 5 s grid, so consecutive intervals are 4 s and 6 s and their
 * median is 4 or 6 but never 5. Completeness therefore carried a systematic error of about 20 % in
 * either direction, and a 0.95 floor turned that into a fleet-wide failure.
 *
 * <p>The tuple already declares the grid ({@code grid_seconds}, read by TupleCodec into
 * {@link CplmNormalizedSample#gridSeconds}). The expected count must use it, and fall back to the
 * inference only when no grid is declared.
 */
public class DataQualityCompletenessBasisTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final long WINDOW_MS = 600_000L;          // 10 minutes
    private static final int GRID_S = 5;

    /** 120 samples averaging one every 5 s, but each timestamp on a whole second: 4 s, 6 s, 4 s, 6 s... */
    private static List<CplmNormalizedSample> quantisedWindow(boolean declareGrid) {
        List<CplmNormalizedSample> out = new ArrayList<>();
        long t = T0;
        for (int i = 0; i < 120; i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "FIC10301";
            s.eventTsMs = t;
            s.pv = 60 + 2 * Math.sin(i / 8.0);
            s.sp = 60;
            s.op = 40 + 3 * Math.sin(i / 8.0);
            s.mode = "AUT";
            s.quality = "GOOD";
            s.gridSeconds = declareGrid ? GRID_S : 0;
            out.add(s);
            t += (i % 2 == 0) ? 4_000L : 6_000L;             // mean 5 s, median 4 s or 6 s
        }
        return out;
    }

    private static CplmShortFeatureResult run(List<CplmNormalizedSample> w) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("FIC10301", "FIC", null).copy();
        return ShortFeatureCalculator.computeShortFeatures(w, T0, T0 + WINDOW_MS, "10m", p);
    }

    @Test
    public void aFullWindowOnTheDeclaredGridIsCompleteDespiteWholeSecondTimestamps() {
        CplmShortFeatureResult r = run(quantisedWindow(true));
        assertEquals("expected count comes from the declared 5 s grid over 600 s", 120, r.expectedSampleCount);
        assertEquals("120 of 120 samples present", 1.0, r.completeness, 1e-9);
        assertTrue("completeness is a fraction and can never exceed 1", r.completeness <= 1.0 + 1e-9);
        assertNotEquals("a full window must not read FAIL", "FAIL", r.gate0Status);
        assertEquals("", r.gate0Reason);
    }

    @Test
    public void theObservedPeriodIsStillReportedAsMeasuredNotAsDeclared() {
        CplmShortFeatureResult r = run(quantisedWindow(true));
        assertTrue("samplePeriodSec stays the measured value for the artifact", r.samplePeriodSec > 0);
    }

    @Test
    public void withNoDeclaredGridTheInferenceIsStillUsed() {
        CplmShortFeatureResult r = run(quantisedWindow(false));
        assertTrue("falls back to the inferred period", r.expectedSampleCount > 0);
    }
}
