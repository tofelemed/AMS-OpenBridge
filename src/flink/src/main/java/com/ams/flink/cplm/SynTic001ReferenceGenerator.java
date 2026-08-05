package com.ams.flink.cplm;

import java.util.ArrayList;
import java.util.List;

/**
 * Generates SYN_TIC_001 reference samples per CPLM reference manual appendix A.
 * Used by unit tests and validation replay — not production plant simulation.
 */
public final class SynTic001ReferenceGenerator {

    private static final double DT = 5.0;
    private static final int N = 17280;
    private static final int M = 540;
    private static final int SHIFT = 135;
    private static final long START_MS = 1738627200000L;

    private SynTic001ReferenceGenerator() {
    }

    public static List<CplmNormalizedSample> generate() {
        List<CplmNormalizedSample> samples = new ArrayList<>(N);
        for (int i = 0; i < N; i++) {
            double op = 50.0 + 6.0 * triIdx(i);
            double pv = 100.0 + 0.75 * triIdx(i - SHIFT);
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "SYN_TIC_001";
            s.eventTsMs = START_MS + (long) (i * DT * 1000);
            s.pv = pv;
            s.sp = 100.0;
            s.op = op;
            s.vp = null;
            s.mode = "AUTO";
            s.quality = "GOOD";
            s.isValid = true;
            samples.add(s);
        }
        return samples;
    }

    private static double triIdx(int i) {
        int mod = ((i % M) + M) % M;
        double p = mod / (double) M;
        return 1.0 - 4.0 * Math.abs(p - 0.5);
    }

    public static long windowStartMs() {
        return START_MS;
    }

    public static long windowEndMs() {
        return START_MS + (long) (N * DT * 1000);
    }
}
