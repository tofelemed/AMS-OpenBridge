package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.StateSpace;
import org.apache.commons.math3.linear.ArrayRealVector;
import org.apache.commons.math3.linear.RealVector;
import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ClosedLoopPemEstimatorTest {
    /** Discrete closed loop: FOPDT plant (Kp=2, theta=10 s, tau=30 s) under a PI controller at Ts = 5 s, output noise sigma. */
    static EventDataset closedLoop(double spStep, double sigma, long seed, int steps) {
        double ts = 5.0, kc = 0.4, ti = 40.0;
        ProcessModel plant = ProcessModel.fopdt("OP_TO_PV", 2.0, 10.0, 30.0);
        StateSpace ss = StateSpace.of(plant);
        StateSpace.Discrete d = ss.discretize(ts);
        int delaySteps = 2;                                             // theta = 10 s = 2 samples
        double[] t = new double[steps], y = new double[steps], r = new double[steps], u = new double[steps];
        boolean[] v = new boolean[steps];
        RealVector x = new ArrayRealVector(1);
        double integral = 0;
        Random rnd = new Random(seed);
        double[] uHist = new double[steps];
        for (int k = 0; k < steps; k++) {
            t[k] = k * ts;
            r[k] = k * ts < 300 ? 50 : 50 + spStep;
            double ySim = 50 + ss.c.operate(x).getEntry(0);
            y[k] = ySim + sigma * rnd.nextGaussian();
            double e = r[k] - y[k];
            integral += e * ts / ti;
            u[k] = 50 + kc * (e + integral);
            uHist[k] = u[k];
            double uDelayed = k - delaySteps >= 0 ? uHist[k - delaySteps] : 50;
            x = d.ad.operate(x).add(d.bd.getColumnVector(0).mapMultiply(uDelayed - 50));
            v[k] = true;
        }
        return new EventDataset(t, y, r, u, v, 0, (steps - 1) * ts);
    }

    @Test
    public void steadyReferenceRoutineNoiseAbstains() {                          // NR-005
        EstimationResult res = new ClosedLoopPemEstimator().estimate(closedLoop(0.0, 0.3, 1, 400), 50, ModelFamily.FOPDT, new EstimatorSettings());
        assertEquals(EstimationResult.State.NO_EXCITATION, res.state);
        assertTrue(res.candidates.isEmpty());
        assertTrue(res.reason.contains("REFERENCE"));
    }

    @Test
    public void aReferenceStepUnderFeedbackYieldsACandidateWithNoiseModel() {     // NR-004 shape, direct PEM
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = 5;
        s.thetaMaxS = 30;
        EstimationResult res = new ClosedLoopPemEstimator().estimate(closedLoop(10.0, 0.2, 2, 400), 50, ModelFamily.FOPDT, s);
        assertEquals(EstimationResult.State.ESTIMATED, res.state);
        ProcessModel m = res.best().model;
        assertEquals(2.0, m.gain, 0.3);
        assertEquals(30.0, m.tau, 8.0);
        assertEquals(10.0, m.theta, 5.0);
        assertEquals("PEM_ARMAX_INNOVATION", new ClosedLoopPemEstimator().methodId());
    }

    @Test
    public void theRegistryRefusesEndpointRatiosOnClosedLoopData() {
        assertEquals("PEM_REQUIRED_FOR_CLOSED_LOOP", EstimatorRegistry.legality(InputPathResolver.Path.OP_TO_PV, EventType.ROUTINE_IDENTIFICATION, ModelFamily.FOPDT));
        assertTrue(EstimatorRegistry.forPath(InputPathResolver.Path.EXOGENOUS_TEST, EventType.INPUT_TEST, ModelFamily.IPDT) instanceof IntegratingEstimator);
        assertNull(EstimatorRegistry.forPath(InputPathResolver.Path.SLAVE_SP_TO_PV, EventType.INPUT_TEST, ModelFamily.FOPDT));
        assertEquals("UNSUPPORTED_MODEL_FAMILY", EstimatorRegistry.legality(InputPathResolver.Path.EXOGENOUS_TEST, EventType.INPUT_TEST, ModelFamily.UNSUPPORTED_INVERSE));
    }
}
