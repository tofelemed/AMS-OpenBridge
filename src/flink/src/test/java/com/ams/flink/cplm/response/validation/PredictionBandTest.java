package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.OutputErrorEstimatorTest;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-209: the 95 % prediction band of the System Response model check - the model's free run on the holdout widened by the
 * parameter standard errors (linearised: central-difference sensitivities of the ZOH simulation) and the fit's residual noise.
 * A well-identified model's band holds the holdout; more parameter uncertainty widens it; without standard errors it is the
 * residual band +-1.96 sigma; the baseline's standard error widens every sample alike; invalid samples carry no band.
 * Fix round 1: the delay profile's half-width h (thetaUncertaintyS) enters as a rectangular interval (u = h / sqrt 3) through
 * the secant over [max(0, theta - h), theta + h]; the noise term comes from the training fit's free-run residuals.
 */
public class PredictionBandTest {
    private static final ProcessModel TRUTH = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
    private static final double SIGMA = 0.1;

    /** A standard error of the given fraction on every model parameter (gain, dead time, time constant). */
    private static Map<String, Double> relativeSe(double fraction) {
        Map<String, Double> se = new LinkedHashMap<>();
        se.put("process_gain", fraction * TRUTH.gain);
        se.put("dead_time", fraction * TRUTH.theta);
        se.put("time_constant", fraction * TRUTH.tau);
        return se;
    }

    /** 221 samples at 1 s, the input 40 -> 45 at t = 0, PV from the truth plus Gaussian noise. */
    private static EventDataset holdout(long seed) {
        return OutputErrorEstimatorTest.synthetic(TRUTH, SIGMA, seed, 1, 200, 5);
    }

    private static PredictionBand.Result band(Map<String, Double> se, double sigma, EventDataset h) {
        return band(se, Double.NaN, sigma, h);
    }

    private static PredictionBand.Result band(Map<String, Double> se, double thetaHalfWidthS, double sigma, EventDataset h) {
        return PredictionBand.compute(TRUTH, se, thetaHalfWidthS, sigma, h, 40, 100, 0, 60);
    }

    /** The free run of m on the holdout from the band's operating point (u0 40, y0 100, no drift). */
    private static double[] freeRun(ProcessModel m, EventDataset h) {
        return ZohSimulator.simulate(m, h.t, h.u, 40, 100, 0, h.t0, 60).yHat;
    }

    private static double halfWidth(PredictionBand.Result r, int i) {
        return 0.5 * (r.upper[i] - r.lower[i]);
    }

    private static void assertFiniteAndOrdered(PredictionBand.Result r, EventDataset h) {
        assertEquals(h.size(), r.predict.length);
        assertEquals(h.size(), r.lower.length);
        assertEquals(h.size(), r.upper.length);
        for (int i = 0; i < h.size(); i++) {
            if (!h.valid[i] || !Double.isFinite(r.predict[i])) continue;
            assertTrue("finite at " + i, Double.isFinite(r.lower[i]) && Double.isFinite(r.upper[i]));
            assertTrue("lower <= predict <= upper at " + i, r.lower[i] <= r.predict[i] && r.predict[i] <= r.upper[i]);
        }
    }

    private static double meanHalfWidth(PredictionBand.Result r) {
        double sum = 0;
        int n = 0;
        for (int i = 0; i < r.upper.length; i++) {
            if (!Double.isFinite(r.upper[i])) continue;
            sum += 0.5 * (r.upper[i] - r.lower[i]);
            n++;
        }
        return sum / n;
    }

    @Test
    public void bandContainsTruthForWellIdentifiedModel() {
        EventDataset h = holdout(31);
        PredictionBand.Result r = band(relativeSe(0.05), SIGMA, h);
        assertFiniteAndOrdered(r, h);
        assertTrue("coverage " + r.coverage, r.coverage >= 0.9 && r.coverage <= 1.0);
        assertEquals("every parameter with a standard error is perturbed", Arrays.asList("process_gain", "dead_time", "time_constant"), r.parameters);
        // before the input reaches the PV (t <= 3 s, dead time 4 s) no parameter moves the output: the band is the residual band
        for (int i = 0; i < h.size() && h.t[i] <= 3; i++) assertEquals("t " + h.t[i], 1.96 * SIGMA, 0.5 * (r.upper[i] - r.lower[i]), 1e-9);
        // once the response is under way the gain and the time constant widen it
        int late = h.size() - 1;
        assertTrue(0.5 * (r.upper[late] - r.lower[late]) > 1.96 * SIGMA * 1.5);
        // a finite dead-time standard error wins: the delay profile's half-width is then not added a second time
        PredictionBand.Result withHalfWidth = band(relativeSe(0.05), 2.5, SIGMA, h);
        assertEquals(r.parameters, withHalfWidth.parameters);
        assertArrayEquals(r.upper, withHalfWidth.upper, 0);
        assertArrayEquals(r.lower, withHalfWidth.lower, 0);
        assertTrue(Double.isNaN(withHalfWidth.deadTimeHalfWidthS));
    }

