package com.ams.flink.cplm.response.metrics;

/**
 * Direction-normalised progress p(t) = (y - y0)/(yss - y0) and the FIRST SUSTAINED crossing of a
 * level: the crossing instant is linearly interpolated between the bracketing samples and accepted
 * only if every valid sample in the following dwell stays at or above the level, with the record
 * covering that dwell. No crossing -> null (never 0). Spec §2.5.
 */
public final class Crossings {
    private Crossings() {}

    public static double[] progress(EventDataset d, double y0, double yss) {
        double dy = yss - y0;
        double[] p = new double[d.size()];
        for (int i = 0; i < p.length; i++) p[i] = d.valid[i] && dy != 0 ? (d.y[i] - y0) / dy : Double.NaN;
        return p;
    }

    /** Seconds after t0 of the first sustained crossing of {@code level}, or null. */
    public static Double firstSustained(EventDataset d, double[] p, double level, double dwellS) {
        int n = d.size();
        for (int i = 1; i < n; i++) {
            if (d.t[i] < d.t0) continue;
            if (Double.isNaN(p[i]) || Double.isNaN(p[i - 1])) continue;
            if (p[i - 1] < level && p[i] >= level) {
                double frac = (level - p[i - 1]) / (p[i] - p[i - 1]);
                double tc = d.t[i - 1] + frac * (d.t[i] - d.t[i - 1]);
                if (sustained(d, p, level, i, tc + dwellS)) return tc - d.t0;
            } else if (i == 1 && p[0] >= level && d.t[0] >= d.t0 && sustained(d, p, level, 0, d.t[0] + dwellS)) {
                return d.t[0] - d.t0;                                  // direct feedthrough at t0 (spec allows it)
            }
        }
        return null;
    }

    private static boolean sustained(EventDataset d, double[] p, double level, int from, double until) {
        double lastValid = Double.NaN;
        for (int j = from; j < d.size() && d.t[j] <= until; j++) {
            if (Double.isNaN(p[j])) continue;
            if (p[j] < level) return false;
            lastValid = d.t[j];
        }
        return !Double.isNaN(lastValid) && d.tEnd >= until;             // the dwell must be observed, not assumed
    }
}
