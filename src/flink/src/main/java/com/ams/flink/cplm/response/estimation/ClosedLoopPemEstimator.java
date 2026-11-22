package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.Array2DRowRealMatrix;
import org.apache.commons.math3.linear.SingularValueDecomposition;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Qualified prediction-error adapter for closed-loop routine data (spec §2.7): ARMAX(n, n, 1)
 * y_t = sum a_i y_{t-i} + sum b_j u_{t-nk-j} + e_t + c e_{t-1}, the one-step innovation minimised by
 * the bounded LM over orders {1, 2} and the delay grid; |c| < 1 (invertible), A(q) stable (poles
 * inside the unit circle) or the candidate is discarded; excitation must come from the REFERENCE
 * (the exogenous signal), never inferred from feedback-driven input motion. Competing orders
 * within the ambiguity tolerance are AMBIGUOUS_MODELS. Requires a uniform sample grid.
 *
 * <p>CHG-210 (1.1.0): the regression is in deviations from the pre-step steady state - the means (uPre, yPre) of the valid
 * samples before t0, i.e. the capture's pre-support - not from the event means: over a step event the means are not a steady
 * state (the PV lags the input by theta + tau), so centring on them biased the gain and left every free run offset by about
 * K du (theta + tau) / T. The candidate's y0 is the PV level the model holds at the free run's input baseline u0:
 * y0 = yPre - K (uPre - u0). Fewer than {@link #MIN_PRE_STEP_SAMPLES} valid pre-step samples: centred on the event means.
 */
public final class ClosedLoopPemEstimator implements ModelEstimator {
    public static final String METHOD_ID = "PEM_ARMAX_INNOVATION";
    /** 1.2.0 (CHG-217): first order carries two input terms, so the dead time includes a fraction of a grid step. */
    public static final String METHOD_VERSION = "1.2.0";
    /** CHG-210: below this many valid samples before t0 the regression falls back to the event means. */
    static final int MIN_PRE_STEP_SAMPLES = 3;

    @Override
    public Set<ModelFamily> supportedFamilies() {
        return EnumSet.of(ModelFamily.FOPDT, ModelFamily.SOPDT, ModelFamily.SO_UNDERDAMPED);
    }

    @Override
    public String methodId() { return METHOD_ID; }

    @Override
    public String methodVersion() { return METHOD_VERSION; }

    @Override
    public boolean requiresUniformGrid() { return true; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        int n = d.size();
        if (n < 40) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "INSUFFICIENT_SUPPORT");
        double ts = d.t[1] - d.t[0];
        for (int i = 2; i < n; i++) {
            if (Math.abs((d.t[i] - d.t[i - 1]) - ts) > 1e-6 * ts) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NON_UNIFORM_GRID");
        }
        double rMean = 0;
        for (double v : d.r) rMean += v / n;
        double rEnergy = 0;
        for (double v : d.r) rEnergy += (v - rMean) * (v - rMean);
        if (rEnergy < s.minInputEnergy * n * 0.01) return EstimationResult.none(EstimationResult.State.NO_EXCITATION, "NO_REFERENCE_EXCITATION");

        double[] ref = centre(d);
        double yRef = ref[0], uRef = ref[1];
        int maxOrder = family == ModelFamily.FOPDT ? 1 : 2;
        List<Trial> trials = new ArrayList<>();
        int nkMax = (int) Math.max(1, Math.round(s.thetaMaxS / ts));
        for (int order = 1; order <= maxOrder; order++) {
            for (int nk = 0; nk <= nkMax; nk++) {
                try {                                                          // CHG-075: the deadline stops the order/delay scan
                    FitBudgetExceeded.check(s.deadlineNanos);
                    Trial t = fit(d, yRef, uRef, order, nk, ts, s);
                    if (t != null) trials.add(t);
                } catch (FitBudgetExceeded e) {
                    throw e.atStage("PEM_ORDER " + order + " NK " + nk + "/" + nkMax);
                }
            }
        }
        if (trials.isEmpty()) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NO_STABLE_INVERTIBLE_FIT");
        trials.sort((a, b) -> Double.compare(a.objective, b.objective));
        Trial best = trials.get(0);
        boolean ambiguous = false;
        for (Trial t : trials) {
            if (t == best) continue;
            if (t.objective <= best.objective * (1 + s.ambiguityTolerance) && t.order != best.order) ambiguous = true;
        }
        List<EstimationResult.Candidate> out = new ArrayList<>();
        for (Trial t : trials) {
            if (t.model == null) continue;
            Map<String, Double> se = new LinkedHashMap<>();
            se.put("process_gain", t.gainSe);
            // CHG-210: every free run starts at the input baseline u0, so y0 is the PV level the model holds there
            double y0 = yRef - t.model.gain * (uRef - u0);
            // final review M5: the dead-time uncertainty is one grid step. CHG-217: on resampled data the grid is half the read spacing
            // and the remaining bias (about 1.5 s at 4-6 s reads) is inside it
            out.add(new EstimationResult.Candidate(t.model, y0, 0, t.objective, n, se, false, false, false, t.condition, ts, new double[0], new double[0]));
            if (out.size() >= 3) break;
        }
        if (out.isEmpty()) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NO_CONTINUOUS_EQUIVALENT");
        return new EstimationResult(ambiguous ? EstimationResult.State.AMBIGUOUS_MODELS : EstimationResult.State.ESTIMATED,
                ambiguous ? "COMPETING_ORDERS" : "", out);
    }

    /**
     * CHG-210: the regression's operating point {yRef, uRef} - the means of the valid samples before t0 (the capture's
     * pre-support), or the event means (all samples, as before) when fewer than MIN_PRE_STEP_SAMPLES are valid.
     */
    static double[] centre(EventDataset d) {
        double yPre = 0, uPre = 0;
        int pre = 0;
        for (int i = 0; i < d.size() && d.t[i] < d.t0; i++) {
            if (!d.valid[i]) continue;
            yPre += d.y[i];
            uPre += d.u[i];
            pre++;
        }
        if (pre >= MIN_PRE_STEP_SAMPLES) return new double[] {yPre / pre, uPre / pre};
        int n = d.size();
        double yMean = 0, uMean = 0;
        for (int i = 0; i < n; i++) {
            yMean += d.y[i] / n;
            uMean += d.u[i] / n;
        }
        return new double[] {yMean, uMean};
    }

    static final class Trial {
        final int order, nk;
        final double objective, condition, gainSe;
        final ProcessModel model;

        Trial(int order, int nk, double objective, double condition, double gainSe, ProcessModel model) {
            this.order = order;
            this.nk = nk;
            this.objective = objective;
            this.condition = condition;
            this.gainSe = gainSe;
            this.model = model;
        }
    }

    /**
     * CHG-217: the number of input terms of an order. Order 1 carries two (b1 u[t-nk-1] + b2 u[t-nk-2]): the split between them
     * is the fraction of a grid step in the dead time (a ZOH-discretised FOPDT with delay (nk + f) ts has exactly this form), so
     * the dead time is no longer rounded down to whole steps.
     */
    static int inputTerms(int order) {
        return order == 1 ? 2 : order;
    }

    private static Trial fit(EventDataset d, double yRef, double uRef, int order, int nk, double ts, EstimatorSettings s) {
        int n = d.size();
        int nb = inputTerms(order);
        int start = Math.max(order, nk + nb) + 1;
        if (n - start < 4 * order + 4) return null;
        // regressor condition (excitation rank) on the ARX part
        double[][] phi = new double[n - start][order + nb];
        for (int t = start; t < n; t++) {
            for (int i = 1; i <= order; i++) phi[t - start][i - 1] = d.y[t - i] - yRef;
            for (int j = 1; j <= nb; j++) phi[t - start][order + j - 1] = d.u[t - nk - j] - uRef;
        }
        double cond;
        try {
            double[] sv = new SingularValueDecomposition(new Array2DRowRealMatrix(phi)).getSingularValues();
            cond = sv[sv.length - 1] > 0 ? sv[0] / sv[sv.length - 1] : Double.POSITIVE_INFINITY;
        } catch (RuntimeException e) {
            return null;
        }
        if (cond > 1e8) return null;

        int np = order + nb + 1;
        double[] p0 = new double[np], lo = new double[np], hi = new double[np];
        for (int i = 0; i < order; i++) {
            p0[i] = i == 0 ? 0.8 : 0.0;
            lo[i] = -2;
            hi[i] = 2;
        }
        for (int j = 0; j < nb; j++) {
            p0[order + j] = j == 0 ? 0.1 : 0.0;
            lo[order + j] = -100;
            hi[order + j] = 100;
        }
        p0[np - 1] = 0.0;
        lo[np - 1] = -0.98;
        hi[np - 1] = 0.98;                                                       // c: invertible noise filter
        final int st = start;
        BoundedLm.Residuals res = p -> {
            double[] r = new double[n - st];
            double ePrev = 0;
            for (int t = st; t < n; t++) {
                double yhat = 0;
                for (int i = 1; i <= order; i++) yhat += p[i - 1] * (d.y[t - i] - yRef);
                for (int j = 1; j <= nb; j++) yhat += p[order + j - 1] * (d.u[t - nk - j] - uRef);
                yhat += p[np - 1] * ePrev;
                double e = (d.y[t] - yRef) - yhat;
                r[t - st] = e;
                ePrev = e;
            }
            return r;
        };
        BoundedLm.Fit fit = BoundedLm.fit(res, p0, lo, hi, s.maxIterations, s.maxEvaluations, s.boundsHitFraction, s.illConditioned, s.deadlineNanos);
        if (!Double.isFinite(fit.objective)) return null;
        ProcessModel model = toContinuous(fit.p, order, nk, ts);
        double denom = 1;
        for (int i = 0; i < order; i++) denom -= fit.p[i];
        double bSe = order == 1 && inputTerms(1) == 2 && Double.isFinite(fit.stdErr[1]) && Double.isFinite(fit.stdErr[2])
                ? Math.hypot(fit.stdErr[1], fit.stdErr[2]) : fit.stdErr[order];
        double gainSe = Double.isNaN(bSe) || denom == 0 ? Double.NaN : Math.abs(bSe / denom);
        return new Trial(order, nk, fit.objective, cond, gainSe, model);
    }

    /**
     * CHG-217: the fraction of a grid step in the dead time from the two input terms of a first-order fit. For y[t] = a y[t-1] +
     * b1 u[t-nk-1] + b2 u[t-nk-2], a ZOH FOPDT with delay (nk + f) ts gives b1 / (b1 + b2) = (1 - a^(1-f)) / (1 - a); f = 0 when the
     * split is outside its range (b1 and b2 of opposite sign, or no gain).
     */
    static double fractionalDelay(double a, double b1, double b2) {
        double b = b1 + b2;
        if (!(a > 0 && a < 1) || b == 0 || b1 / b < 0 || b1 / b > 1) return 0;
        double q = 1 - (1 - a) * b1 / b;                                         // = a^(1-f)
        if (!(q > 0)) return 0;
        double f = 1 - Math.log(q) / Math.log(a);
        return Double.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
    }

    /** Discrete ARX part -> continuous family; null when unstable or not representable (never a fake FOPDT). */
    static ProcessModel toContinuous(double[] p, int order, int nk, double ts) {
        double theta = nk * ts;
        if (order == 1) {
            double a = p[0], b1 = p[1], b2 = inputTerms(1) == 2 ? p[2] : 0;
            if (!(a > 0 && a < 1)) return null;
            double tau = -ts / Math.log(a);
            return ProcessModel.fopdt("OP_TO_PV", (b1 + b2) / (1 - a), (nk + fractionalDelay(a, b1, b2)) * ts, tau);
        }
        double a1 = p[0], a2 = p[1], b1 = p[2], b2 = p[3];
        double disc = a1 * a1 + 4 * a2;
        double denom = 1 - a1 - a2;
        if (denom == 0) return null;
        double kp = (b1 + b2) / denom;
        if (disc >= 0) {
            double z1 = (a1 + Math.sqrt(disc)) / 2, z2 = (a1 - Math.sqrt(disc)) / 2;
            if (!(z1 > 0 && z1 < 1 && z2 > 0 && z2 < 1)) return null;
            return ProcessModel.sopdt("OP_TO_PV", kp, theta, -ts / Math.log(z1), -ts / Math.log(z2));
        }
        double re = a1 / 2, im = Math.sqrt(-disc) / 2, mag = Math.hypot(re, im);
        if (!(mag < 1)) return null;
        double zetaWn = -Math.log(mag) / ts, wd = Math.atan2(im, re) / ts, wn = Math.hypot(zetaWn, wd), zeta = zetaWn / wn;
        if (!(zeta > 0 && zeta < 1)) return null;
        return ProcessModel.underdamped("OP_TO_PV", kp, theta, zeta, wn);
    }
}
