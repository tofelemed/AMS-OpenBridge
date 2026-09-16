package com.ams.flink.cplm.response.metrics;

/**
 * Observed settling (spec §2.5): the earliest instant after which every valid observation stays in
 * the band through the retained event end, with at least the tail dwell observed and no gap
 * longer than maxGapS inside it. OBSERVED_THROUGH_T semantics; a shorter capture is right-censored.
 */
public final class Settling {
    private Settling() {}

    public static double responseBand(double absBandEu, double relBand, double dy, double noiseFloorEu) {
        return Math.max(Math.max(absBandEu, relBand * Math.abs(dy)), noiseFloorEu);
    }

    public static Double responseSettle(EventDataset d, double yss, double band, double tailDwellS, double maxGapS) {
        return settle(d, yss, band, tailDwellS, maxGapS);
    }

    public static Double targetSettle(EventDataset d, double r1, double targetBand, double tailDwellS, double maxGapS) {
        return settle(d, r1, targetBand, tailDwellS, maxGapS);
    }

    private static Double settle(EventDataset d, double centre, double band, double tailDwellS, double maxGapS) {
        int n = d.size();
        int lastValid = -1;
        for (int i = n - 1; i >= 0; i--) {
            if (d.valid[i] && d.t[i] >= d.t0) {
                lastValid = i;
                break;
            }
        }
        if (lastValid < 0) return null;
        // walk back from the end while inside the band; stop at the first violation or an unsupported gap
        int firstInside = -1;
        double prevT = d.t[lastValid];
        for (int i = lastValid; i >= 0 && d.t[i] >= d.t0; i--) {
            if (!d.valid[i]) continue;
            if (prevT - d.t[i] > maxGapS) break;
            if (Math.abs(d.y[i] - centre) > band) break;
            firstInside = i;
            prevT = d.t[i];
        }
        if (firstInside < 0) return null;
        double entry = d.t[firstInside];
        if (d.tEnd - entry < tailDwellS) return null;                    // right-censored: not enough observed tail
        return entry - d.t0;
    }
}
