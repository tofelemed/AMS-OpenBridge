package com.ams.flink.cplm.response.event;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Safe triggering (spec §2.4): a reference change counts only when it exceeds
 * max(step_min_input_EU, step_min_span_fraction x span, noise_multiplier x 1.4826 x MAD(detrended pre-window)),
 * the pre-window is stable, and the new level persists for event_dwell_s. A persistent slope is a ramp, not a step.
 */
public final class ResponseEventDetector {
    public static final class Settings {
        public double stepMinInputEu = 1.0, stepMinSpanFraction = 0.01, span = 100, noiseMultiplier = 4, preSupportS = 60, eventDwellS = 15;
        public double rampMinSlopeEuPerS = 0.02, rampMinDurationS = 60;
    }

    public static final class Candidate {
        public final EventType type;
        public final int index;
        public final double amplitude;

        Candidate(EventType type, int index, double amplitude) {
            this.type = type;
            this.index = index;
            this.amplitude = amplitude;
        }
    }

    private ResponseEventDetector() {}

    public static double trigger(double[] pre, Settings s) {
        double noise = pre.length >= 4 ? 1.4826 * mad(detrend(pre)) : 0;
        return Math.max(Math.max(s.stepMinInputEu, s.stepMinSpanFraction * s.span), s.noiseMultiplier * noise);
    }

    public static Candidate detect(double[] t, double[] sp, boolean[] valid, Settings s) {
        int n = t.length;
        for (int i = 1; i < n; i++) {
            if (!valid[i] || !valid[i - 1]) continue;
            int preFrom = i - 1;
            while (preFrom > 0 && t[i - 1] - t[preFrom - 1] <= s.preSupportS) preFrom--;
            double[] pre = slice(sp, valid, preFrom, i);
            if (pre.length < 2) continue;
            double level = median(pre);
            double trig = trigger(pre, s);
            double after = sp[i];
            // step: the new level exceeds the trigger and persists for eventDwellS
            if (Math.abs(after - level) >= trig && persists(t, sp, valid, i, after, trig / 2, s.eventDwellS)) {
                if (isRamp(t, sp, valid, i, s)) return new Candidate(EventType.RAMP_TRACKING, i, after - level);
                return new Candidate(EventType.SERVO_STEP, i, after - level);
            }
            // ramp: a sustained slope from i over rampMinDurationS that moves further than the trigger
            if (isRamp(t, sp, valid, i, s)) {
                int last = lastWithin(t, i, s.rampMinDurationS);
                if (Math.abs(sp[last] - level) >= trig) return new Candidate(EventType.RAMP_TRACKING, i, sp[last] - level);
            }
        }
        return null;
    }

    private static boolean persists(double[] t, double[] sp, boolean[] valid, int from, double level, double tol, double dwellS) {
        double until = t[from] + dwellS;
        double lastOk = Double.NaN;
        for (int j = from; j < t.length && t[j] <= until; j++) {
            if (!valid[j]) continue;
            if (Math.abs(sp[j] - level) > tol) return false;
            lastOk = t[j];
        }
        return !Double.isNaN(lastOk) && t[t.length - 1] >= until;      // the dwell must be observed, not assumed
    }

    private static boolean isRamp(double[] t, double[] sp, boolean[] valid, int from, Settings s) {
        int last = lastWithin(t, from, s.rampMinDurationS);
        if (t[last] - t[from] < s.rampMinDurationS * 0.9) return false;
        double slope = (sp[last] - sp[from]) / (t[last] - t[from]);
        if (Math.abs(slope) < s.rampMinSlopeEuPerS) return false;
        double tol = Math.max(0.2 * Math.abs(sp[last] - sp[from]), 1e-9);
        for (int j = from + 1; j <= last; j++) {                              // monotone progress along the ramp
            if (!valid[j]) continue;
            double expected = sp[from] + slope * (t[j] - t[from]);
            if (Math.abs(sp[j] - expected) > tol) return false;
        }
        return true;
    }

    private static int lastWithin(double[] t, int from, double horizonS) {
        int last = from;
        while (last + 1 < t.length && t[last + 1] - t[from] <= horizonS) last++;
        return last;
    }

    private static double[] slice(double[] x, boolean[] valid, int from, int to) {
        List<Double> v = new ArrayList<>();
        for (int i = from; i < to; i++) if (valid[i]) v.add(x[i]);
        double[] r = new double[v.size()];
        for (int i = 0; i < r.length; i++) r[i] = v.get(i);
        return r;
    }

    static double[] detrend(double[] x) {
        int n = x.length;
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (int i = 0; i < n; i++) {
            sx += i;
            sy += x[i];
            sxx += (double) i * i;
            sxy += i * x[i];
        }
        double den = n * sxx - sx * sx;
        double b = den == 0 ? 0 : (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
        double[] r = new double[n];
        for (int i = 0; i < n; i++) r[i] = x[i] - (a + b * i);
        return r;
    }

    static double mad(double[] x) {
        double m = median(x);
        double[] dev = new double[x.length];
        for (int i = 0; i < x.length; i++) dev[i] = Math.abs(x[i] - m);
        return median(dev);
    }

    static double median(double[] x) {
        List<Double> s = new ArrayList<>();
        for (double v : x) s.add(v);
        Collections.sort(s);
        int n = s.size();
        return n % 2 == 1 ? s.get(n / 2) : 0.5 * (s.get(n / 2 - 1) + s.get(n / 2));
    }
}
