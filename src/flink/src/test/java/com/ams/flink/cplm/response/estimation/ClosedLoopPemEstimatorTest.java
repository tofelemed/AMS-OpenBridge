package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.StateSpace;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.apache.commons.math3.linear.ArrayRealVector;
import org.apache.commons.math3.linear.RealVector;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
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

    /**
     * CHG-210: the ResponseUniformGridTest loop, noise-free - FOPDT plant (Kp 2, theta 10 s, tau 30 s) under a PI controller
     * (Kc 0.4, Ti 40 s) on a 0.1 s clock, the setpoint 50 -> 60 at 100 s, read every 5 s from 40 s (the capture's 60 s
     * pre-support) to 700 s.
     */
    static EventDataset servoStepReadEvery5s() {
        double h = 0.1, kp = 2, theta = 10, tau = 30, kc = 0.4, ti = 40;
        int delay = (int) Math.round(theta / h), steps = 7001;
        double[] uHist = new double[steps];
        List<double[]> rows = new ArrayList<>();
        double x = 0, integral = 0;
        for (int k = 0; k < steps; k++) {
            double t = k * h, sp = t < 100 ? 50 : 60, y = 50 + x, e = sp - y;
            integral += e * h / ti;
            double u = 50 + kc * (e + integral);
            uHist[k] = u;
            double uDelayed = k >= delay ? uHist[k - delay] : 50;
            x += h * (-x + kp * (uDelayed - 50)) / tau;
            if (k % 50 == 0 && t >= 40 - 1e-9) rows.add(new double[] {t, y, sp, u});
        }
        int m = rows.size();
        double[] t = new double[m], y = new double[m], r = new double[m], u = new double[m];
        boolean[] v = new boolean[m];
        for (int i = 0; i < m; i++) {
            t[i] = rows.get(i)[0];
            y[i] = rows.get(i)[1];
            r[i] = rows.get(i)[2];
            u[i] = rows.get(i)[3];
            v[i] = true;
        }
        return new EventDataset(t, y, r, u, v, 100, t[m - 1]);
    }

    /** CHG-210: the PEM candidate free-runs from (y0, u0) - its y0 is the PV level the model holds at the pre-step input. */
    @Test
    public void pemFreeRunMatchesTrainingEvent() {
        EventDataset d = servoStepReadEvery5s();
        double u0 = 0, yPre = 0, step = 10;
        int pre = 0;
        for (int i = 0; i < d.size() && d.t[i] < d.t0; i++) {
            u0 = d.u[i];                                                   // the capture's u0: the last pre-step input
            yPre += d.y[i];
            pre++;
        }
        yPre /= pre;
        EstimatorSettings s = new EstimatorSettings();
        s.thetaMaxS = 30;
        s.tauMaxS = 300;
        EstimationResult res = new ClosedLoopPemEstimator().estimate(d, u0, ModelFamily.FOPDT, s);
        EstimationResult.Candidate best = res.best();
        assertNotNull(res.state + " " + res.reason, best);
        ZohSimulator.Result run = ZohSimulator.simulate(best.model, d.t, d.u, u0, best.y0, best.v0, d.t0, 60);
        double sse = 0;
        int n = 0;
        for (int i = 0; i < d.size(); i++) {
            if (!run.valid[i]) continue;
            sse += (d.y[i] - run.yHat[i]) * (d.y[i] - run.yHat[i]);
            n++;
        }
        assertEquals(d.size(), n);
        double rms = Math.sqrt(sse / n);
        String what = best.model + " y0 " + best.y0 + " pre-step PV " + yPre + " free-run RMS " + rms;
        // reported, not asserted yet: the recovered dead time against the true 10 s
        System.out.println("CHG-210 PEM noise-free 5 s: dead time " + best.model.theta + " s (true 10 s), gain " + best.model.gain
                + ", tau " + best.model.tau + " s, y0 error " + (best.y0 - yPre) + ", free-run RMS " + rms);
        assertTrue("y0 off the pre-step PV: " + what, Math.abs(best.y0 - yPre) < 0.02 * step);
        assertTrue("free run off the training event: " + what, rms < 0.02 * step);
    }

    /** CHG-210: centred on the valid pre-step samples; fewer than three of them falls back to the event means. */
    @Test
    public void centresOnThePreStepSteadyStateOrFallsBackToTheMeans() {
        double[] t = {0, 1, 2, 3, 4, 5}, y = {10, 11, 99, 12, 30, 40}, u = {1, 2, 99, 3, 7, 8};
        boolean[] v = {true, true, false, true, true, true};
        double[] ref = ClosedLoopPemEstimator.centre(new EventDataset(t, y, new double[6], u, v, 4, 5));
        assertEquals("valid pre-step PV mean", 11.0, ref[0], 1e-12);
        assertEquals("valid pre-step OP mean", 2.0, ref[1], 1e-12);
        double[] fallback = ClosedLoopPemEstimator.centre(new EventDataset(t, y, new double[6], u, v, 2, 5));
        assertEquals("two pre-step samples: the event mean", (10 + 11 + 99 + 12 + 30 + 40) / 6.0, fallback[0], 1e-12);
        assertEquals((1 + 2 + 99 + 3 + 7 + 8) / 6.0, fallback[1], 1e-12);
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
