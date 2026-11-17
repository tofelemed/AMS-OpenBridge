package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.OutputErrorEstimatorTest;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-209: the 95 % prediction band of the System Response model check - the model's free run on the holdout widened by the
 * parameter standard errors (linearised: central-difference sensitivities of the ZOH simulation) and the fit's residual noise.
 * A well-identified model's band holds the holdout; more parameter uncertainty widens it; without standard errors it is the
 * residual band +-1.96 sigma; the baseline's standard error widens every sample alike; invalid samples carry no band.
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
        return PredictionBand.compute(TRUTH, se, sigma, h, 40, 100, 0, 60);
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
        PredictionBand.Result r = PredictionBand.compute(ipdt, Collections.singletonMap("baseline_slope", 0.001), SIGMA, h, 40, 100, 0, 60);
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
}
