package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;

import java.util.Random;

/**
 * CHG-075: fixed-seed step events for the fit parity test, the budget test and the bench. The PV is
 * written from the analytic step response, NOT from ZohSimulator, so a change in the simulator cannot
 * change the data it is judged on. Times are built the way the job builds them: integer epoch ms / 1000.
 */
public final class ResponseFitFixtures {
    /** 2026-10-05 epoch ms - the scale the Response job sees (eventTsMs / 1000.0). */
    public static final long EPOCH_MS = 1_791_191_779_702L;
    public static final double U_BEFORE = 40, DU = 5, Y_BASE = 100;

    private ResponseFitFixtures() {}

    /** n instants from baseMs on a stepMs grid, each moved by an integer jitter in [-jitterMs, jitterMs]. */
    public static double[] times(long baseMs, int n, long stepMs, int jitterMs, long seed) {
        Random rnd = new Random(seed);
        double[] t = new double[n];
        for (int i = 0; i < n; i++) {
            long j = jitterMs == 0 || i == 0 ? 0 : rnd.nextInt(2 * jitterMs + 1) - jitterMs;
            t[i] = (baseMs + i * stepMs + j) / 1000.0;
        }
        return t;
    }

    /** The analytic truth of a step: "FOPDT" {K, theta, tau}, "SOPDT" {K, theta, tau1, tau2}, "IPDT" {ki, theta, v0}. */
    public static EventDataset stepEvent(String family, double[] p, double[] t, double preSupportS, double noise, long seed) {
        int n = t.length, k = 0;
        while (k < n && t[k] < t[0] + preSupportS) k++;
        double ts = t[k];                                                  // the input changes AT a sample (held)
        double[] y = new double[n], u = new double[n], r = new double[n];
        boolean[] v = new boolean[n];
        Random rnd = new Random(seed);
        for (int i = 0; i < n; i++) {
            u[i] = i < k ? U_BEFORE : U_BEFORE + DU;
            double s = t[i] - ts - p[1];
            double resp;
            switch (family) {
                case "FOPDT":
                    resp = s <= 0 ? 0 : p[0] * DU * (1 - Math.exp(-s / p[2]));
                    break;
                case "SOPDT":
                    resp = s <= 0 ? 0 : p[0] * DU * (1 - (p[2] * Math.exp(-s / p[2]) - p[3] * Math.exp(-s / p[3])) / (p[2] - p[3]));
                    break;
                default:
                    resp = p[2] * (t[i] - ts) + (s <= 0 ? 0 : p[0] * DU * s);
                    break;
            }
            y[i] = Y_BASE + resp + noise * rnd.nextGaussian();
            r[i] = Y_BASE;
            v[i] = true;
        }
        return new EventDataset(t, y, r, u, v, ts, t[n - 1]);
    }

    /** Production defaults of ResponseJobConfig (theta 0..600 s on a 5 s grid, tau up to 7200 s). */
    public static EstimatorSettings productionSettings() {
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = 5;
        s.thetaMaxS = 600;
        s.tauMaxS = 7200;
        s.maxBridgeS = 60;
        s.minInputEu = 1.0;
        return s;
    }

    /** The small grid the parity cases use (as OutputErrorEstimatorTest.settings()). */
    public static EstimatorSettings paritySettings() {
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = 5;
        s.thetaMaxS = 60;
        s.tauMaxS = 600;
        return s;
    }
}
