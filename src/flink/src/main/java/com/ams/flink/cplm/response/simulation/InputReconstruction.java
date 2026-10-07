package com.ams.flink.cplm.response.simulation;

import java.util.ArrayList;
import java.util.List;

/**
 * The applied input as a held signal (each sample holds until the next), delayed by theta:
 * u_delayed(s) = u(s - theta); before the first sample the baseline u0 applies. Breakpoints are the
 * instants where the delayed input changes - the exact ZOH step is split there (fractional delay
 * without interpolating the STATE, spec §2.7).
 */
public final class InputReconstruction {
    private final double[] t;
    private final double[] u;
    private final double u0;
    private final double theta;

    public InputReconstruction(double[] t, double[] u, double u0, double theta) {
        if (t.length != u.length) throw new IllegalArgumentException("t and u differ in length");
        this.t = t;
        this.u = u;
        this.u0 = u0;
        this.theta = theta;
    }

    /** Held, delayed input value at instant s. */
    public double delayedAt(double s) {
        double src = s - theta;
        if (t.length == 0 || src < t[0]) return u0;
        int lo = 0, hi = t.length - 1;
        while (lo < hi) {                      // largest j with t[j] <= src
            int mid = (lo + hi + 1) >>> 1;
            if (t[mid] <= src) lo = mid; else hi = mid - 1;
        }
        return u[lo];
    }

    /** Instants strictly inside (from, to) at which the delayed input can change: t[j] + theta. */
    public double[] breakpointsWithin(double from, double to) {
        int lo = 0, hi = t.length;             // CHG-075: binary search for the first t[j] + theta > from, not a scan from 0
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (t[mid] + theta > from) hi = mid; else lo = mid + 1;
        }
        List<Double> out = new ArrayList<>();
        for (int j = lo; j < t.length; j++) {
            double s = t[j] + theta;
            if (s >= to) break;
            out.add(s);
        }
        double[] r = new double[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i);
        return r;
    }

    /** CHG-075: a forward walk over the breakpoints for one simulation - O(n) in total. */
    public Cursor cursor() { return new Cursor(); }

    /**
     * Breakpoint j (t[j] + theta) starts the hold of u[j]; the value is taken from the breakpoint's own
     * index, never re-derived by subtracting theta again (which can round to the previous sample).
     */
    public final class Cursor {
        private int j;
        private double held = u0;

        private Cursor() {}

        /** Passes every breakpoint at or before s; returns the delayed input held from s on. */
        public double heldAfter(double s) {
            while (j < t.length && t[j] + theta <= s) held = u[j++];
            return held;
        }

        /** The next not-yet-passed breakpoint if it lies strictly before {@code to}, else NaN. Does not pass it. */
        public double nextBefore(double to) {
            if (j >= t.length) return Double.NaN;
            double s = t[j] + theta;
            return s < to ? s : Double.NaN;
        }
    }
}
