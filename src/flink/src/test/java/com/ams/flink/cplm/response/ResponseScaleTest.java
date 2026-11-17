package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-204 (spec item 3): the PV-side tolerances scale with the loop's declared PV span (k = span / 100), so a
 * 0-100 loop and a loop with no usable declared range keep today's values. A value a governing bundle set is
 * already in the loop's units and is never scaled. The settle band widens to the loop's pre-step noise band
 * (4 robust sigmas) when that is wider; with no pre-step support the noise term is left out.
 */
public class ResponseScaleTest {
    private static final double EPS = 1e-9;

    private static CplmLoopDynamicsProfile range(double min, double max) {
        CplmLoopDynamicsProfile p = new CplmLoopDynamicsProfile();
        p.pvEngMin = min;
        p.pvEngMax = max;
        p.pvRangeDeclared = true;
        return p;
    }

    private static ResponseScale scale(double min, double max) {
        return ResponseScale.of(new ResponseJobConfig().withProfileRanges(range(min, max)));
    }

    private static void assertTodaysValues(ResponseScale k) {
        assertEquals(1.0, k.k(), EPS);
        assertEquals(1.0, k.refStepFloorEu(), EPS);
        assertEquals(0.02, k.rampMinSlopeEuPerS(), EPS);
        assertEquals(0.5, k.stableBandEu(Double.NaN), EPS);
        assertEquals(0.05, k.noiseFloorEu(Double.NaN), EPS);
        assertEquals(0.1, k.absSettlingBandEu(), EPS);
        assertEquals(0.5, k.minResponseEu(), EPS);
        assertEquals(0.5, k.targetBandEu(), EPS);
        assertEquals(1e3, k.gainAbsMax(), EPS);
    }

    @Test
    public void undeclaredSpanKeepsTodaysValues() {
        assertTodaysValues(ResponseScale.of(new ResponseJobConfig()));
        CplmLoopDynamicsProfile undeclared = range(0, 1800);
        undeclared.pvRangeDeclared = false;                                     // the 0-100 default is not a declaration
        ResponseJobConfig c = new ResponseJobConfig().withProfileRanges(undeclared);
        assertTrue(Double.isNaN(c.pvSpanEu));
        assertTodaysValues(ResponseScale.of(c));
        assertTodaysValues(ResponseScale.of(new ResponseJobConfig().withProfileRanges(null)));
    }

    @Test
    public void span100EqualsToday() {
        ResponseJobConfig c = new ResponseJobConfig().withProfileRanges(range(0, 100));
        assertEquals(100.0, c.pvSpanEu, EPS);
        assertTodaysValues(ResponseScale.of(c));
    }

    @Test
    public void span6ScalesDown() {
        ResponseScale k = scale(0, 6);
        assertEquals(0.06, k.k(), EPS);
        assertEquals(0.06, k.refStepFloorEu(), EPS);
        assertEquals(0.0012, k.rampMinSlopeEuPerS(), EPS);
        assertEquals(0.03, k.stableBandEu(Double.NaN), EPS);
        assertEquals(0.03, k.minResponseEu(), EPS);
        assertEquals(0.006, k.absSettlingBandEu(), EPS);
    }

    @Test
    public void span1800ScalesUp() {
        ResponseScale k = scale(-300, 1500);
        assertEquals(18.0, k.refStepFloorEu(), EPS);
        assertEquals(9.0, k.stableBandEu(Double.NaN), EPS);
        assertEquals(18000.0, k.gainAbsMax(), EPS);
    }

    @Test
    public void refStepFloorScalesTheJobArgs() {
        ResponseJobConfig c = new ResponseJobConfig();
        c.stepMinInputEu = 2.0;                                                 // the job argument g12-step-min-eu
        assertEquals("undeclared: today's floor", 2.0, ResponseScale.of(c).refStepFloorEu(), EPS);
        assertEquals("declared 0-6: the job's floor x k", 0.12, ResponseScale.of(c.withProfileRanges(range(0, 6))).refStepFloorEu(), EPS);
    }

    @Test
    public void noiseBandWidensSettle() {
        ResponseScale k = scale(0, 1800);
        assertEquals(30.0, k.stableBandEu(5), EPS);                             // 1.5 x the 4-sigma noise band beats 0.5 % of span
        assertEquals(15.0, k.noiseFloorEu(5), EPS);                             // half of it
        assertEquals("a quiet pre-step leaves the scaled band", 9.0, k.stableBandEu(1), EPS);
    }

