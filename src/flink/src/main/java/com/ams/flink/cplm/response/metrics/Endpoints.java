package com.ams.flink.cplm.response.metrics;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Robust endpoints on separately qualified STABLE support (spec §2.5): the median of the valid
 * samples in the window, accepted only when the window is covered, has enough samples and its
 * range is within the stability band. Never the last available sample.
 */
public final class Endpoints {
    public static final String NO_VALID_BASELINE = "NO_VALID_BASELINE";
    public static final String NO_STABLE_ENDPOINT = "NO_STABLE_ENDPOINT";

    public static final class Estimate {
        public final Double value;
        public final String reason;
        public final int samples;
        public final double from, to;

        Estimate(Double value, String reason, int samples, double from, double to) {
            this.value = value;
            this.reason = reason;
            this.samples = samples;
            this.from = from;
            this.to = to;
        }
    }

    private Endpoints() {}

    public static Estimate baseline(EventDataset d, double preSupportS, double stableBandEu, int minSamples) {
        return window(d, d.t0 - preSupportS, d.t0, true, stableBandEu, minSamples, NO_VALID_BASELINE);
    }

    public static Estimate endpoint(EventDataset d, double tailDwellS, double stableBandEu, int minSamples) {
        return window(d, d.tEnd - tailDwellS, d.tEnd, false, stableBandEu, minSamples, NO_STABLE_ENDPOINT);
    }

    private static Estimate window(EventDataset d, double from, double to, boolean halfOpenEnd, double band, int minSamples, String reason) {
        List<Double> vals = new ArrayList<>();
        double first = Double.NaN, last = Double.NaN;
        for (int i = 0; i < d.size(); i++) {
            boolean inside = d.t[i] >= from && (halfOpenEnd ? d.t[i] < to : d.t[i] <= to);
            if (!inside || !d.valid[i] || !Double.isFinite(d.y[i])) continue;
            if (Double.isNaN(first)) first = d.t[i];
            last = d.t[i];
            vals.add(d.y[i]);
        }
        if (vals.size() < minSamples) return new Estimate(null, reason, vals.size(), from, to);
        double span = to - from;
        if (first - from > 0.5 * span || to - last > 0.5 * span) return new Estimate(null, reason, vals.size(), from, to);   // window not covered
        double min = Collections.min(vals), max = Collections.max(vals);
        if (max - min > band) return new Estimate(null, reason, vals.size(), from, to);
        return new Estimate(median(vals), "", vals.size(), from, to);
    }

    static double median(List<Double> vals) {
        List<Double> s = new ArrayList<>(vals);
        Collections.sort(s);
        int n = s.size();
        return n % 2 == 1 ? s.get(n / 2) : 0.5 * (s.get(n / 2 - 1) + s.get(n / 2));
    }
}
