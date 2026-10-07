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
 * Sample-window primitives shared by every gate: half-open filtering, sample period, jitter, mode/SP change rates, OP travel/reversals, detrending, EWMA and the scalar statistics (population std, ddof=0).
 *
 * Moved verbatim out of CplmGateEngine in v2.5 (Task 1D.1, 400-line file rule);
 * no formula changed - the SYN-TIC-001 golden tests pin the numbers.
 */
public final class SignalMath {
    public static final double SP_CHANGE_THRESHOLD = 1e-6;
    public static final double OP_REVERSAL_EPS = 1e-9;

    private SignalMath() {
    }

    public static String firstNonBlank(
            List<CplmNormalizedSample> primary,
            List<CplmNormalizedSample> fallback,
            java.util.function.Function<CplmNormalizedSample, String> getter) {
        for (CplmNormalizedSample s : primary) {
            String v = getter.apply(s);
            if (v != null && !v.trim().isEmpty()) return v;
        }
        if (fallback != null) {
            for (CplmNormalizedSample s : fallback) {
                String v = getter.apply(s);
                if (v != null && !v.trim().isEmpty()) return v;
            }
        }
        return null;
    }

    /**
     * v2.5 (3C.1): the profile resolved for the newest sample - a window decides at its end time, so
     * a bundle effective inside the window governs it (window_end >= effective_from) and one effective
     * after the window does not; the whole window is computed under that one profile, never mixed.
     */
    public static CplmLoopDynamicsProfile latestResolvedProfile(
            List<CplmNormalizedSample> primary,
            List<CplmNormalizedSample> fallback) {
        CplmLoopDynamicsProfile best = null;
        long bestTs = Long.MIN_VALUE;
        for (List<CplmNormalizedSample> list : new List[] {primary, fallback}) {
            if (list == null) continue;
            for (CplmNormalizedSample sample : list) {
                if (sample != null && sample.resolvedProfile != null && sample.eventTsMs >= bestTs) {
                    best = sample.resolvedProfile;
                    bestTs = sample.eventTsMs;
                }
            }
        }
        return best;
    }

    public static CplmLoopDynamicsProfile firstResolvedProfile(
            List<CplmNormalizedSample> primary,
            List<CplmNormalizedSample> fallback) {
        for (CplmNormalizedSample sample : primary) {
            if (sample != null && sample.resolvedProfile != null) return sample.resolvedProfile;
        }
        if (fallback != null && fallback != primary) {
            for (CplmNormalizedSample sample : fallback) {
                if (sample != null && sample.resolvedProfile != null) return sample.resolvedProfile;
            }
        }
        return null;
    }

    public static double[] linearDetrend(double[] x) {
        int n = x.length;
        double[] y = new double[n];
        if (n < 2) {
            System.arraycopy(x, 0, y, 0, n);
            return y;
        }
        double sumT = 0, sumV = 0, sumTV = 0, sumTT = 0;
        for (int i = 0; i < n; i++) {
            sumT += i;
            sumV += x[i];
            sumTV += i * x[i];
            sumTT += (double) i * i;
        }
        double denom = n * sumTT - sumT * sumT;
        double slope = Math.abs(denom) < 1e-15 ? 0 : (n * sumTV - sumT * sumV) / denom;
        double intercept = (sumV - slope * sumT) / n;
        for (int i = 0; i < n; i++) {
            y[i] = x[i] - (intercept + slope * i);
        }
        return y;
    }

    public static double[] ewma(double[] x, int window) {
        double[] y = new double[x.length];
        if (x.length == 0) return y;
        double alpha = 2.0 / (Math.max(1, window) + 1.0);
        y[0] = x[0];
        for (int i = 1; i < x.length; i++) {
            y[i] = alpha * x[i] + (1.0 - alpha) * y[i - 1];
        }
        return y;
    }

    /** Keep samples strictly inside the event-time half-open interval [start, end). */
    public static List<CplmNormalizedSample> filterHalfOpen(
            List<CplmNormalizedSample> raw, long windowStartMs, long windowEndMs) {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        if (raw == null) return samples;
        for (CplmNormalizedSample s : raw) {
            if (s == null) continue;
            if (s.eventTsMs >= windowStartMs && s.eventTsMs < windowEndMs) {
                samples.add(s);
            }
        }
        samples.sort((a, b) -> Long.compare(a.eventTsMs, b.eventTsMs));
        // CHG-062a: two sources on one feed repeat a timestamp; keep the FIRST so the period is not 0 s
        List<CplmNormalizedSample> distinct = new ArrayList<>(samples.size());
        for (CplmNormalizedSample s : samples) {
            if (!distinct.isEmpty() && distinct.get(distinct.size() - 1).eventTsMs == s.eventTsMs) continue;
            distinct.add(s);
        }
        return distinct;
    }

