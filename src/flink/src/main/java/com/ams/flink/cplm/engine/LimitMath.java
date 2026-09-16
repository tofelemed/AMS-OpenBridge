package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * G10 saturation/limit occupancy and dwell, and G11 sensor-health primitives (freeze run, quantisation, drift, delta-PV statistics, spikes).
 *
 * Moved verbatim out of CplmGateEngine in v2.5 (Task 1D.1, 400-line file rule);
 * no formula changed - the SYN-TIC-001 golden tests pin the numbers.
 */
public final class LimitMath {
    public static final double PV_FREEZE_EPS = 1e-9;

    private LimitMath() {
    }

    public static double computeSaturationPct(double[] op) {
        return computeSaturationPct(op, 5.0, 95.0);
    }

    public static double computeSaturationPct(double[] op, double lowPct, double highPct) {
        return computeSaturationStats(op, lowPct, highPct).occupancy;
    }

    public static SaturationStats computeSaturationStats(double[] op, double lowPct, double highPct) {
        SaturationStats s = new SaturationStats();
        if (op.length == 0) return s;
        int sat = 0;
        int dwell = 0;
        int maxDwell = 0;
        int exits = 0;
        boolean wasSat = false;
        s.activeLow = new boolean[op.length];
        s.activeHigh = new boolean[op.length];
        for (int idx = 0; idx < op.length; idx++) {
            double v = op[idx];
            boolean atLimit = v <= lowPct || v >= highPct;
            s.activeLow[idx] = v <= lowPct;
            s.activeHigh[idx] = v >= highPct;
            if (atLimit) {
                sat++;
                dwell++;
                maxDwell = Math.max(maxDwell, dwell);
                wasSat = true;
            } else {
                if (wasSat) exits++;
                dwell = 0;
                wasSat = false;
            }
        }
        s.occupancy = (double) sat / op.length;
        s.maxDwellSamples = maxDwell;
        // Limit cycling: repeated enter/exit of saturation band.
        s.cyclingPattern = exits >= 3 && s.occupancy >= 0.02;
        return s;
    }

    public static final class SaturationStats {
        public double occupancy;
        public int maxDwellSamples;
        public boolean cyclingPattern;
        /** v2.5 (2C.1a) retained evidence: per-sample limit occupancy. */
        public boolean[] activeLow = new boolean[0], activeHigh = new boolean[0];
    }

