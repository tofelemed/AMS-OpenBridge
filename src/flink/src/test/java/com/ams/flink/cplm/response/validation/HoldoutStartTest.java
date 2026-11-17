package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Test;

import java.util.Arrays;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-211: the replay of the holdout starts from the holdout's own pre-step state - the median of its valid PV samples in
 * [t0 - preWindowS, t0), no drift, for a self-regulating family; for an integrating family its pre-step line when the slope
 * clears 2 standard errors - and falls back to the caller's start (the training fit's y0 and v0) below 3 such samples.
 */
public class HoldoutStartTest {
    private static EventDataset event(double[] t, double[] y, boolean[] valid, double t0) {
        double[] r = new double[t.length], u = new double[t.length];
        return new EventDataset(t, y, r, u, valid, t0, t[t.length - 1]);
    }

    /** 120 s before the step at t0 = 1120 s and 60 s after, at 1 s: PV = level + drift (t - t0) + Gaussian noise. */
    private static EventDataset drifting(double level, double drift, double noise, long seed) {
        int n = 181;
        double[] t = new double[n], y = new double[n];
        boolean[] v = new boolean[n];
        Random rnd = new Random(seed);
        for (int i = 0; i < n; i++) {
            t[i] = 1000 + i;
            y[i] = level + drift * (t[i] - 1120) + noise * rnd.nextGaussian();
            v[i] = true;
        }
        return event(t, y, v, 1120);
    }

    /** The pre-step values in [t0 - window, t0), valid and finite, worked out here apart from HoldoutStart. */
    private static double[] preStep(EventDataset d, double window) {
        double[] pre = new double[d.size()];
        int n = 0;
        for (int i = 0; i < d.size(); i++) {
            if (d.valid[i] && Double.isFinite(d.y[i]) && d.t[i] >= d.t0 - window && d.t[i] < d.t0) pre[n++] = d.y[i];
        }
        return Arrays.copyOf(pre, n);
    }

    private static double median(double[] x) {
        double[] s = x.clone();
        Arrays.sort(s);
        int m = s.length / 2;
        return s.length % 2 == 1 ? s[m] : 0.5 * (s[m - 1] + s[m]);
    }

    /** 1.4826 MAD about the median. */
    private static double sigmaMad(double[] x) {
        double c = median(x);
        double[] d = new double[x.length];
        for (int i = 0; i < x.length; i++) d[i] = Math.abs(x[i] - c);
        return 1.4826 * median(d);
    }

    @Test
    public void medianOfPreStepSamples() {
        //               outside  window start                  outlier invalid  at t0 and after
        double[] t = {   30,      40,    50,   60,   70,   80,   90,    95,      100,  110,  120};
        double[] y = {   0,       80.1,  79.9, 80.0, 80.3, 79.8, 95.0,  500,     81,   85,   88};
        boolean[] v = {  true,    true,  true, true, true, true, true,  false,   true, true, true};
        HoldoutStart s = HoldoutStart.of(event(t, y, v, 100), ModelFamily.FOPDT, 60, 50, 0.01);
        assertTrue(s.fromHoldout);
        // window [40, 100): 80.1 79.9 80.0 80.3 79.8 95.0 - the sample at 30 s is outside, the one at 95 s invalid, t0 excluded
        assertEquals("the median of an even count: the mean of the middle two, not moved by the outlier", 80.05, s.y0, 1e-12);
        assertEquals("no drift from the holdout", 0, s.v0, 0);
        assertEquals("HOLDOUT_PRE_STEP_LEVEL", s.provenance());

        double[] tOdd = {50, 60, 70, 80, 90, 100, 110};
        double[] yOdd = {80.1, 80.0, 120.0, 79.9, 80.2, 90, 95};
        boolean[] vOdd = {true, true, true, true, true, true, true};
        HoldoutStart odd = HoldoutStart.of(event(tOdd, yOdd, vOdd, 100), ModelFamily.FOPDT, 60, 50, 0);
        assertTrue(odd.fromHoldout);
        assertEquals("one outlier in five: the median", 80.1, odd.y0, 1e-12);
    }

    @Test
    public void fewerThanThreeValidPreStepSamplesFallBack() {
        double[] t = {60, 70, 80, 90, 100, 110};
        double[] y = {80.1, 80.0, Double.NaN, 79.9, 90, 95};
        boolean[] v = {true, false, true, true, true, true};       // 70 s invalid, 80 s NaN: two valid pre-step samples left
        for (ModelFamily f : new ModelFamily[] {ModelFamily.FOPDT, ModelFamily.IPDT}) {
            HoldoutStart s = HoldoutStart.of(event(t, y, v, 100), f, 60, 50, 0.01);
            assertFalse(s.fromHoldout);
            assertEquals(50, s.y0, 0);
            assertEquals("the fallback keeps the training drift", 0.01, s.v0, 0);
            assertEquals("TRAINING_LEVEL", s.provenance());
            assertEquals("the training level carries its own standard errors", 0, s.variance(100), 0);
        }

        double[] all = {80.1, 80.0, 80.2, 79.9, 90, 95};
        boolean[] good = {true, true, true, true, true, true};
        assertFalse("no window, no pre-step level", HoldoutStart.of(event(t, all, good, 100), ModelFamily.FOPDT, 0, 50, 0).fromHoldout);
        assertFalse(HoldoutStart.of(event(t, all, good, 100), ModelFamily.FOPDT, Double.NaN, 50, 0).fromHoldout);
        assertFalse("a 25 s window [75, 100) holds 80 s and 90 s: two",
                HoldoutStart.of(event(t, all, good, 100), ModelFamily.FOPDT, 25, 50, 0).fromHoldout);
        assertTrue("a 30 s window [70, 100) holds 70, 80 and 90 s: three",
                HoldoutStart.of(event(t, all, good, 100), ModelFamily.FOPDT, 30, 50, 0).fromHoldout);
    }