    @Test
    public void bandWidensWithParameterUncertainty() {
        EventDataset h = holdout(32);
        PredictionBand.Result wide = band(relativeSe(0.20), SIGMA, h);
        PredictionBand.Result narrow = band(relativeSe(0.02), SIGMA, h);
        assertFiniteAndOrdered(wide, h);
        assertFiniteAndOrdered(narrow, h);
        assertTrue("mean half-width " + meanHalfWidth(wide) + " vs " + meanHalfWidth(narrow), meanHalfWidth(wide) > meanHalfWidth(narrow));
        assertTrue(wide.coverage >= narrow.coverage);
        assertEquals("the band is centred on the same free run", narrow.predict[100], wide.predict[100], 0);
    }

    @Test
    public void noStdErrGivesResidualOnlyBand() {
        EventDataset h = holdout(33);
        Map<String, Double> missing = new LinkedHashMap<>();
        missing.put("process_gain", Double.NaN);                  // a singular Jacobian leaves NaN
        missing.put("time_constant", null);
        missing.put("damping_ratio", 0.5);                       // not a parameter of this family: skipped
        for (Map<String, Double> se : Arrays.asList(Collections.<String, Double>emptyMap(), missing, null)) {
            PredictionBand.Result r = band(se, SIGMA, h);
            assertFiniteAndOrdered(r, h);
            assertTrue(r.parameters.isEmpty());
            for (int i = 0; i < h.size(); i++) assertEquals("half-width at " + i, 1.96 * SIGMA, 0.5 * (r.upper[i] - r.lower[i]), 1e-12);
        }
    }

    @Test
    public void theBaselineStandardErrorWidensEverySampleAlike() {
        EventDataset h = holdout(34);
        PredictionBand.Result r = band(Collections.singletonMap("baseline", 0.2), SIGMA, h);
        assertEquals(Collections.singletonList("baseline"), r.parameters);
        double expected = 1.96 * Math.sqrt(0.2 * 0.2 + SIGMA * SIGMA);
        for (int i = 0; i < h.size(); i++) assertEquals("half-width at " + i, expected, 0.5 * (r.upper[i] - r.lower[i]), 1e-9);
    }

    @Test
    public void theDriftStandardErrorGrowsWithTimeFromTheHoldoutStart() {
        ProcessModel ipdt = ProcessModel.ipdt("OP_TO_PV", 0.002, 4.0);
        EventDataset h = OutputErrorEstimatorTest.synthetic(ipdt, SIGMA, 35, 1, 200, 5);
        PredictionBand.Result r = PredictionBand.compute(ipdt, Collections.singletonMap("baseline_slope", 0.001), Double.NaN, SIGMA, h, 40, 100, 0, 60);
        for (int i = 0; i < h.size(); i++) {
            double g = h.t[i] - h.t0;                                // d yhat / d v0 = t - t0
            assertEquals("half-width at " + i, 1.96 * Math.sqrt(g * g * 1e-6 + SIGMA * SIGMA), 0.5 * (r.upper[i] - r.lower[i]), 1e-6);
        }
    }

    @Test
    public void invalidSamplesCarryNoBandAndLeaveTheCoverage() {
        EventDataset base = holdout(36);
        int n = base.size();
        double[] t = base.t.clone();
        for (int i = 150; i < n; i++) t[i] += 100;                     // a 101 s gap at index 150: the free run stops there
        boolean[] valid = base.valid.clone();
        valid[10] = false;
        EventDataset h = new EventDataset(t, base.y, base.r, base.u, valid, base.t0, t[n - 1]);
        PredictionBand.Result r = band(relativeSe(0.05), SIGMA, h);
        assertFiniteAndOrdered(r, h);
        assertTrue(Double.isNaN(r.lower[10]) && Double.isNaN(r.upper[10]));
        for (int i = 150; i < n; i++) assertTrue("no band after the gap at " + i, Double.isNaN(r.lower[i]) && Double.isNaN(r.upper[i]));
        int inside = 0, counted = 0;
        for (int i = 0; i < 150; i++) {
            if (i == 10) continue;
            counted++;
            if (h.y[i] >= r.lower[i] && h.y[i] <= r.upper[i]) inside++;
        }
        assertEquals((double) inside / counted, r.coverage, 1e-12);
    }

