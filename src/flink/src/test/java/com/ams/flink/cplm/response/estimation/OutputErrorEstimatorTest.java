package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class OutputErrorEstimatorTest {
    /** §2.11 FOPDT step 40->45 pp with Gaussian noise sigma, on a dt grid with 20 s of pre-support. */
    public static EventDataset synthetic(ProcessModel truth, double noiseSigma, long seed, double dt, double end, double du) {
        int n = (int) Math.round((end + 20) / dt) + 1;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = -20 + i * dt;
            u[i] = t[i] < 0 ? 40 : 40 + du;
        }
        ZohSimulator.Result sim = ZohSimulator.simulate(truth, t, u, 40, 100, 0, 0, 60);
        Random rnd = new Random(seed);
        double[] y = new double[n], r = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            y[i] = sim.yHat[i] + noiseSigma * rnd.nextGaussian();
            r[i] = 100;
            v[i] = true;
        }
        return new EventDataset(t, y, r, u, v, 0, end);
    }

    static EstimatorSettings settings() {
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = 5;
        s.thetaMaxS = 60;
        s.tauMaxS = 600;
        return s;
    }

    @Test
    public void recoversTheSpecFopdtExactlyWithoutNoise() {                    // NR-001, the reference curve
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.0, 1, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
        assertEquals(EstimationResult.State.ESTIMATED, r.state);
        ProcessModel m = r.best().model;
        assertEquals(3.0, m.gain, 0.005);
        assertEquals(4.0, m.theta, 0.05);
        assertEquals(20.0, m.tau, 0.05);
        assertFalse(r.best().boundsHit);
        assertEquals("OE_LM_DELAY_PROFILE", new OutputErrorEstimator().methodId());
    }

    @Test
    public void recoversTheSpecFopdtUnderNoiseWithinItsOwnStandardErrors() {  // NR-001 "under documented solver tolerance"
        // sigma = 0.2 t/h on a 15 t/h response at 5 s: the recovered values must sit within three of the
        // standard errors the fit itself reports - and those errors must be honest (theta at least the
        // grid-implied uncertainty), not tighter than the noise allows.
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        for (long seed : new long[] {11, 5, 3}) {
            EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, seed, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
            assertEquals(EstimationResult.State.ESTIMATED, r.state);
            EstimationResult.Candidate c = r.best();
            double seGain = c.stdErr.get("process_gain"), seTau = c.stdErr.get("time_constant");
            assertTrue("gain se " + seGain, seGain > 0 && seGain < 0.05);
            assertEquals("seed " + seed, 3.0, c.model.gain, 3 * seGain);
            assertEquals("seed " + seed, 20.0, c.model.tau, 3 * seTau);
            assertEquals("seed " + seed, 4.0, c.model.theta, c.thetaUncertaintyS + 0.5);
            assertFalse(c.boundsHit);
            assertFalse(c.signUncertain);
        }
    }

    @Test
    public void negativeGainIsRecoveredSigned() {                              // NR-002
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", -3.0, 4.0, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 5, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
        EstimationResult.Candidate c = r.best();
        assertEquals(-3.0, c.model.gain, 3 * c.stdErr.get("process_gain"));
        assertTrue(c.model.gain < -2.5);
        assertFalse(c.signUncertain);
    }

    @Test
    public void subGridDelayIsFlatAndUncertainNotFalselyPrecise() {           // NR-010
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 0.5, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 3, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
        assertTrue(r.best().flatDelay);
        assertTrue("theta uncertainty must be at least half the grid", r.best().thetaUncertaintyS >= 2.5);
    }

    @Test
    public void repeatedPolesEstimateToFiniteValues() {                        // NR-013
        ProcessModel truth = ProcessModel.sopdt("OP_TO_PV", 2.0, 5.0, 10.0, 10.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.05, 2, 2, 200, 5), 40, ModelFamily.SOPDT, settings());
        assertEquals(EstimationResult.State.ESTIMATED, r.state);
        assertTrue(Double.isFinite(r.best().model.tau) && Double.isFinite(r.best().model.tau2));
        assertEquals(2.0, r.best().model.gain, 0.05);
        assertEquals(20.0, r.best().model.tau + r.best().model.tau2, 1.5);     // the sum is well identified; the split is not
    }

    @Test
    public void noExcitationIsNotAModel() {                                    // NR-006
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 9, 5, 200, 0.0), 40, ModelFamily.FOPDT, settings());
        assertEquals(EstimationResult.State.NO_EXCITATION, r.state);
        assertTrue(r.candidates.isEmpty());
    }
}