    /** F1: a level loop that was balanced before its step (no real slope) keeps v0 = 0 and the median - c6c0db48's numbers. */
    @Test
    public void balancedIntegratingHoldoutKeepsZeroDrift() {
        EventDataset h = drifting(80, 0, 0.05, 7);
        double[] pre = preStep(h, 120);
        assertEquals(120, pre.length);
        HoldoutStart self = HoldoutStart.of(h, ModelFamily.FOPDT, 120, 50, 0.01);
        for (ModelFamily f : new ModelFamily[] {ModelFamily.IPDT, ModelFamily.INTEGRATOR_LAG}) {
            HoldoutStart s = HoldoutStart.of(h, f, 120, 50, 0.01);
            assertTrue(s.fromHoldout);
            assertFalse(f + ": no slope clear of 2 standard errors, no line", s.onLine);
            assertEquals(0, s.v0, 0);
            assertEquals("the median of the pre-step PV", median(pre), s.y0, 0);
            assertEquals("the same start as a self-regulating family", self.y0, s.y0, 0);
            assertEquals("HOLDOUT_PRE_STEP_LEVEL", s.provenance());
            assertEquals("sigma about the median", sigmaMad(pre), s.sigmaPre, 1e-12);
            assertEquals(120, s.samples);
            assertEquals("no slope term off the line", Math.PI / 2 * s.sigmaPre * s.sigmaPre / 120, s.variance(200), 1e-15);
        }

        // exactly flat: the slope is 0 and the line is never taken
        HoldoutStart flat = HoldoutStart.of(drifting(80, 0, 0, 1), ModelFamily.IPDT, 120, 50, 0.01);
        assertFalse(flat.onLine);
        assertEquals(80, flat.y0, 0);
        assertEquals(0, flat.v0, 0);
    }

    /** F1: a self-regulating loop's pre-step slope settles out - it is not part of its state; v0 stays 0 (the unchanged rule). */
    @Test
    public void selfRegulatingIgnoresPreStepSlope() {
        EventDataset h = drifting(80, 0.002, 0.05, 8);      // 0.24 EU over the window, about 15 standard errors of the slope
        double[] pre = preStep(h, 120);
        for (ModelFamily f : new ModelFamily[] {ModelFamily.FOPDT, ModelFamily.SOPDT, ModelFamily.SO_UNDERDAMPED}) {
            HoldoutStart s = HoldoutStart.of(h, f, 120, 50, 0.01);
            assertTrue(s.fromHoldout);
            assertFalse(s.onLine);
            assertEquals(f + ": no drift", 0, s.v0, 0);
            assertEquals(f + ": the median, as c6c0db48", median(pre), s.y0, 0);
            assertEquals("HOLDOUT_PRE_STEP_LEVEL", s.provenance());
        }
        // the slope is real: the same window starts an integrating model on its line
        HoldoutStart ipdt = HoldoutStart.of(h, ModelFamily.IPDT, 120, 50, 0.01);
        assertTrue("the integrating rule takes this slope", ipdt.onLine);
        assertEquals("HOLDOUT_PRE_STEP_LINE", ipdt.provenance());
    }

    /**
     * F1/F2: on the line, v0 is the Theil-Sen slope, y0 the median of r_i = y_i - v0 (t_i - t0) (the level AT t0), sigma 1.4826 MAD(r)
     * and se_v = sigma / sqrt(sum (t_i - tbar)^2); the start's variance grows as ((t - t0) se_v)^2 on top of (pi/2) sigma^2 / N.
     */
    @Test
    public void integratingStartIsThePreStepLineAtT0() {
        HoldoutStart exact = HoldoutStart.of(drifting(80, -0.004, 0, 1), ModelFamily.IPDT, 120, 50, 0);
        assertTrue(exact.onLine);
        assertEquals("a noise-free line: its slope", -0.004, exact.v0, 1e-12);
        assertEquals("its level at t0, not mid-window (80.24)", 80, exact.y0, 1e-9);

        EventDataset h = drifting(80, 0.005, 0.05, 9);
        HoldoutStart s = HoldoutStart.of(h, ModelFamily.INTEGRATOR_LAG, 120, 50, 0);
        assertTrue(s.onLine);
        assertEquals(0.005, s.v0, 0.0005);
        assertEquals(80, s.y0, 0.05);
        double[] r = new double[120], dt = new double[120];
        double mean = 0;
        for (int i = 0; i < 120; i++) {
            dt[i] = h.t[i] - h.t0;
            r[i] = h.y[i] - s.v0 * dt[i];
            mean += dt[i] / 120;
        }
        double sxx = 0;
        for (double x : dt) sxx += (x - mean) * (x - mean);
        assertEquals(median(r), s.y0, 1e-9);
        assertEquals(sigmaMad(r), s.sigmaPre, 1e-9);
        assertEquals(s.sigmaPre / Math.sqrt(sxx), s.slopeSe, 1e-12);
        assertTrue("slope " + s.v0 + " vs se " + s.slopeSe, Math.abs(s.v0) > 2 * s.slopeSe);
        double level = Math.PI / 2 * s.sigmaPre * s.sigmaPre / 120;
        assertEquals("at t0 the level term alone", level, s.variance(0), 1e-15);
        assertEquals(level + Math.pow(100 * s.slopeSe, 2), s.variance(100), 1e-15);
    }
}