    @Test
    public void residualSigmaIsTheFitNoisePerDegreeOfFreedom() {
        assertEquals(Math.sqrt(4.5 / 45), PredictionBand.residualSigma(4.5, 48, 3), 1e-12);
        assertEquals("never divides by fewer than one", Math.sqrt(2.0), PredictionBand.residualSigma(2.0, 2, 3), 1e-12);
        assertTrue(Double.isNaN(PredictionBand.residualSigma(Double.NaN, 48, 3)));
        // a non-finite sigma counts as no residual noise: the band stays finite (the parameter part alone)
        EventDataset h = holdout(37);
        PredictionBand.Result r = band(Collections.<String, Double>emptyMap(), Double.NaN, h);
        assertFiniteAndOrdered(r, h);
    }

    /** F2: the noise term of a free-run band is the training fit's free-run residual sigma; below 3 valid residuals, the objective formula. */
    @Test
    public void noiseSigmaUsesTheFreeRunResidualsAndFallsBackBelowThree() {
        double[] residuals = {0.3, Double.NaN, -0.4, 0.5, Double.NaN, 0.1};     // NaN: the data or the fit was not valid there
        double sse = 0.09 + 0.16 + 0.25 + 0.01;
        assertEquals("over the 4 valid samples, 2 parameters", Math.sqrt(sse / 2), PredictionBand.noiseSigma(residuals, 2, 1e-6, 6), 1e-12);
        assertEquals("never divides by fewer than one", Math.sqrt(sse), PredictionBand.noiseSigma(residuals, 5, 1e-6, 6), 1e-12);
        double[] two = {0.3, Double.NaN, -0.4};
        double objectiveFormula = PredictionBand.residualSigma(4.5, 48, 3);
        assertEquals("fewer than 3 valid: the objective formula", objectiveFormula, PredictionBand.noiseSigma(two, 3, 4.5, 48), 1e-12);
        assertEquals("no residuals: the objective formula", objectiveFormula, PredictionBand.noiseSigma(null, 3, 4.5, 48), 1e-12);
    }

