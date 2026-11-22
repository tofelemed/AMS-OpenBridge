package com.ams.flink.cplm.response;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * CHG-212: a loop's P / I / D as they changed, oldest first: {@code [sinceS, p, i, d, change(1/0)]} (NaN = not sent). The
 * first value ever seen is not a change; a sample without P records nothing. Kept for a retention window, plus the entry
 * in force at its start, so the tuning at any step still in the capture ring can be looked up.
 */
final class TuningHistory implements Serializable {
    private static final long serialVersionUID = 1L;
    private final List<double[]> entries = new ArrayList<>();

    /** Records the sample's tuning at tS; true when it differs from the tuning seen before (not on first sight). */
    boolean note(Double pIn, Double iIn, Double dIn, double tS, double retainedS) {
        if (pIn == null || !Double.isFinite(pIn)) return false;
        double p = pIn, i = finiteOrNaN(iIn), d = finiteOrNaN(dIn);
        double[] last = entries.isEmpty() ? null : entries.get(entries.size() - 1);
        if (last != null && same(last[1], p) && same(last[2], i) && same(last[3], d)) return false;
        entries.add(new double[] {tS, p, i, d, last == null ? 0 : 1});
        while (entries.size() > 1 && entries.get(1)[0] < tS - retainedS) entries.remove(0);
        return last != null;
    }

    /** The tuning in force at tS, {@code [sinceS, p, i, d]}; null when none had arrived by then. */
    double[] at(double tS) {
        double[] in = null;
        for (double[] e : entries) {
            if (e[0] > tS) break;
            in = e;
        }
        return in == null ? null : new double[] {in[0], in[1], in[2], in[3]};
    }

    /** The time of the first change after t0, or NaN when the tuning has not changed since. */
    double firstChangeAfter(double t0) {
        for (double[] e : entries) if (e[4] > 0 && e[0] > t0) return e[0];
        return Double.NaN;
    }

    void copyFrom(TuningHistory other) {
        entries.clear();
        for (double[] e : other.entries) entries.add(e.clone());
    }

    private static double finiteOrNaN(Double v) {
        return v == null || !Double.isFinite(v) ? Double.NaN : v;
    }

    private static boolean same(double a, double b) {
        if (Double.isNaN(a) || Double.isNaN(b)) return Double.isNaN(a) && Double.isNaN(b);
        return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
    }
}
