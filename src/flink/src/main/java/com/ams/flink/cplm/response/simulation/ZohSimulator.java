package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.ArrayRealVector;
import org.apache.commons.math3.linear.RealVector;

import java.util.HashMap;
import java.util.Map;

/**
 * Exact zero-order-hold simulation of a path model on the ACTUAL sample instants (irregular is
 * fine): y_hat(t_i) = y0 + v0 (t_i - t0) + C x(t_i), x driven by the delayed input deviation
 * (u(s - theta) - u0), stepping exactly between every sample and every delayed-input breakpoint.
 * A gap longer than maxBridgeS is not bridged: outputs from there on are invalid (spec §2.7).
 */
public final class ZohSimulator {
    public static final String GAP_EXCEEDS_MAX_BRIDGE = "GAP_EXCEEDS_MAX_BRIDGE";

    public static final class Result {
        public final double[] yHat;
        public final boolean[] valid;
        /** null, or GAP_EXCEEDS_MAX_BRIDGE. */
        public final String stopReason;

        Result(double[] yHat, boolean[] valid, String stopReason) {
            this.yHat = yHat;
            this.valid = valid;
            this.stopReason = stopReason;
        }
    }

    private ZohSimulator() {}

    public static Result simulate(ProcessModel m, double[] t, double[] u, double u0, double y0, double v0, double t0, double maxBridgeS) {
        int n = t.length;
        double[] yHat = new double[n];
        boolean[] valid = new boolean[n];
        if (n == 0) return new Result(yHat, valid, null);
        StateSpace ss = StateSpace.of(m);
        InputReconstruction in = new InputReconstruction(t, u, u0, m.theta);
        Map<Long, StateSpace.Discrete> cache = new HashMap<>();
        RealVector x = new ArrayRealVector(ss.order());
        yHat[0] = y0 + v0 * (t[0] - t0);
        valid[0] = true;
        String stop = null;
        for (int i = 1; i < n; i++) {
            if (stop != null) {
                yHat[i] = Double.NaN;
                continue;
            }
            double dt = t[i] - t[i - 1];
            if (!(dt > 0)) throw new IllegalArgumentException("time must strictly increase at index " + i);
            if (dt > maxBridgeS) {
                stop = GAP_EXCEEDS_MAX_BRIDGE;
                yHat[i] = Double.NaN;
                continue;
            }
            double from = t[i - 1];
            for (double bp : in.breakpointsWithin(t[i - 1], t[i])) {
                x = step(ss, cache, x, bp - from, in.delayedAt(from) - u0);
                from = bp;
            }
            x = step(ss, cache, x, t[i] - from, in.delayedAt(from) - u0);
            yHat[i] = y0 + v0 * (t[i] - t0) + ss.c.operate(x).getEntry(0);
            valid[i] = true;
        }
        return new Result(yHat, valid, stop);
    }

    private static RealVector step(StateSpace ss, Map<Long, StateSpace.Discrete> cache, RealVector x, double h, double uDev) {
        if (h <= 0) return x;
        StateSpace.Discrete d = cache.computeIfAbsent(Double.doubleToLongBits(h), k -> ss.discretize(h));
        return d.ad.operate(x).add(d.bd.getColumnVector(0).mapMultiply(uDev));
    }
}
