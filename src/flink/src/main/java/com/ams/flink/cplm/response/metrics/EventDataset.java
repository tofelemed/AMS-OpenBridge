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
}
