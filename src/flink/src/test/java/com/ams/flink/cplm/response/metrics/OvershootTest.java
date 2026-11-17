package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class OvershootTest {
    /** Unit-step response of a second-order system, zeta 0.3, wn 0.1 rad/s, 1 s sampling, 600 s. */
    private static double[] secondOrder(double zeta, double wn, double[] t) {
        double wd = wn * Math.sqrt(1 - zeta * zeta), phi = Math.acos(zeta);
        double[] p = new double[t.length];
        for (int i = 0; i < t.length; i++) {
            p[i] = 1 - Math.exp(-zeta * wn * t[i]) / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t[i] + phi);
        }
        return p;
    }

    private static EventDataset dataset(double[] t) {
        int n = t.length;
        boolean[] v = new boolean[n];
        java.util.Arrays.fill(v, true);
        return new EventDataset(t, new double[n], new double[n], new double[n], v, 0, t[n - 1]);
    }

    private static double[] grid(int n, double dt) {
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = i * dt;
        return t;
    }

    /** p = 1 + amp * sin over (from, to) exclusive of the end samples, which stay exactly 1 (or 1 - amp for a dip). */
    private static void lobe(double[] p, int from, int to, double amp) {
        for (int i = from + 1; i < to; i++) p[i] = 1 + amp * Math.sin(Math.PI * (i - from) / (to - from));
    }

    @Test
    public void underdampedSecondOrderGivesTextbookDecayRatio() {
        double[] t = grid(600, 1.0);
        double[] p = secondOrder(0.3, 0.1, t);
        Double dr = Overshoot.decayRatio(dataset(t), p, 0.005, 0.0);
        assertNotNull(dr);
        assertEquals(0.139, dr, 0.02);
    }

    @Test
    public void wigglesOnFirstOvershootAreNotASecondPeak() {
        double[] t = grid(3000, 0.1);
        double[] p = new double[t.length];
        for (int i = 0; i < t.length; i++) {
            p[i] = 1.02 + 0.08 * Math.exp(-t[i] / 100) + 0.01 * Math.sin(2 * Math.PI * 0.5 * t[i]); // never returns below 1
        }
        assertNull(Overshoot.decayRatio(dataset(t), p, 0.005, 0.0));
    }

    @Test
    public void peaksBelowFourTimesNoiseIgnored() {
        double[] t = grid(80, 1.0);
        double[] p = new double[t.length];
        java.util.Arrays.fill(p, 1.0);
        p[0] = 0;
        lobe(p, 0, 20, 0.2);
        lobe(p, 20, 40, -0.1);
        lobe(p, 40, 60, 0.02);
        assertEquals(0.1, Overshoot.decayRatio(dataset(t), p, 0.005, 0.0), 1e-3);       // visible without noise
        assertNull(Overshoot.decayRatio(dataset(t), p, 0.005, 0.01));                   // 2 % < 4 x 1 %
    }

    @Test
    public void unknownNoiseUsesBandOnly() {
        double[] t = grid(600, 1.0);
        double[] p = secondOrder(0.3, 0.1, t);
        Double dr = Overshoot.decayRatio(dataset(t), p, 0.005, Double.NaN);
        assertNotNull(dr);
        assertEquals(0.139, dr, 0.02);
    }

    @Test
    public void peaksOnOppositeSidesAreNotPaired() {
        double[] t = grid(60, 1.0);
        double[] p = new double[t.length];
        java.util.Arrays.fill(p, 1.0);
        p[0] = 0;
        lobe(p, 0, 20, 0.2);
        lobe(p, 20, 40, -0.15);                                                         // a dip, never a second peak
        assertNull(Overshoot.decayRatio(dataset(t), p, 0.005, 0.0));
    }
}
