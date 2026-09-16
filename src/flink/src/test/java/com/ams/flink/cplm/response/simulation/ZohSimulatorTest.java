package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ZohSimulatorTest {
    /** §2.11: exogenous 40->45 pp, FOPDT Kp=3 t/h per pp, theta=4 s, tau=20 s, PV 100->115 t/h. */
    private static final ProcessModel FIC = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);

    private static double[] grid(double from, double to, double dt) {
        int n = (int) Math.round((to - from) / dt) + 1;
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = from + i * dt;
        return t;
    }

    private static double[] step(double[] t, double t0, double before, double after) {
        double[] u = new double[t.length];
        for (int i = 0; i < t.length; i++) u[i] = t[i] < t0 ? before : after;
        return u;
    }

    private static double ideal(double t) { // ideal model after the delay
        return t <= 4.0 ? 100.0 : 100.0 + 15.0 * (1.0 - Math.exp(-(t - 4.0) / 20.0));
    }

    @Test
    public void fopdtStepMatchesTheClosedFormToTenDigits() {
        double[] t = grid(0, 120, 0.5);
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(FIC, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) {
            assertTrue(r.valid[i]);
            assertEquals("t=" + t[i], ideal(t[i]), r.yHat[i], 1e-9);
        }
        assertEquals(100.0 + 15.0 * (1 - Math.exp(-1)), r.yHat[48], 1e-9);   // t = 24 = theta + tau
        assertEquals(ideal(120.0), r.yHat[t.length - 1], 1e-9);
    }

    @Test
    public void irregularSamplingEqualsTheUniformReference() {
        double[] t = {0, 5, 12, 15, 22, 30, 31, 45, 60, 77, 90, 120};
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(FIC, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) assertEquals("t=" + t[i], ideal(t[i]), r.yHat[i], 1e-9);
    }

    @Test
    public void fractionalDelayLandsBetweenSamples() {
        // theta = 4.3 s on a 5 s grid: the delayed input changes inside [0,5)
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.3, 20.0);
        double[] t = grid(0, 60, 5.0);
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        double expected10 = 100.0 + 15.0 * (1.0 - Math.exp(-(10 - 4.3) / 20.0));
        assertEquals(expected10, r.yHat[2], 1e-9);
    }

    @Test
    public void repeatedPolesSimulateWithoutDividingByTheirDifference() {   // NR-013
        ProcessModel m = ProcessModel.sopdt("OP_TO_PV", 2.0, 0.0, 10.0, 10.0);
        double[] t = grid(0, 100, 1.0);
        double[] u = step(t, 0.0, 0.0, 1.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 0.0, 0.0, 0.0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) {
            double x = t[i] / 10.0;
            double critical = 2.0 * (1.0 - (1.0 + x) * Math.exp(-x));      // critically damped closed form
            assertEquals("t=" + t[i], critical, r.yHat[i], 1e-9);
            assertFalse(Double.isNaN(r.yHat[i]));
        }
    }

    @Test
    public void integratingStepChangesTheSlopeAfterTheDelay() {            // §2.11 LIC example
        double v0 = 0.010 / 60.0;                                          // 0.010 m/min pre-slope
        double ki = 0.010 / 60.0;                                          // 0.000166667 m/(s*pp)
        ProcessModel m = ProcessModel.ipdt("OP_TO_PV", ki, 12.0);
        double[] t = grid(0, 120, 1.0);
        double[] u = step(t, 0.0, 50.0, 52.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 50.0, 1.0, v0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) {
            double expected = 1.0 + v0 * t[i] + ki * 2.0 * Math.max(0, t[i] - 12.0);
            assertEquals("t=" + t[i], expected, r.yHat[i], 1e-9);
        }
        double slopeAfter = (r.yHat[100] - r.yHat[90]) / 10.0;
        assertEquals(0.030 / 60.0, slopeAfter, 1e-9);                      // 0.030 m/min
    }

    @Test
    public void aGapLongerThanMaxBridgeStopsTheSimulation() {
        double[] t = {0, 5, 10, 15, 200, 205, 210};
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(FIC, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        assertTrue(r.valid[3]);
        assertFalse(r.valid[4]);
        assertFalse(r.valid[6]);
        assertEquals("GAP_EXCEEDS_MAX_BRIDGE", r.stopReason);
    }

    @Test
    public void underdampedSecondOrderHitsTheClosedFormPeak() {
        double zeta = 0.3, wn = 0.2;
        ProcessModel m = ProcessModel.underdamped("OP_TO_PV", 1.0, 0.0, zeta, wn);
        double[] t = grid(0, 60, 0.05);
        double[] u = step(t, 0.0, 0.0, 1.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 0.0, 0.0, 0.0, 0.0, 60.0);
        double wd = wn * Math.sqrt(1 - zeta * zeta);
        double tp = Math.PI / wd;
        double peak = 1.0 + Math.exp(-zeta * wn * tp);
        int ip = (int) Math.round(tp / 0.05);
        assertEquals(peak, r.yHat[ip], 1e-3);
    }
}