    public static double inferSamplePeriodSec(List<CplmNormalizedSample> samples) {
        if (samples.size() < 2) return 5.0;
        List<Double> diffs = new ArrayList<>();
        for (int i = 1; i < samples.size(); i++) {
            long d = samples.get(i).eventTsMs - samples.get(i - 1).eventTsMs;
            if (d > 0) diffs.add(d / 1000.0);   // CHG-062a: a repeated timestamp is not a sample interval
        }
        if (diffs.isEmpty()) return 5.0;
        Collections.sort(diffs);
        return diffs.get(diffs.size() / 2);
    }

    public static double computeSamplingJitter(List<CplmNormalizedSample> samples) {
        if (samples.size() < 3) return 0.0;
        List<Double> diffs = new ArrayList<>();
        for (int i = 1; i < samples.size(); i++) {
            diffs.add((samples.get(i).eventTsMs - samples.get(i - 1).eventTsMs) / 1000.0);
        }
        double median = median(diffs);
        if (median <= 0) return 0.0;
        double mean = mean(diffs.stream().mapToDouble(d -> d).toArray());
        double var = 0;
        for (double d : diffs) var += (d - mean) * (d - mean);
        var /= diffs.size();
        return Math.sqrt(var) / median;
    }

    public static double computeModeChangesPerHour(List<CplmNormalizedSample> samples, long windowSec) {
        if (samples.size() < 2) return 0.0;
        int changes = 0;
        for (int i = 1; i < samples.size(); i++) {
            if (!samples.get(i).mode.equals(samples.get(i - 1).mode)) changes++;
        }
        double hours = windowSec / 3600.0;
        return hours > 0 ? changes / hours : 0.0;
    }

    public static double computeSpChangesPerHour(double[] sp, double tsSec, long windowSec) {
        int changes = 0;
        for (int i = 1; i < sp.length; i++) {
            if (Math.abs(sp[i] - sp[i - 1]) > SP_CHANGE_THRESHOLD) changes++;
        }
        double hours = windowSec / 3600.0;
        return hours > 0 ? changes / hours : 0.0;
    }

    public static double computeOpTravel(double[] op) {
        double travel = 0;
        for (int i = 1; i < op.length; i++) {
            travel += Math.abs(op[i] - op[i - 1]);
        }
        return travel;
    }

    public static double computeTravelPerDay(double[] op, double tsSec, long windowSec) {
        double travel = computeOpTravel(op);
        double windowHours = windowSec / 3600.0;
        return windowHours > 0 ? travel * (24.0 / windowHours) : travel;
    }

    public static int computeReversalCount(double[] op) {
        int reversals = 0;
        double lastDirection = 0;
        for (int i = 1; i < op.length; i++) {
            double diff = op[i] - op[i - 1];
            if (Math.abs(diff) > OP_REVERSAL_EPS) {
                double currentDirection = Math.signum(diff);
                if (lastDirection != 0 && currentDirection != lastDirection) {
                    reversals++;
                }
                lastDirection = currentDirection;
            }
        }
        return reversals;
    }

    public static double computeReversalsPerHour(double[] op, double tsSec, long windowSec) {
        int reversals = computeReversalCount(op);
        double hours = windowSec / 3600.0;
        return hours > 0 ? reversals / hours : 0.0;
    }

    // --- helpers ---
    public static double mean(double[] v) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) s += d;
        return s / v.length;
    }

    public static double meanAbs(double[] v) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) s += Math.abs(d);
        return s / v.length;
    }

    public static double meanSq(double[] v) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) s += d * d;
        return s / v.length;
    }

    public static double min(double[] v) {
        double m = Double.POSITIVE_INFINITY;
        for (double d : v) m = Math.min(m, d);
        return m;
    }

    public static double max(double[] v) {
        double m = Double.NEGATIVE_INFINITY;
        for (double d : v) m = Math.max(m, d);
        return m;
    }

    public static double popStd(double[] v, double mean) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) {
            double diff = d - mean;
            s += diff * diff;
        }
        return Math.sqrt(s / v.length);
    }

    public static double[] subtractMean(double[] v) {
        double m = mean(v);
        double[] out = new double[v.length];
        for (int i = 0; i < v.length; i++) out[i] = v[i] - m;
        return out;
    }

    public static double median(List<Double> sorted) {
        if (sorted.isEmpty()) return 0;
        List<Double> copy = new ArrayList<>(sorted);
        Collections.sort(copy);
        return copy.get(copy.size() / 2);
    }
}
