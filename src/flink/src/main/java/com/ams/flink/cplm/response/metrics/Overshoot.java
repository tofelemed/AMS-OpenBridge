package com.ams.flink.cplm.response.metrics;

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
        return of(d, p, y0, dy, minResponseEu, 0.0, 0.0);
    }

    public static Peaks of(EventDataset d, double[] p, double y0, double dy, double minResponseEu, double bandEu) {
        return of(d, p, y0, dy, minResponseEu, bandEu, 0.0);
    }

    /**
     * @param bandEu the settling band: an excursion beyond the endpoint that stays inside it is
     *               endpoint-estimation noise (the robust median sits a hair below the asymptote),
     *               not an overshoot - the spec's normalisation is only valid above the noise threshold.
     * @param noiseEu the event's pre-step noise sigma (NaN = unknown, counts as 0); a decay-ratio peak must exceed 4 x it.
     */
    public static Peaks of(EventDataset d, double[] p, double y0, double dy, double minResponseEu, double bandEu, double noiseEu) {
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
        boolean qualifiedPeak = maxP - 1.0 > bandP;                        // a peak is an excursion beyond the endpoint, not the endpoint itself
        double overshoot = qualifiedPeak ? 100.0 * (maxP - 1.0) : 0.0;
        double undershoot = -minP > bandP ? 100.0 * (-minP) : 0.0;
        Double decay = decayRatio(d, p, bandP, Math.abs(dy) > 0 ? noiseEu / Math.abs(dy) : 0);
        return new Peaks(overshoot, undershoot, qualifiedPeak ? d.t[iMax] - d.t0 : null, qualifiedPeak ? d.y[iMax] : null, decay);
    }

    /**
     * Textbook decay ratio (Seborg et al.): the second peak over the first, both on the high side of
     * the endpoint and one full oscillation apart. An excursion is a run of p &gt; 1 after t0 (p is
     * normalised, the endpoint = 1); it ends at the first sample with p &lt;= 1, so wiggles inside one
     * excursion are never a second peak. Each peak must exceed max(band, 4 x noise) (NaN noise = 0).
     */
    static Double decayRatio(EventDataset d, double[] p, double bandP, double noiseP) {
        double thr = Math.max(bandP, 4 * (Double.isNaN(noiseP) ? 0.0 : noiseP));
        double[] amp = new double[2];
        int found = 0;
        boolean inside = false;
        for (int i = 0; i < d.size() && found < 2; i++) {
            if (Double.isNaN(p[i]) || d.t[i] < d.t0) continue;
            if (p[i] > 1.0) {
                inside = true;
                amp[found] = Math.max(amp[found], p[i] - 1.0);
            } else if (inside) {
                inside = false;
                found++;
            }
        }
        if (inside) found++;
        if (found < 2 || amp[0] <= thr || amp[1] <= thr) return null;
        return amp[1] / amp[0];
    }
}
