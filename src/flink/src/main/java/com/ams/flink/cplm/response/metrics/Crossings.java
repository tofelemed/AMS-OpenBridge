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

    /**
     * Sustained means observed: every valid sample from the crossing up to the end of the dwell stays at or
     * above the level AND the first valid sample at or after the dwell's end is above it too. Between samples
     * nothing is assumed - an irregular grid (a 7 s gap round a 5 s dwell) must not refuse a crossing that the
     * next observations confirm, and a declared record end must not vouch for a dwell no sample observed.
     */
    private static boolean sustained(EventDataset d, double[] p, double level, int from, double until) {
        for (int j = from; j < d.size(); j++) {
            if (Double.isNaN(p[j])) continue;
            if (p[j] < level) return false;
            if (d.t[j] >= until) return true;                              // the dwell's end is observed above the level
        }
        return false;                                                      // the dwell ran past the last observation
    }
}
