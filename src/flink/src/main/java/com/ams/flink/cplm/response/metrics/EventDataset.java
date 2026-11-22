package com.ams.flink.cplm.response.metrics;

import java.io.Serializable;

/** The accepted samples of one response event: time (s), PV, reference, applied input, validity mask, and the event bounds. */
public final class EventDataset implements Serializable {
    private static final long serialVersionUID = 1L;
    public final double[] t, y, r, u;
    public final boolean[] valid;
    public final double t0, tEnd;

    public EventDataset(double[] t, double[] y, double[] r, double[] u, boolean[] valid, double t0, double tEnd) {
        if (t.length != y.length || t.length != r.length || t.length != u.length || t.length != valid.length) {
            throw new IllegalArgumentException("array lengths differ");
        }
        for (int i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) throw new IllegalArgumentException("time must strictly increase");
        this.t = t;
        this.y = y;
        this.r = r;
        this.u = u;
        this.valid = valid;
        this.t0 = t0;
        this.tEnd = tEnd;
    }

    public int size() { return t.length; }

    /** True when every step equals the first within relTol (relative); fewer than three samples are trivially uniform. */
    public boolean isUniform(double relTol) {
        if (t.length < 3) return true;
        double ts = t[1] - t[0];
        for (int i = 2; i < t.length; i++) {
            if (Math.abs((t[i] - t[i - 1]) - ts) > relTol * ts) return false;
        }
        return true;
    }

    /** The median sample interval (s); 0 when fewer than two samples. */
    public double medianDt() {
        if (t.length < 2) return 0;
        double[] dt = new double[t.length - 1];
        for (int i = 1; i < t.length; i++) dt[i - 1] = t[i] - t[i - 1];
        java.util.Arrays.sort(dt);
        int m = dt.length / 2;
        return dt.length % 2 == 1 ? dt[m] : 0.5 * (dt[m - 1] + dt[m]);
    }

    /**
     * The event on an even grid of step ts from t[0] up to t[n-1]: PV and applied input by linear interpolation, reference by
     * zero-order hold (a setpoint is a step). CHG-217: the input used to be held too, but in AUT the controller output moves every
     * scan, so between historian reads 4-6 s apart it is a continuously moving signal; holding its last read made it lag by half
     * a spacing on average, and the closed-loop fit read the dead time about one step short. A grid sample is valid only when
     * both neighbours are valid (a grid time on a raw sample needs only that sample). The event bounds are unchanged.
     */
    public EventDataset resampledUniform(double ts) {
        int n = t.length;
        if (n < 2 || !(ts > 0)) return this;
        int m = (int) Math.floor((t[n - 1] - t[0]) / ts + 1e-9) + 1;
        double[] gt = new double[m], gy = new double[m], gr = new double[m], gu = new double[m];
        boolean[] gv = new boolean[m];
        int i = 0;
        for (int k = 0; k < m; k++) {
            double g = t[0] + k * ts;
            while (i < n - 2 && t[i + 1] <= g + 1e-9) i++;
            gt[k] = g;
            if (g >= t[n - 1] - 1e-9) {
                gy[k] = y[n - 1];
                gr[k] = r[n - 1];
                gu[k] = u[n - 1];
                gv[k] = valid[n - 1];
            } else if (Math.abs(g - t[i]) <= 1e-9) {
                gy[k] = y[i];
                gr[k] = r[i];
                gu[k] = u[i];
                gv[k] = valid[i];
            } else {
                double f = (g - t[i]) / (t[i + 1] - t[i]);
                gy[k] = y[i] + f * (y[i + 1] - y[i]);
                gr[k] = r[i];
                gu[k] = u[i] + f * (u[i + 1] - u[i]);
                gv[k] = valid[i] && valid[i + 1];
            }
        }
        return new EventDataset(gt, gy, gr, gu, gv, t0, tEnd);
    }
}