    /** v2.5 R08 - one contiguous stay at a limit, in event time. */
    public static final class DwellEvent implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        public long startMs;
        public long endMs;
        public double durationS;
        public String side;          // LOW | HIGH
        public int samples;
    }

    /** v2.5 R08 - one contiguous flat run of PV at or beyond the freeze dwell, in event time. */
    public static final class FreezeEvent implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        public long startMs;
        public long endMs;
        public double durationS;
        public int samples;
    }

    /**
     * v2.5 R08 - limit episodes with physical duration. {@code op} is already normalised to
     * 0-100 pp of the declared (or assumed) range; a sample is at the LOW limit when
     * {@code op <= tolPp} and at the HIGH limit when {@code op >= 100 - tolPp}. An episode
     * ends when the sample leaves the limit; the final sample's interval is one median grid.
     */
    public static java.util.List<DwellEvent> computeLimitEpisodes(double[] op, long[] tsMs, double tolPp, double gridMs) {
        java.util.List<DwellEvent> out = new java.util.ArrayList<>();
        int n = Math.min(op.length, tsMs.length);
        DwellEvent cur = null;
        for (int i = 0; i < n; i++) {
            String side = op[i] <= tolPp ? "LOW" : op[i] >= 100.0 - tolPp ? "HIGH" : null;
            if (side != null && cur != null && cur.side.equals(side)) {
                cur.endMs = tsMs[i];
                cur.samples++;
                continue;
            }
            if (cur != null) { close(cur, gridMs); out.add(cur); cur = null; }
            if (side != null) {
                cur = new DwellEvent();
                cur.startMs = tsMs[i];
                cur.endMs = tsMs[i];
                cur.side = side;
                cur.samples = 1;
            }
        }
        if (cur != null) { close(cur, gridMs); out.add(cur); }
        return out;
    }

    private static void close(DwellEvent e, double gridMs) {
        e.endMs = (long) (e.endMs + gridMs);            // the last sample holds for one grid
        e.durationS = (e.endMs - e.startMs) / 1000.0;
    }

    /**
     * v2.5 R08 / NR-025 - every flat run of PV lasting at least {@code dwellS}. Adjacent
     * samples are "unchanged" when they differ by at most {@code tolEu} (0 = exact, the
     * legacy PV_FREEZE_EPS). Episodes are evidence and are always retained, however small
     * their share of the window; materiality is a separate judgement.
     */
    public static java.util.List<FreezeEvent> computeFreezeEpisodes(double[] pv, long[] tsMs, double tolEu, double dwellS, double gridMs) {
        java.util.List<FreezeEvent> out = new java.util.ArrayList<>();
        int n = Math.min(pv.length, tsMs.length);
        if (n < 2) return out;
        double tol = tolEu > 0 ? tolEu : PV_FREEZE_EPS;
        int runStart = 0;
        for (int i = 1; i <= n; i++) {
            boolean same = i < n && Math.abs(pv[i] - pv[i - 1]) <= tol;
            if (same) continue;
            int runEnd = i - 1;                          // inclusive index of the last sample in the run
            if (runEnd > runStart) {
                long endMs = (long) (tsMs[runEnd] + gridMs);
                double durationS = (endMs - tsMs[runStart]) / 1000.0;
                if (durationS >= dwellS) {
                    FreezeEvent f = new FreezeEvent();
                    f.startMs = tsMs[runStart];
                    f.endMs = endMs;
                    f.durationS = durationS;
                    f.samples = runEnd - runStart + 1;
                    out.add(f);
                }
            }
            runStart = i;
        }
        return out;
    }

    /**
     * Longest run of unchanged adjacent PV intervals (0 when PV always changes).
     * Freeze index = run * dt, per as-built formula register: a single sample is
     * not a freeze — only repeated unchanged intervals accumulate freeze time.
     */
    public static int computeFreezeRunSamples(double[] pv) {
        int maxRun = 0, run = 0;
        for (int i = 1; i < pv.length; i++) {
            if (Math.abs(pv[i] - pv[i - 1]) <= PV_FREEZE_EPS) {
                run++;
            } else {
                maxRun = Math.max(maxRun, run);
                run = 0;
            }
        }
        return Math.max(maxRun, run);
    }

    public static double computeFreezeIndex(double[] pv, double tsSec) {
        return computeFreezeRunSamples(pv) * tsSec;
    }

    public static int countUniqueRounded(double[] v, int decimals) {
        Set<Long> uniq = new HashSet<>();
        double scale = Math.pow(10, decimals);
        for (double d : v) {
            uniq.add(Math.round(d * scale));
        }
        return uniq.size();
    }

    public static double computePvDriftPerDay(double[] pv, List<CplmNormalizedSample> samples, long windowSec) {
        if (pv.length < 2) return 0;
        double t0 = samples.get(0).eventTsMs / 1000.0;
        double sumT = 0, sumV = 0, sumTV = 0, sumTT = 0;
        for (int i = 0; i < pv.length; i++) {
            double t = samples.get(i).eventTsMs / 1000.0 - t0;
            sumT += t;
            sumV += pv[i];
            sumTV += t * pv[i];
            sumTT += t * t;
        }
        double n = pv.length;
        double denom = n * sumTT - sumT * sumT;
        if (Math.abs(denom) < 1e-15) return 0;
        double slope = (n * sumTV - sumT * sumV) / denom;
        return slope * 86400.0;
    }

    public static DeltaPvResult computeDeltaPvStats(double[] pv) {
        DeltaPvResult r = new DeltaPvResult();
        if (pv.length < 2) return r;
        double[] d = new double[pv.length - 1];
        for (int i = 0; i < d.length; i++) d[i] = pv[i + 1] - pv[i];
        r.mean = SignalMath.mean(d);
        r.std = SignalMath.popStd(d, r.mean);
        // v2.5 (2C.1a) retained evidence: the deltas, the 3-sigma noise band and the spike flags (computeSpikeCount's criterion)
        r.deltaPv = d;
        r.noiseBand = 3 * r.std;
        r.spikeMask = new boolean[d.length];
        if (r.std >= 1e-12) for (int i = 0; i < d.length; i++) r.spikeMask[i] = Math.abs(d[i] - r.mean) > 3 * r.std;
        return r;
    }

    public static int computeSpikeCount(double[] pv) {
        if (pv.length < 3) return 0;
        double[] d = new double[pv.length - 1];
        for (int i = 0; i < d.length; i++) d[i] = pv[i + 1] - pv[i];
        double mean = SignalMath.mean(d);
        double std = SignalMath.popStd(d, mean);
        if (std < 1e-12) return 0;
        int spikes = 0;
        for (double v : d) {
            if (Math.abs(v - mean) > 3 * std) spikes++;
        }
        return spikes;
    }

    public static class DeltaPvResult {
        double mean;
        double std;
        /** v2.5 (2C.1a) retained evidence. */
        public double[] deltaPv = new double[0];
        public double noiseBand;
        public boolean[] spikeMask = new boolean[0];
    }
}
