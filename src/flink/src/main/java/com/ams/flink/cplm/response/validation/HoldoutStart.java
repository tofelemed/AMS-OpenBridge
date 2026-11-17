package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.metrics.Slopes;
import com.ams.flink.cplm.response.model.ModelFamily;

import java.util.Arrays;

/**
 * CHG-211: where every replay of the holdout (the loop's previous accepted event) starts - the model check's free run and its
 * flat-line baseline ({@link ModelValidator}), y_predict and the prediction band ({@link PredictionBand}). One start per check,
 * computed once by the evaluator and passed to all three, so they replay the same thing.
 *
 * <p>The start is the holdout's OWN initial state: standard validation practice starts a free run from the validation data's
 * initial state. The current event's fitted level and drift (the start before CHG-211) offset the model and the flat baseline
 * alike whenever the loop's operating level moved between the two events, and the check then rejected or downgraded good models.
 * The initial state is the pre-step LEVEL and, for an integrating family, the pre-step DRIFT, over the valid, finite PV samples
 * in [h.t0 - preWindowS, h.t0):
 * <ul>
 *   <li>Self-regulating (FOPDT, SOPDT, SO_UNDERDAMPED): y0 = the median of the samples, v0 = 0. The median, not the mean, so one
 *   spike does not move the start.</li>
 *   <li>Integrating ({@link ModelFamily#integrating()}): the simulator carries y0 + v0 (t - t0) through the whole run, and a
 *   pre-step drift is physical - the load imbalance at the pre-step OP - so it is part of the initial state. v = the Theil-Sen
 *   slope of the samples; r_i = y_i - v (t_i - t0); sigma = 1.4826 MAD(r); se_v = sigma / sqrt(sum (t_i - tbar)^2). When
 *   |v| > 2 se_v the start is that line: v0 = v and y0 = median(r), the line's level AT t0 (not the mid-window level). Otherwise
 *   the loop was balanced: v0 = 0 and y0 = the median of the samples, as for a self-regulating family.</li>
 * </ul>
 * With fewer than 3 valid pre-step samples the caller's fallback is used: the training fit's level and drift, today's numbers.
 *
 * <p>The start's own uncertainty ({@link #variance}) enters the prediction band: (pi/2) sigma^2 / N for the median start (the
 * large-sample variance of the median of N normal samples), plus ((t - t0) se_v)^2 on the line. sigma is 1.4826 MAD of the
 * samples about their median on the level start, of the residuals r about their median on the line.
 */
public final class HoldoutStart {
    public static final String HOLDOUT_PRE_STEP_LEVEL = "HOLDOUT_PRE_STEP_LEVEL";
    public static final String HOLDOUT_PRE_STEP_LINE = "HOLDOUT_PRE_STEP_LINE";
    public static final String TRAINING_LEVEL = "TRAINING_LEVEL";
    /** Fewer valid pre-step samples than this and the start falls back to the caller's. */
    public static final int MIN_PRE_STEP_SAMPLES = 3;
    /** MAD to standard deviation for normal noise. */
    public static final double MAD_TO_SIGMA = 1.4826;
    /** An integrating start takes the pre-step line only when |slope| exceeds this many of its standard errors. */
    public static final double SLOPE_SIGNIFICANCE = 2;

    public final double y0, v0;
    /** True when the start is the holdout's own (level or line); false on the fallback (the training fit's y0 and v0). */
    public final boolean fromHoldout;
    /** True when v0 is the holdout's own pre-step slope (an integrating family, |v| > 2 se_v). */
    public final boolean onLine;
    /** 1.4826 MAD of the pre-step samples (level) or of the residuals about the line; NaN on the fallback. */
    public final double sigmaPre;
    /** N, the valid pre-step samples the start was taken from; 0 on the fallback. */
    public final int samples;
    /** se_v, the standard error of the pre-step slope; NaN off the line. */
    public final double slopeSe;

    private HoldoutStart(double y0, double v0, boolean fromHoldout, boolean onLine, double sigmaPre, int samples, double slopeSe) {
        this.y0 = y0;
        this.v0 = v0;
        this.fromHoldout = fromHoldout;
        this.onLine = onLine;
        this.sigmaPre = sigmaPre;
        this.samples = samples;
        this.slopeSe = slopeSe;
    }

