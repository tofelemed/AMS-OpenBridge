package com.ams.flink.cplm.response.metrics;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

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
        List<double[]> pts = new ArrayList<>();
        for (int i = 0; i < d.size(); i++) {
            boolean inside = d.t[i] >= from && (inclusiveEnd ? d.t[i] <= to : d.t[i] < to);
            if (!inside || !d.valid[i] || !Double.isFinite(d.y[i])) continue;
            pts.add(new double[] {d.t[i], d.y[i]});
        }
        if (pts.size() < Math.max(3, minSamples)) return null;
        double span = pts.get(pts.size() - 1)[0] - pts.get(0)[0];
        if (span < 0.5 * (to - from) || span <= 0) return null;
        List<Double> slopes = new ArrayList<>();
        for (int i = 0; i < pts.size(); i++) {
            for (int j = i + 1; j < pts.size(); j++) {
                double dt = pts.get(j)[0] - pts.get(i)[0];
                if (dt > 0) slopes.add((pts.get(j)[1] - pts.get(i)[1]) / dt);
            }
        }
        if (slopes.isEmpty()) return null;
        Collections.sort(slopes);
        int n = slopes.size();
        return n % 2 == 1 ? slopes.get(n / 2) : 0.5 * (slopes.get(n / 2 - 1) + slopes.get(n / 2));
    }
}