    @Test
    public void invalidSpanFallsBackToTodaysValues() {
        double[][] bad = {{5, 5}, {10, 5}, {0, Double.NaN}, {0, Double.POSITIVE_INFINITY}};   // spans 0, -5, NaN, infinite
        for (double[] r : bad) {
            ResponseJobConfig c = new ResponseJobConfig().withProfileRanges(range(r[0], r[1]));
            assertTrue("span " + (r[1] - r[0]), Double.isNaN(c.pvSpanEu));
            assertTodaysValues(ResponseScale.of(c));
        }
    }

    @Test
    public void noPreStepSamplesIgnoresNoiseTerm() {
        double[] t = {100, 110}, y = {500, 520};
        boolean[] v = {true, true};
        double sigma = ResponseScale.preStepNoiseSigma(t, y, v, 120, 60);
        assertTrue("one difference: noise unknown", Double.isNaN(sigma));
        ResponseScale k = scale(0, 1800);
        assertEquals(0.5 * 18, k.stableBandEu(sigma), EPS);
        assertEquals(0.05 * 18, k.noiseFloorEu(sigma), EPS);
    }

    @Test
    public void preStepNoiseSigmaUsesValidSamplesInsideTheWindowOnly() {
        double[] t = {10, 60, 70, 80, 90, 100, 110, 120};
        double[] y = {0, 500, 501, 900, 500, 501, 500, 700};
        boolean[] v = {true, true, true, false, true, true, true, true};
        // window [60, 120): t = 10 is before it, t = 80 is invalid, t = 120 is the event instant itself; the rest
        // differ by +1 -1 +1 -1, so MAD = 1 (any excluded sample let in would change it)
        assertEquals(1.0 / (0.6745 * Math.sqrt(2)), ResponseScale.preStepNoiseSigma(t, y, v, 120, 60), EPS);
    }

    @Test
    public void preStepNoiseSigmaOfWhiteNoiseDriftAndRamp() {
        int n = 200;
        double[] t = new double[n], noise = new double[n], drift = new double[n], ramp = new double[n];
        boolean[] v = new boolean[n];
        java.util.Random rnd = new java.util.Random(4);
        for (int i = 0; i < n; i++) {
            t[i] = i;
            v[i] = true;
            noise[i] = 50 + rnd.nextGaussian();                                  // sigma 1.0
            drift[i] = 50 + 0.05 * i;                                            // 10 EU of linear drift
            ramp[i] = 50 + 20 * (1 - Math.exp(-i / 40.0));                       // a smooth transient spanning ~20 EU
        }
        double white = ResponseScale.preStepNoiseSigma(t, noise, v, n, n);
        assertTrue("white noise sigma 1.0 -> " + white, white >= 0.85 && white <= 1.15);
        assertTrue("a linear drift is not noise", ResponseScale.preStepNoiseSigma(t, drift, v, n, n) < 0.01);
        assertTrue("a smooth transient is far below its range", ResponseScale.preStepNoiseSigma(t, ramp, v, n, n) < 0.2);
        double[] three = {0, 1, 2};
        assertTrue("2 differences: noise unknown", Double.isNaN(ResponseScale.preStepNoiseSigma(three, new double[] {5, 7, 4}, new boolean[] {true, true, true}, 3, 3)));
    }

    @Test
    public void bundleEuValueIsNotScaled() {
        ResponseJobConfig c = new ResponseJobConfig()
                .underBundle("bundle-1", Collections.singletonMap("G12.settling_abs_band_pv_eu", 0.2))
                .withProfileRanges(range(0, 1800));
        assertTrue(c.bundleEuKeys.contains("G12.settling_abs_band_pv_eu"));
        ResponseScale k = ResponseScale.of(c);
        assertEquals("set by the bundle in loop units", 0.2, k.absSettlingBandEu(), EPS);
        assertEquals("not set by the bundle: scaled", 9.0, k.minResponseEu(), EPS);
        assertEquals(18000.0, k.gainAbsMax(), EPS);
        assertEquals(18.0, k.refStepFloorEu(), EPS);

        java.util.Map<String, Double> g12 = new java.util.HashMap<>();
        g12.put("G12.step_min_input_eu", 0.25);
        g12.put("G12.gain_abs_max", 50.0);
        ResponseScale small = ResponseScale.of(new ResponseJobConfig().underBundle("bundle-2", g12).withProfileRanges(range(0, 6)));
        assertEquals("the bundle's floor holds above 1 % of span", 0.25, small.refStepFloorEu(), EPS);
        assertEquals(50.0, small.gainAbsMax(), EPS);
        assertEquals(0.006, small.absSettlingBandEu(), EPS);
    }
}