    /**
     * The holdout's own start for a model of the given family (the selected candidate's): see the class comment. With fewer than
     * {@link #MIN_PRE_STEP_SAMPLES} valid pre-step samples (a non-finite or non-positive window has none): the fallback.
     */
    public static HoldoutStart of(EventDataset h, ModelFamily family, double preWindowS, double fallbackY0, double fallbackV0) {
        double from = h.t0 - preWindowS;
        double[] t = new double[h.size()], y = new double[h.size()];
        int n = 0;
        for (int i = 0; i < h.size(); i++) {
            if (h.valid[i] && Double.isFinite(h.y[i]) && h.t[i] >= from && h.t[i] < h.t0) {
                t[n] = h.t[i];
                y[n] = h.y[i];
                n++;
            }
        }
        if (n < MIN_PRE_STEP_SAMPLES) return trainingLevel(fallbackY0, fallbackV0);
        if (family.integrating()) {
            HoldoutStart line = line(t, y, n, h.t0);
            if (line != null) return line;
        }
        double level = median(Arrays.copyOf(y, n), n);
        return new HoldoutStart(level, 0, true, false, MAD_TO_SIGMA * mad(y, n, level), n, Double.NaN);
    }

    /** The pre-step line through the samples, or null when its slope is not clear of 2 standard errors (a balanced loop). */
    private static HoldoutStart line(double[] t, double[] y, int n, double t0) {
        Double slope = Slopes.theilSen(t, y, n);
        if (slope == null || !Double.isFinite(slope)) return null;
        double v = slope;
        double[] r = new double[n];
        double mean = 0;
        for (int i = 0; i < n; i++) {
            r[i] = y[i] - v * (t[i] - t0);
            mean += (t[i] - t0) / n;
        }
        double sxx = 0;
        for (int i = 0; i < n; i++) sxx += (t[i] - t0 - mean) * (t[i] - t0 - mean);
        double level = median(r.clone(), n);
        double sigma = MAD_TO_SIGMA * mad(r, n, level);
        double se = sxx > 0 ? sigma / Math.sqrt(sxx) : Double.NaN;
        if (!(Math.abs(v) > SLOPE_SIGNIFICANCE * se)) return null;
        return new HoldoutStart(level, v, true, true, sigma, n, se);
    }

    /** The start before CHG-211 - the training fit's level and drift - and the fallback of {@link #of}. */
    public static HoldoutStart trainingLevel(double y0, double v0) {
        return new HoldoutStart(y0, v0, false, false, Double.NaN, 0, Double.NaN);
    }

    /**
     * The variance of the free run at sinceT0 = t - t0 that the start itself contributes: (pi/2) sigma^2 / N, plus
     * (sinceT0 se_v)^2 on the line; 0 on the fallback (the training fit's level carries its own standard errors).
     */
    public double variance(double sinceT0) {
        if (!fromHoldout) return 0;
        double v = Math.PI / 2 * sigmaPre * sigmaPre / samples;
        if (onLine) v += (sinceT0 * slopeSe) * (sinceT0 * slopeSe);
        return v;
    }

    /** The provenance value "holdout_start" (y_predict, subgate E). */
    public String provenance() {
        if (!fromHoldout) return TRAINING_LEVEL;
        return onLine ? HOLDOUT_PRE_STEP_LINE : HOLDOUT_PRE_STEP_LEVEL;
    }

    /** The median of the first n values of x, which it sorts. */
    private static double median(double[] x, int n) {
        Arrays.sort(x, 0, n);
        int m = n / 2;
        return n % 2 == 1 ? x[m] : 0.5 * (x[m - 1] + x[m]);
    }

    /** The median absolute deviation of the first n values of x about centre. */
    private static double mad(double[] x, int n, double centre) {
        double[] d = new double[n];
        for (int i = 0; i < n; i++) d[i] = Math.abs(x[i] - centre);
        return median(d, n);
    }
}