    /** F1: FOPDT dead time 20 s, tau 30 s, no standard errors, h = 5 s: the band widens from theta - h on, by the secant term. */
    @Test
    public void deadTimeUncertaintyWidensTheOnset() {
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 2.0, 20.0, 30.0);
        double sigma = 0.05, h = 5;
        EventDataset d = OutputErrorEstimatorTest.synthetic(m, sigma, 41, 1, 200, 5);
        PredictionBand.Result r = PredictionBand.compute(m, Collections.<String, Double>emptyMap(), h, sigma, d, 40, 100, 0, 60);
        assertFiniteAndOrdered(r, d);
        assertEquals(Collections.singletonList("dead_time"), r.parameters);
        assertEquals(h, r.deadTimeHalfWidthS, 0);
        double[] plus = freeRun(m.withParameter("dead_time", 25), d), minus = freeRun(m.withParameter("dead_time", 15), d);
        int chosen = -1, inWindow = 0;
        for (int i = 0; i < d.size(); i++) {
            double s = d.t[i] - d.t0;                                          // time after the input step
            if (s <= 15) assertEquals("before theta - h nothing moves, s " + s, 1.96 * sigma, halfWidth(r, i), 1e-12);
            if (s > 15 && s < 55) {
                assertTrue("wider than the residual band at s " + s + ": " + halfWidth(r, i), halfWidth(r, i) > 1.96 * sigma);
                inWindow++;
            }
            if (s == 22) chosen = i;
        }
        assertTrue(inWindow > 30);
        double delta = plus[chosen] - minus[chosen];
        assertTrue("the two delays disagree at s 22", Math.abs(delta) > 1);
        // u_theta = h / sqrt(3) and g = delta / (2 h), so g^2 u_theta^2 = delta^2 / 12
        assertEquals(1.96 * Math.sqrt(sigma * sigma + delta * delta / 12), halfWidth(r, chosen), 1e-9);
    }

    /** F1: theta = 0 is common; the lower delay is clamped to 0 and the secant runs over [0, h]: g^2 h^2 / 3 = (yhat(h) - yhat(0))^2 / 3. */
    @Test
    public void deadTimeAtZeroUsesClampedSecant() {
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 2.0, 0.0, 30.0);
        double sigma = 0.05, h = 5;
        EventDataset d = OutputErrorEstimatorTest.synthetic(m, sigma, 42, 1, 200, 5);
        PredictionBand.Result r = PredictionBand.compute(m, Collections.<String, Double>emptyMap(), h, sigma, d, 40, 100, 0, 60);
        assertFiniteAndOrdered(r, d);
        assertEquals(Collections.singletonList("dead_time"), r.parameters);
        double[] plus = freeRun(m.withParameter("dead_time", h), d), zero = freeRun(m, d);
        assertArrayEquals("theta minus = 0 is the nominal model", zero, r.predict, 0);
        int wider = 0;
        for (int i = 0; i < d.size(); i++) {
            double delta = plus[i] - zero[i];
            assertEquals("half-width at " + i, 1.96 * Math.sqrt(sigma * sigma + delta * delta / 3), halfWidth(r, i), 1e-9);
            if (halfWidth(r, i) > 1.96 * sigma * 2) wider++;
        }
        assertTrue("the onset is wider than the residual band", wider > 0);
    }

    /** F1 with the production map (OutputErrorEstimator FOPDT: process_gain, time_constant, baseline) plus h. */
    @Test
    public void productionParameterMap() {
        EventDataset h = holdout(38);
        Map<String, Double> se = new LinkedHashMap<>();
        se.put("process_gain", 0.05 * TRUTH.gain);
        se.put("time_constant", 0.05 * TRUTH.tau);
        se.put("baseline", 0.05);
        PredictionBand.Result r = band(se, 2.5, SIGMA, h);
        assertFiniteAndOrdered(r, h);
        assertEquals(Arrays.asList("process_gain", "time_constant", "baseline", "dead_time"), r.parameters);
        assertEquals(2.5, r.deadTimeHalfWidthS, 0);
        assertTrue("coverage " + r.coverage, r.coverage >= 0 && r.coverage <= 1);
        PredictionBand.Result withoutDelay = band(se, Double.NaN, SIGMA, h);
        assertEquals(Arrays.asList("process_gain", "time_constant", "baseline"), withoutDelay.parameters);
        int onset = -1;
        for (int i = 0; i < h.size(); i++) if (h.t[i] - h.t0 == 3) onset = i;    // between theta - h (1.5 s) and theta (4 s)
        assertTrue("the delay's half-width widens the onset", halfWidth(r, onset) > halfWidth(withoutDelay, onset));
        assertArrayEquals("the same centre", withoutDelay.predict, r.predict, 0);
    }

    /**
     * CHG-211: a band started at the holdout's own pre-step level does not use the training fit's level or drift, so their
     * standard errors stay out; on the fallback (the training level) they stay in, with the numbers of the y0 / v0 form.
     */
    @Test
    public void theHoldoutStartLeavesTheTrainingBaselineOut() {
        EventDataset h = holdout(39);
        Map<String, Double> se = new LinkedHashMap<>();
        se.put("process_gain", 0.05 * TRUTH.gain);
        se.put("baseline", 0.2);
        se.put("baseline_slope", 0.001);
        se.put("time_constant", 0.05 * TRUTH.tau);
        HoldoutStart own = HoldoutStart.of(h, 60, 70, 0.01);                 // 20 pre-step samples around 100
        assertTrue(own.fromHoldout);
        PredictionBand.Result r = PredictionBand.compute(TRUTH, se, Double.NaN, SIGMA, h, 40, own, 60);
        assertFiniteAndOrdered(r, h);
        assertEquals(Arrays.asList("process_gain", "time_constant"), r.parameters);
        assertArrayEquals("centred on the free run from the holdout's level, no drift",
                ZohSimulator.simulate(TRUTH, h.t, h.u, 40, own.y0, 0, h.t0, 60).yHat, r.predict, 0);
        for (int i = 0; i < h.size() && h.t[i] - h.t0 <= 3; i++) {
            assertEquals("before the dead time only the noise, t " + h.t[i], 1.96 * SIGMA, halfWidth(r, i), 1e-9);
        }

        HoldoutStart fallback = HoldoutStart.of(h, 0, 100, 0);              // no window: the training level
        assertFalse(fallback.fromHoldout);
        PredictionBand.Result viaStart = PredictionBand.compute(TRUTH, se, Double.NaN, SIGMA, h, 40, fallback, 60);
        PredictionBand.Result viaLevel = PredictionBand.compute(TRUTH, se, Double.NaN, SIGMA, h, 40, 100, 0, 60);
        assertEquals(Arrays.asList("process_gain", "baseline", "baseline_slope", "time_constant"), viaStart.parameters);
        assertEquals(viaLevel.parameters, viaStart.parameters);
        assertArrayEquals(viaLevel.predict, viaStart.predict, 0);
        assertArrayEquals(viaLevel.lower, viaStart.lower, 0);
        assertArrayEquals(viaLevel.upper, viaStart.upper, 0);
    }
}
