package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-211: the replay of the holdout starts from the holdout's own pre-step level - the median of its valid PV samples in
 * [t0 - preWindowS, t0), no drift - and falls back to the caller's start (the training fit's y0 and v0) below 3 such samples.
 */
public class HoldoutStartTest {
    private static EventDataset event(double[] t, double[] y, boolean[] valid, double t0) {
        double[] r = new double[t.length], u = new double[t.length];
        return new EventDataset(t, y, r, u, valid, t0, t[t.length - 1]);
    }

    @Test
    public void medianOfPreStepSamples() {
        //               outside  window start                  outlier invalid  at t0 and after
        double[] t = {   30,      40,    50,   60,   70,   80,   90,    95,      100,  110,  120};
        double[] y = {   0,       80.1,  79.9, 80.0, 80.3, 79.8, 95.0,  500,     81,   85,   88};
        boolean[] v = {  true,    true,  true, true, true, true, true,  false,   true, true, true};
        HoldoutStart s = HoldoutStart.of(event(t, y, v, 100), 60, 50, 0.01);
        assertTrue(s.fromHoldout);
        // window [40, 100): 80.1 79.9 80.0 80.3 79.8 95.0 - the sample at 30 s is outside, the one at 95 s invalid, t0 excluded
        assertEquals("the median of an even count: the mean of the middle two, not moved by the outlier", 80.05, s.y0, 1e-12);
        assertEquals("no drift from the holdout", 0, s.v0, 0);
        assertEquals("HOLDOUT_PRE_STEP_LEVEL", s.provenance());

        double[] tOdd = {50, 60, 70, 80, 90, 100, 110};
        double[] yOdd = {80.1, 80.0, 120.0, 79.9, 80.2, 90, 95};
        boolean[] vOdd = {true, true, true, true, true, true, true};
        HoldoutStart odd = HoldoutStart.of(event(tOdd, yOdd, vOdd, 100), 60, 50, 0);
        assertTrue(odd.fromHoldout);
        assertEquals("one outlier in five: the median", 80.1, odd.y0, 1e-12);
    }

    @Test
    public void fewerThanThreeValidPreStepSamplesFallBack() {
        double[] t = {60, 70, 80, 90, 100, 110};
        double[] y = {80.1, 80.0, Double.NaN, 79.9, 90, 95};
        boolean[] v = {true, false, true, true, true, true};       // 70 s invalid, 80 s NaN: two valid pre-step samples left
        HoldoutStart s = HoldoutStart.of(event(t, y, v, 100), 60, 50, 0.01);
        assertFalse(s.fromHoldout);
        assertEquals(50, s.y0, 0);
        assertEquals("the fallback keeps the training drift", 0.01, s.v0, 0);
        assertEquals("TRAINING_LEVEL", s.provenance());

        double[] all = {80.1, 80.0, 80.2, 79.9, 90, 95};
        boolean[] good = {true, true, true, true, true, true};
        assertFalse("no window, no pre-step level", HoldoutStart.of(event(t, all, good, 100), 0, 50, 0).fromHoldout);
        assertFalse(HoldoutStart.of(event(t, all, good, 100), Double.NaN, 50, 0).fromHoldout);
        assertFalse("a 25 s window [75, 100) holds 80 s and 90 s: two", HoldoutStart.of(event(t, all, good, 100), 25, 50, 0).fromHoldout);
        assertTrue("a 30 s window [70, 100) holds 70, 80 and 90 s: three", HoldoutStart.of(event(t, all, good, 100), 30, 50, 0).fromHoldout);
    }
}
