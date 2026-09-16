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
        List<Double> out = new ArrayList<>();
        for (double tj : t) {
            double s = tj + theta;
            if (s > from && s < to) out.add(s);
            if (s >= to) break;
        }
        double[] r = new double[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i);
        return r;
    }
}
