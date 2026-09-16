package com.ams.flink.cplm.response.metrics;

import java.util.ArrayList;
import java.util.List;

/**
 * Overshoot / undershoot from direction-normalised progress (valid only when |dy| exceeds the
 * response threshold), the applicable peak, and a decay ratio ONLY from two qualified same-side
 * successive peaks (spec §2.5 - never damping from one peak).
 */
public final class Overshoot {
    public static final class Peaks {
        public final Double overshootPct, undershootPct, peakTimeS, peakValue, decayRatio;

        Peaks(Double o, Double u, Double pt, Double pv, Double dr) {
            overshootPct = o;
            undershootPct = u;
            peakTimeS = pt;
            peakValue = pv;
            decayRatio = dr;
        }
    }

    private Overshoot() {}

    public static Peaks of(EventDataset d, double[] p, double y0, double dy, double minResponseEu) {
        return of(d, p, y0, dy, minResponseEu, 0.0);
    }

    /**
     * @param bandEu the settling band: an excursion beyond the endpoint that stays inside it is
     *               endpoint-estimation noise (the robust median sits a hair below the asymptote),
     *               not an overshoot - the spec's normalisation is only valid above the noise threshold.
     */
    public static Peaks of(EventDataset d, double[] p, double y0, double dy, double minResponseEu, double bandEu) {
        if (Math.abs(dy) < minResponseEu) return new Peaks(null, null, null, null, null);
        double bandP = Math.abs(dy) > 0 ? bandEu / Math.abs(dy) : 0;
        double maxP = Double.NEGATIVE_INFINITY, minP = Double.POSITIVE_INFINITY;
        int iMax = -1;
        for (int i = 0; i < d.size(); i++) {
            if (Double.isNaN(p[i]) || d.t[i] < d.t0) continue;
            if (p[i] > maxP) {
                maxP = p[i];
                iMax = i;
            }
            if (p[i] < minP) minP = p[i];
        }
        if (iMax < 0) return new Peaks(null, null, null, null, null);
        double overshoot = maxP - 1.0 > bandP ? 100.0 * (maxP - 1.0) : 0.0;
        double undershoot = -minP > bandP ? 100.0 * (-minP) : 0.0;
        Double decay = decayRatio(d, p, bandP);
        return new Peaks(overshoot, undershoot, d.t[iMax] - d.t0, d.y[iMax], decay);
    }

    /**
     * Local maxima of p above the endpoint by more than the band (qualified same-side excursions):
     * second/first magnitude when two exist. Noise-level wiggles on a settled tail are not peaks.
     */
    static Double decayRatio(EventDataset d, double[] p, double bandP) {
        List<Double> peaks = new ArrayList<>();
        for (int i = 1; i + 1 < d.size(); i++) {
            if (Double.isNaN(p[i]) || Double.isNaN(p[i - 1]) || Double.isNaN(p[i + 1]) || d.t[i] < d.t0) continue;
            if (p[i] > p[i - 1] && p[i] >= p[i + 1] && p[i] - 1.0 > bandP) peaks.add(p[i] - 1.0);
        }
        if (peaks.size() < 2 || peaks.get(0) <= 0) return null;
        return peaks.get(1) / peaks.get(0);
    }
}
