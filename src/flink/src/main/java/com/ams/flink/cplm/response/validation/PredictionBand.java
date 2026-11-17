package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.FitBudgetExceeded;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * CHG-209: the 95 % prediction band of the model check (spec item 7b) - the model's free run on the holdout, widened by the
 * uncertainty of its parameters and by the measurement noise, so a reviewer can tell a miss inside the model's own
 * uncertainty from a real one. By linearisation: half-width(t) = 1.96 sqrt(sum_j g_j(t)^2 u_j^2 + sigma^2), with the
 * sensitivities g_j from the exact ZOH simulation.
 *
 * <p>Standard errors: exactly the keys of the estimator's standard-error map that carry a finite standard error (u_j = se_j),
 * g_j = (yhat(p + d_j) - yhat(p - d_j)) / (2 d_j), d_j = max(1e-3 |p_j|, 1e-6) - the model's catalogue parameters through
 * {@link ProcessModel#withParameter}, and the fitted baseline ("baseline", y0) and drift ("baseline_slope", v0), which ride the
 * same map. A missing or non-finite standard error, or a name this model does not have, is skipped.
 *
 * <p>CHG-211, the start ({@link HoldoutStart}): the free run starts at the holdout's own pre-step level, with no drift; the
 * training fit's level and drift are then not used, so "baseline" and "baseline_slope" are not perturbed either. On the fallback
 * start (the training level: fewer than 3 valid pre-step samples on the holdout) they are, as before CHG-211.
 *
 * <p>Dead time: no estimator gives it a standard error - it is profiled, and its uncertainty is the delay profile's half-width
 * h (EstimationResult.Candidate.thetaUncertaintyS). When the map has no finite "dead_time" entry and h > 0, h is treated as the
 * half-width of a rectangular interval (GUM type B: u = h / sqrt 3) and g is the SECANT over theta+ = theta + h,
 * theta- = max(0, theta - h) - not a small-step derivative: the output is strongly nonlinear in theta and theta = 0 is common.
 * Unclamped, g^2 h^2 / 3 = (yhat+ - yhat-)^2 / 12.
 *
 * <p>With no term the band is the residual band +-1.96 sigma. Parameter correlations are not available (standard errors only)
 * and are ignored. A prediction interval of the output, never a confidence interval of the parameters. Cost: two free runs per
 * perturbed parameter on the holdout, every one under the caller's deadline - no refit.
 */
public final class PredictionBand {
    public static final double Z95 = 1.96;
    /** The fitted offset and drift: in the standard-error map (OutputErrorEstimator.paramNames), outside ProcessModel. */
    static final String BASELINE = "baseline", BASELINE_SLOPE = "baseline_slope";
    /** The profiled delay: its uncertainty arrives as a half-width, not as a standard error. */
    static final String DEAD_TIME = "dead_time";
    /** Fewer valid free-run residuals than this and the noise term falls back to the fit's objective. */
    static final int MIN_FREE_RUN_RESIDUALS = 3;

    public static final class Result {
        /** The free run on the holdout's times (the y_predict values); NaN where the simulation stopped. */
        public final double[] predict;
        /** Aligned to the holdout's times; NaN where the holdout sample or the free run is invalid. */
        public final double[] lower, upper;
        /** Share of the valid holdout samples inside the band; NaN without one. */
        public final double coverage;
        /** The parameters whose uncertainty entered the band: the map's order, then "dead_time" when its half-width did. */
        public final List<String> parameters;
        /** The delay profile's half-width (s) that entered the band; NaN when it did not. */
        public final double deadTimeHalfWidthS;

        Result(double[] predict, double[] lower, double[] upper, double coverage, List<String> parameters, double deadTimeHalfWidthS) {
            this.predict = predict;
            this.lower = lower;
            this.upper = upper;
            this.coverage = coverage;
            this.parameters = Collections.unmodifiableList(parameters);
            this.deadTimeHalfWidthS = deadTimeHalfWidthS;
        }
    }

    private PredictionBand() {}

    /** The fit's residual noise: sqrt(objective / max(1, samples - parameters)); NaN for a non-finite or negative objective. */
    public static double residualSigma(double objective, int samples, int parameters) {
        if (!(objective >= 0) || Double.isInfinite(objective)) return Double.NaN;
        return Math.sqrt(objective / Math.max(1, samples - parameters));
    }

    /**
     * The noise term of a FREE-RUN band: sqrt(sum r^2 / max(1, N - parameters)) over the training fit's free-run residuals
     * r = y - yhat_fit, NaN where the data or the fit is not valid (skipped). Not the objective: a closed-loop (PEM) objective is the
     * one-step innovation SSE, too small for a free run, and an output-error objective adds penalty residuals for unbridged gaps on
     * samples that are not valid. Fewer than 3 valid residuals: {@link #residualSigma}(objective, samples, parameters).
     */
    public static double noiseSigma(double[] freeRunResiduals, int parameters, double objective, int samples) {
        double sse = 0;
        int n = 0;
        if (freeRunResiduals != null) {
            for (double r : freeRunResiduals) {
                if (!Double.isFinite(r)) continue;
                sse += r * r;
                n++;
            }
        }
        if (n < MIN_FREE_RUN_RESIDUALS) return residualSigma(objective, samples, parameters);
        return Math.sqrt(sse / Math.max(1, n - parameters));
    }

    /** The band from the training fit's level y0 and drift v0 ({@link HoldoutStart#trainingLevel}), without a deadline. */
    public static Result compute(ProcessModel model, Map<String, Double> stdErr, double thetaHalfWidthS, double residualSigma,
                                 EventDataset holdout, double u0, double y0, double v0, double maxGapS) {
        return compute(model, stdErr, thetaHalfWidthS, residualSigma, holdout, u0, HoldoutStart.trainingLevel(y0, v0), maxGapS);
    }

    /** The band around its own free run of the model from start, without a deadline. */
    public static Result compute(ProcessModel model, Map<String, Double> stdErr, double thetaHalfWidthS, double residualSigma,
                                 EventDataset holdout, double u0, HoldoutStart start, double maxGapS) {
        ZohSimulator.Result nominal = ZohSimulator.simulate(model, holdout.t, holdout.u, u0, start.y0, start.v0, holdout.t0, maxGapS);
        return compute(model, stdErr, thetaHalfWidthS, residualSigma, holdout, u0, start, maxGapS, nominal, 0);
    }

    /**
     * The band around nominal - the caller's free run of the model on the holdout from start (y_predict) - with every
     * perturbed simulation under deadlineNanos (System.nanoTime() scale, 0 = none; {@link FitBudgetExceeded} once it passes).
     * thetaHalfWidthS: the delay profile's half-width (NaN or <= 0 = none). A non-finite residualSigma counts as none (the band
     * is then the parameter part alone, still finite).
     */
    public static Result compute(ProcessModel model, Map<String, Double> stdErr, double thetaHalfWidthS, double residualSigma,
                                 EventDataset holdout, double u0, HoldoutStart start, double maxGapS,
                                 ZohSimulator.Result nominal, long deadlineNanos) {
        Runs runs = new Runs(holdout, u0, start.y0, start.v0, maxGapS, deadlineNanos);
        double[] predict = nominal.yHat;
        int n = predict.length;
        double[] var = new double[n];
        List<String> used = new ArrayList<>();
        if (stdErr != null) {
            for (Map.Entry<String, Double> e : stdErr.entrySet()) {
                Double se = e.getValue();
                if (se == null || !Double.isFinite(se)) continue;                  // a missing standard error is skipped
                if (start.fromHoldout && isTrainingStart(e.getKey())) continue;     // CHG-211: the fitted level is not where the run starts
                double[] g = sensitivity(e.getKey(), model, runs, predict);
                if (g == null) continue;                                           // not a parameter of this model
                add(var, g, se * se);
                used.add(e.getKey());
            }
        }
        Double thetaSe = stdErr == null ? null : stdErr.get(DEAD_TIME);
        double halfWidthUsed = Double.NaN;
        if ((thetaSe == null || !Double.isFinite(thetaSe)) && Double.isFinite(thetaHalfWidthS) && thetaHalfWidthS > 0) {
            double[] g = deadTimeSecant(model, runs, thetaHalfWidthS);
            if (g != null) {
                add(var, g, thetaHalfWidthS * thetaHalfWidthS / 3);                // rectangular half-width h: u^2 = h^2 / 3
                used.add(DEAD_TIME);
                halfWidthUsed = thetaHalfWidthS;
            }
        }
        double noise = Double.isFinite(residualSigma) && residualSigma > 0 ? residualSigma * residualSigma : 0;
        double[] lower = new double[n], upper = new double[n];
        int counted = 0, inside = 0;
        for (int i = 0; i < n; i++) {
            if (!(holdout.valid[i] && nominal.valid[i] && Double.isFinite(predict[i]))) {
                lower[i] = Double.NaN;                                             // as y_predict, which is masked there
                upper[i] = Double.NaN;
                continue;
            }
            double half = Z95 * Math.sqrt(var[i] + noise);
            lower[i] = predict[i] - half;
            upper[i] = predict[i] + half;
            if (Double.isFinite(holdout.y[i])) {
                counted++;
                if (holdout.y[i] >= lower[i] && holdout.y[i] <= upper[i]) inside++;
            }
        }
        return new Result(predict, lower, upper, counted == 0 ? Double.NaN : (double) inside / counted, used, halfWidthUsed);
    }

    /** The training fit's level and drift: they move the run only when it starts from them (the fallback start). */
    private static boolean isTrainingStart(String name) {
        return BASELINE.equals(name) || BASELINE_SLOPE.equals(name);
    }

    private static void add(double[] var, double[] g, double uSquared) {
        for (int i = 0; i < var.length; i++) if (Double.isFinite(g[i])) var[i] += g[i] * g[i] * uSquared;
    }

    /** d yhat / d p by central differences (one-sided when the family refuses one side); null when the model has no such parameter. */
    private static double[] sensitivity(String name, ProcessModel m, Runs runs, double[] nominal) {
        double p;
        if (BASELINE.equals(name)) {
            p = runs.y0;
        } else if (BASELINE_SLOPE.equals(name)) {
            p = runs.v0;
        } else {
            Quantity q = m.parameters().get(name);
            if (q == null || !q.available()) return null;
            p = q.value;
        }
        double d = Math.max(1e-3 * Math.abs(p), 1e-6);
        double[] up = perturbed(name, m, runs, p + d);
        double[] down = perturbed(name, m, runs, p - d);
        if (up == null && down == null) return null;
        double[] g = new double[nominal.length];
        for (int i = 0; i < g.length; i++) {
            if (up != null && down != null) g[i] = (up[i] - down[i]) / (2 * d);
            else if (up != null) g[i] = (up[i] - nominal[i]) / d;
            else g[i] = (nominal[i] - down[i]) / d;
        }
        return g;
    }

    /** The secant d yhat / d theta over [max(0, theta - h), theta + h]; null when the model has no dead time or refuses a side. */
    private static double[] deadTimeSecant(ProcessModel m, Runs runs, double h) {
        Quantity q = m.parameters().get(DEAD_TIME);
        if (q == null || !q.available()) return null;
        double hi = q.value + h, lo = Math.max(0, q.value - h);
        ProcessModel up = changed(m, DEAD_TIME, hi), down = changed(m, DEAD_TIME, lo);
        if (up == null || down == null || !(hi > lo)) return null;
        double[] yUp = runs.of(up, runs.y0, runs.v0), yDown = runs.of(down, runs.y0, runs.v0);
        double[] g = new double[yUp.length];
        for (int i = 0; i < g.length; i++) g[i] = (yUp[i] - yDown[i]) / (hi - lo);
        return g;
    }

    /** The free run with one parameter set to value; null when the family refuses the value (e.g. a damping ratio pushed to 1). */
    private static double[] perturbed(String name, ProcessModel m, Runs runs, double value) {
        if (BASELINE.equals(name)) return runs.of(m, value, runs.v0);
        if (BASELINE_SLOPE.equals(name)) return runs.of(m, runs.y0, value);
        ProcessModel changed = changed(m, name, value);
        return changed == null ? null : runs.of(changed, runs.y0, runs.v0);
    }

    private static ProcessModel changed(ProcessModel m, String name, double value) {
        try {
            return m.withParameter(name, value);
        } catch (IllegalArgumentException refused) {
            return null;
        }
    }

    /** The holdout and operating point of one band; every free run checks the band's deadline. */
    private static final class Runs {
        final EventDataset h;
        final double u0, y0, v0, maxGapS;
        final long deadlineNanos;

        Runs(EventDataset h, double u0, double y0, double v0, double maxGapS, long deadlineNanos) {
            this.h = h;
            this.u0 = u0;
            this.y0 = y0;
            this.v0 = v0;
            this.maxGapS = maxGapS;
            this.deadlineNanos = deadlineNanos;
        }

        double[] of(ProcessModel m, double y0, double v0) {
            FitBudgetExceeded.check(deadlineNanos);              // the simulator checks every 256 samples: a short holdout never would
            return ZohSimulator.simulate(m, h.t, h.u, u0, y0, v0, h.t0, maxGapS, deadlineNanos).yHat;
        }
    }
}
