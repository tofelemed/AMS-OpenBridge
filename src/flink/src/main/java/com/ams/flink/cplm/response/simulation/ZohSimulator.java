package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.estimation.FitBudgetExceeded;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.RealMatrix;

import java.util.HashMap;
import java.util.Map;

/**
 * Exact zero-order-hold simulation of a path model on the ACTUAL sample instants (irregular is
 * fine): y_hat(t_i) = y0 + v0 (t_i - t0) + C x(t_i), x driven by the delayed input deviation
 * (u(s - theta) - u0), stepping exactly between every sample and every delayed-input breakpoint.
 * A gap longer than maxBridgeS is not bridged: outputs from there on are invalid (spec §2.7).
 *
 * <p>CHG-075 (speed, same numbers): the delayed-input breakpoints are walked by a cursor - O(n) per
 * simulation instead of O(n^2) - order 1 (FOPDT, IPDT) uses the closed form instead of expm, and the state
 * update runs on plain arrays. Rebasing the times and keying the cache on whole microseconds were measured and
 * NOT adopted: on epoch-second times they moved fitted parameters by up to 1.3e-6 relative (parity bound 1e-9).
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
        return simulate(m, t, u, u0, y0, v0, t0, maxBridgeS, 0);
    }

    /** CHG-075: as above, checking the fit deadline (System.nanoTime() scale, 0 = none) every 256 samples. */
    public static Result simulate(ProcessModel m, double[] t, double[] u, double u0, double y0, double v0, double t0, double maxBridgeS,
                                  long deadlineNanos) {
        int n = t.length;
        double[] yHat = new double[n];
        boolean[] valid = new boolean[n];
        if (n == 0) return new Result(yHat, valid, null);
        StateSpace ss = StateSpace.of(m);
        InputReconstruction.Cursor in = new InputReconstruction(t, u, u0, m.theta).cursor();
        Stepper stepper = ss.order() == 1 ? new FirstOrder(m) : new MatrixStepper(ss);
        double[] c = ss.c.getRow(0);
        yHat[0] = y0 + v0 * (t[0] - t0);
        valid[0] = true;
        String stop = null;
        for (int i = 1; i < n; i++) {
            if ((i & 255) == 0) FitBudgetExceeded.check(deadlineNanos);
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
            double from = t[i - 1], to = t[i];
            double held = in.heldAfter(from);
            for (double bp = in.nextBefore(to); !Double.isNaN(bp); bp = in.nextBefore(to)) {
                stepper.step(bp - from, held - u0);
                from = bp;
                held = in.heldAfter(bp);
            }
            stepper.step(to - from, held - u0);
            double cx = 0;
            for (int k = 0; k < c.length; k++) cx += c[k] * stepper.x[k];
            yHat[i] = y0 + v0 * (t[i] - t0) + cx;
            valid[i] = true;
        }
        return new Result(yHat, valid, stop);
    }

    /** x <- Ad(h) x + Bd(h) uDev for the exact interval h (keyed by its bits, as before CHG-075). */
    abstract static class Stepper {
        final double[] x;
        private long lastKey;
        private boolean loaded;

        Stepper(int order) { this.x = new double[order]; }

        final void step(double h, double uDev) {
            if (h <= 0) return;
            long key = Double.doubleToLongBits(h);
            if (!loaded || key != lastKey) {
                load(key, h);
                lastKey = key;
                loaded = true;
            }
            apply(uDev);
        }

        abstract void load(long key, double h);

        abstract void apply(double uDev);
    }

    /** Order 1 in closed form - FOPDT: ad = exp(-h/tau), bd = K(1 - ad) taken as -K expm1(-h/tau); IPDT: ad = 1, bd = K h. */
    static final class FirstOrder extends Stepper {
        private final boolean integrating;
        private final double gain, tau;
        private double ad, bd;

        FirstOrder(ProcessModel m) {
            super(1);
            if (m.family != ModelFamily.FOPDT && m.family != ModelFamily.IPDT) throw new IllegalArgumentException(m.family + " is not first order");
            this.integrating = m.family == ModelFamily.IPDT;
            this.gain = m.gain;
            this.tau = m.tau;
        }

        @Override
        void load(long key, double h) {
            if (integrating) {
                ad = 1;
                bd = gain * h;
            } else {
                ad = Math.exp(-h / tau);
                bd = -gain * Math.expm1(-h / tau);
            }
        }

        @Override
        void apply(double uDev) {
            x[0] = ad * x[0] + bd * uDev;
        }
    }

    /** Higher orders: exact ZOH via expm, cached per interval within one simulation. */
    static final class MatrixStepper extends Stepper {
        private final StateSpace ss;
        private final Map<Long, double[][]> cache = new HashMap<>();
        private final double[] next;
        private double[][] ad;
        private double[] bd;

        MatrixStepper(StateSpace ss) {
            super(ss.order());
            this.ss = ss;
            this.next = new double[ss.order()];
        }

        @Override
        void load(long key, double h) {
            double[][] e = cache.computeIfAbsent(key, k -> {
                StateSpace.Discrete d = ss.discretize(h);
                RealMatrix a = d.ad;
                double[][] out = new double[a.getRowDimension() + 1][];
                for (int r = 0; r < a.getRowDimension(); r++) out[r] = a.getRow(r);
                out[a.getRowDimension()] = d.bd.getColumn(0);           // the last row holds Bd
                return out;
            });
            ad = e;
            bd = e[x.length];
        }

        @Override
        void apply(double uDev) {
            int n = x.length;
            for (int r = 0; r < n; r++) {                               // the same summation order as RealMatrix.operate
                double s = 0;
                for (int k = 0; k < n; k++) s += ad[r][k] * x[k];
                next[r] = s + bd[r] * uDev;
            }
            System.arraycopy(next, 0, x, 0, n);
        }
    }
}
