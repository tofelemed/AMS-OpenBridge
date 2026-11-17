package com.ams.flink.cplm.response.validation;

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
 * uncertainty from a real one. By linearisation: half-width(t) = 1.96 sqrt(sum_j g_j(t)^2 se_j^2 + sigma^2), with
 * g_j = (yhat(p + d_j) - yhat(p - d_j)) / (2 d_j) from the exact ZOH simulation and d_j = max(1e-3 |p_j|, 1e-6).
 *
 * <p>The parameters perturbed are exactly the keys of the estimator's standard-error map that carry a finite standard error:
 * the model's catalogue parameters through {@link ProcessModel#withParameter}, and the fitted baseline ("baseline", y0) and
 * drift ("baseline_slope", v0), which ride the same map. A missing or non-finite standard error, or a name this model does not
 * have, is skipped; with none the band is the residual band +-1.96 sigma. Parameter correlations are not available (standard
 * errors only) and are ignored. A prediction interval of the output, never a confidence interval of the parameters. Cost: one
 * free run plus two per perturbed parameter on the holdout - no refit.
 */
public final class PredictionBand {
    public static final double Z95 = 1.96;
    /** The fitted offset and drift: in the standard-error map (OutputErrorEstimator.paramNames), outside ProcessModel. */
    static final String BASELINE = "baseline", BASELINE_SLOPE = "baseline_slope";

    public static final class Result {
        /** The free run on the holdout's times (the y_predict values); NaN where the simulation stopped. */
        public final double[] predict;
        /** Aligned to the holdout's times; NaN where the holdout sample or the free run is invalid. */
        public final double[] lower, upper;
        /** Share of the valid holdout samples inside the band; NaN without one. */
        public final double coverage;
        /** The parameters whose standard error entered the band, in the map's order. */
        public final List<String> parameters;

        Result(double[] predict, double[] lower, double[] upper, double coverage, List<String> parameters) {
            this.predict = predict;
            this.lower = lower;
            this.upper = upper;
            this.coverage = coverage;
            this.parameters = Collections.unmodifiableList(parameters);
        }
    }

    private PredictionBand() {}

    /** The fit's residual noise: sqrt(objective / max(1, samples - parameters)); NaN for a non-finite or negative objective. */
    public static double residualSigma(double objective, int samples, int parameters) {
        if (!(objective >= 0) || Double.isInfinite(objective)) return Double.NaN;
        return Math.sqrt(objective / Math.max(1, samples - parameters));
    }

    /** A non-finite residualSigma counts as none (the band is then the parameter part alone, still finite). */
    public static Result compute(ProcessModel model, Map<String, Double> stdErr, double residualSigma, EventDataset holdout,
                                 double u0, double y0, double v0, double maxGapS) {
        ZohSimulator.Result run = ZohSimulator.simulate(model, holdout.t, holdout.u, u0, y0, v0, holdout.t0, maxGapS);
        double[] predict = run.yHat;
        int n = predict.length;
        double[] var = new double[n];
        List<String> used = new ArrayList<>();
        if (stdErr != null) {
            for (Map.Entry<String, Double> e : stdErr.entrySet()) {
                Double se = e.getValue();
                if (se == null || !Double.isFinite(se)) continue;                  // a missing standard error is skipped
                double[] g = sensitivity(e.getKey(), model, holdout, u0, y0, v0, maxGapS, predict);
                if (g == null) continue;                                           // not a parameter of this model
                for (int i = 0; i < n; i++) if (Double.isFinite(g[i])) var[i] += g[i] * g[i] * se * se;
                used.add(e.getKey());
            }
        }
        double noise = Double.isFinite(residualSigma) && residualSigma > 0 ? residualSigma * residualSigma : 0;
        double[] lower = new double[n], upper = new double[n];
        int counted = 0, inside = 0;
        for (int i = 0; i < n; i++) {
            if (!(holdout.valid[i] && run.valid[i] && Double.isFinite(predict[i]))) {
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
        return new Result(predict, lower, upper, counted == 0 ? Double.NaN : (double) inside / counted, used);
    }

    /** d yhat / d p by central differences (one-sided when the family refuses one side); null when the model has no such parameter. */
    private static double[] sensitivity(String name, ProcessModel m, EventDataset h, double u0, double y0, double v0, double maxGapS, double[] nominal) {
        double p;
        if (BASELINE.equals(name)) {
            p = y0;
        } else if (BASELINE_SLOPE.equals(name)) {
            p = v0;
        } else {
            Quantity q = m.parameters().get(name);
            if (q == null || !q.available()) return null;
            p = q.value;
        }
        double d = Math.max(1e-3 * Math.abs(p), 1e-6);
        double[] up = perturbed(name, m, h, u0, y0, v0, maxGapS, p + d);
        double[] down = perturbed(name, m, h, u0, y0, v0, maxGapS, p - d);
        if (up == null && down == null) return null;
        double[] g = new double[nominal.length];
        for (int i = 0; i < g.length; i++) {
            if (up != null && down != null) g[i] = (up[i] - down[i]) / (2 * d);
            else if (up != null) g[i] = (up[i] - nominal[i]) / d;
            else g[i] = (nominal[i] - down[i]) / d;
        }
        return g;
    }

    /** The free run with one parameter set to value; null when the family refuses the value (e.g. a damping ratio pushed to 1). */
    private static double[] perturbed(String name, ProcessModel m, EventDataset h, double u0, double y0, double v0, double maxGapS, double value) {
        if (BASELINE.equals(name)) return ZohSimulator.simulate(m, h.t, h.u, u0, value, v0, h.t0, maxGapS).yHat;
        if (BASELINE_SLOPE.equals(name)) return ZohSimulator.simulate(m, h.t, h.u, u0, y0, value, h.t0, maxGapS).yHat;
        ProcessModel changed;
        try {
            changed = m.withParameter(name, value);
        } catch (IllegalArgumentException refused) {
            return null;
        }
        return ZohSimulator.simulate(changed, h.t, h.u, u0, y0, v0, h.t0, maxGapS).yHat;
    }
}
