package com.ams.flink.cplm.response.metrics;

import java.util.Arrays;

/**
 * Robust rates (spec §2.5 catalogue: pre_slope "robust pre-event rate", post_slope "robust post-event rate"):
 * the Theil-Sen median of pairwise slopes over the valid samples of a window. A window supports a rate only
 * with at least {@code minSamples} valid samples spread over at least half of it; otherwise null.
 */
public final class Slopes {
    public static final String METHOD = "THEIL_SEN";

    private Slopes() {}

    /** Slope in y-units per second over valid samples with from <= t < to (or <= to when inclusiveEnd), or null. */
    public static Double theilSen(EventDataset d, double from, double to, boolean inclusiveEnd, int minSamples) {
        double[] t = new double[d.size()], y = new double[d.size()];
        int n = 0;
        for (int i = 0; i < d.size(); i++) {
            boolean inside = d.t[i] >= from && (inclusiveEnd ? d.t[i] <= to : d.t[i] < to);
            if (!inside || !d.valid[i] || !Double.isFinite(d.y[i])) continue;
            t[n] = d.t[i];
            y[n] = d.y[i];
            n++;
        }
        if (n < Math.max(3, minSamples)) return null;
        double span = t[n - 1] - t[0];
        if (span < 0.5 * (to - from) || span <= 0) return null;
        return theilSen(t, y, n);
    }

    /**
     * CHG-211: the Theil-Sen slope itself - the median of the pairwise slopes (y_j - y_i) / (t_j - t_i) over the first n points,
     * pairs with t_j > t_i only - with no support rule; null without such a pair.
     */
    public static Double theilSen(double[] t, double[] y, int n) {
        double[] slopes = new double[(int) Math.min((long) n * (n - 1) / 2, Integer.MAX_VALUE - 8)];
        int m = 0;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                double dt = t[j] - t[i];
                if (dt > 0) slopes[m++] = (y[j] - y[i]) / dt;
            }
        }
        if (m == 0) return null;
        Arrays.sort(slopes, 0, m);
        return m % 2 == 1 ? slopes[m / 2] : 0.5 * (slopes[m / 2 - 1] + slopes[m / 2]);
    }
}
