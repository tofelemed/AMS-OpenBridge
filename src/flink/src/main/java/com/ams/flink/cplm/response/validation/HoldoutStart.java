package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.metrics.EventDataset;

import java.util.Arrays;

/**
 * CHG-211: where every replay of the holdout (the loop's previous accepted event) starts - the model check's free run and its
 * flat-line baseline ({@link ModelValidator}), y_predict and the prediction band ({@link PredictionBand}). One start per check,
 * computed once by the evaluator and passed to all three, so they replay the same thing.
 *
 * <p>The start is the holdout's OWN pre-step level, with no drift: standard validation practice starts a free run from the
 * validation data's initial state. The current event's fitted level and drift (the start before CHG-211) offset the model and
 * the flat baseline alike whenever the loop's operating level moved between the two events, and the check then rejected or
 * downgraded good models. The median, not the mean, so one spike in the pre-step window does not move the start. With fewer
 * than 3 valid pre-step samples the caller's fallback is used: the training fit's level and drift, today's numbers exactly.
 */
public final class HoldoutStart {
    public static final String HOLDOUT_PRE_STEP_LEVEL = "HOLDOUT_PRE_STEP_LEVEL";
    public static final String TRAINING_LEVEL = "TRAINING_LEVEL";
    /** Fewer valid pre-step samples than this and the start falls back to the caller's. */
    public static final int MIN_PRE_STEP_SAMPLES = 3;

    public final double y0, v0;
    /** True when y0 is the holdout's own pre-step level; false on the fallback (the training fit's y0 and v0). */
    public final boolean fromHoldout;

    private HoldoutStart(double y0, double v0, boolean fromHoldout) {
        this.y0 = y0;
        this.v0 = v0;
        this.fromHoldout = fromHoldout;
    }

    /**
     * The holdout's own pre-step level: y0 = the median of its valid, finite PV samples in [h.t0 - preWindowS, h.t0), v0 = 0.
     * With fewer than {@link #MIN_PRE_STEP_SAMPLES} such samples (a non-finite or non-positive window has none): the fallback.
     */
    public static HoldoutStart of(EventDataset h, double preWindowS, double fallbackY0, double fallbackV0) {
        double from = h.t0 - preWindowS;
        double[] pre = new double[h.size()];
        int n = 0;
        for (int i = 0; i < h.size(); i++) {
            if (h.valid[i] && Double.isFinite(h.y[i]) && h.t[i] >= from && h.t[i] < h.t0) pre[n++] = h.y[i];
        }
        if (n < MIN_PRE_STEP_SAMPLES) return trainingLevel(fallbackY0, fallbackV0);
        Arrays.sort(pre, 0, n);
        int m = n / 2;
        return new HoldoutStart(n % 2 == 1 ? pre[m] : 0.5 * (pre[m - 1] + pre[m]), 0, true);
    }

    /** The start before CHG-211 - the training fit's level and drift - and the fallback of {@link #of}. */
    public static HoldoutStart trainingLevel(double y0, double v0) {
        return new HoldoutStart(y0, v0, false);
    }

    /** The y_predict provenance value "holdout_start". */
    public String provenance() {
        return fromHoldout ? HOLDOUT_PRE_STEP_LEVEL : TRAINING_LEVEL;
    }
}
