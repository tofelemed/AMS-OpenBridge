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
 * CHG-216 (SME item 5b): setpoint steps on integrating loops. The closed-loop prediction-error method runs on the RATE of
 * change of the PV, r[k] = (y[k] - y[k-1]) / ts, where an integrating process behaves like a self-regulating one:
 * IPDT:           r[k] - rRef = b1 (u[k-nk-1] - uRef) + b2 (u[k-nk-2] - uRef) + e[k] + c e[k-1]       (no lag)
 * integrator-lag: r[k] - rRef = a (r[k-1] - rRef) + b1 (...) + b2 (...) + e[k] + c e[k-1]              (one lag)
 * The integrating gain is (b1 + b2) / (1 - a) per second; the two input terms carry the fraction of a grid step in the dead
 * time, as in {@link ClosedLoopPemEstimator}. Excitation must come from the reference, never from feedback-driven input
 * motion. Needs a uniform grid. The free run starts on the pre-step line: y0 = that line at t0, v0 = the drift it implies at
 * the input baseline u0 (rPre - Ki (uPre - u0)).
 */
public final class ClosedLoopIntegratingEstimator implements ModelEstimator {
    public static final String METHOD_ID = "PEM_ARMAX_RATE";
    public static final String METHOD_VERSION = "1.0.0";

    @Override
    public Set<ModelFamily> supportedFamilies() {
        return EnumSet.of(ModelFamily.IPDT, ModelFamily.INTEGRATOR_LAG);
    }

    @Override
    public String methodId() { return METHOD_ID; }

    @Override
    public String methodVersion() { return METHOD_VERSION; }

    @Override
    public boolean requiresUniformGrid() { return true; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        if (!supportedFamilies().contains(family)) return EstimationResult.none(EstimationResult.State.UNSUPPORTED, "NOT_AN_INTEGRATING_FAMILY");
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

        double[] rate = new double[n];
        boolean[] ok = new boolean[n];
        for (int k = 1; k < n; k++) {
            ok[k] = d.valid[k] && d.valid[k - 1];
            rate[k] = ok[k] ? (d.y[k] - d.y[k - 1]) / ts : 0;
        }
        PreStep pre = PreStep.of(d, rate, ok);
        int order = family == ModelFamily.INTEGRATOR_LAG ? 1 : 0;
        List<Trial> trials = new ArrayList<>();
        int nkMax = (int) Math.max(1, Math.round(s.thetaMaxS / ts));
        for (int nk = 0; nk <= nkMax; nk++) {
            try {
                FitBudgetExceeded.check(s.deadlineNanos);
                Trial t = fit(d, rate, ok, pre, order, nk, ts, s);
                if (t != null) trials.add(t);
            } catch (FitBudgetExceeded e) {
                throw e.atStage("PEM_RATE NK " + nk + "/" + nkMax);
            }
        }
        if (trials.isEmpty()) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NO_STABLE_INVERTIBLE_FIT");
        trials.sort((a, b) -> Double.compare(a.objective, b.objective));
        List<EstimationResult.Candidate> out = new ArrayList<>();
        for (Trial t : trials) {
            Map<String, Double> se = new LinkedHashMap<>();
            se.put("process_gain", t.gainSe);
            double v0 = pre.rate - t.model.gain * (pre.u - u0);
            out.add(new EstimationResult.Candidate(t.model, pre.yAtT0, v0, t.objective, n, se, false, false, false, t.condition, ts, new double[0], new double[0]));
            if (out.size() >= 3) break;
        }
        return new EstimationResult(EstimationResult.State.ESTIMATED, "", out);
    }

    /** The pre-step operating point: mean rate and input before t0, and the PV line through the pre-step samples at t0. */
    static final class PreStep {
        final double rate, u, yAtT0;

        PreStep(double rate, double u, double yAtT0) {
            this.rate = rate;
            this.u = u;
            this.yAtT0 = yAtT0;
        }

        static PreStep of(EventDataset d, double[] rate, boolean[] ok) {
            double sr = 0, su = 0, st = 0, sy = 0, stt = 0, sty = 0;
            int nr = 0, nu = 0;
            for (int k = 0; k < d.size() && d.t[k] < d.t0; k++) {
                if (!d.valid[k]) continue;
                su += d.u[k]; st += d.t[k]; sy += d.y[k]; stt += d.t[k] * d.t[k]; sty += d.t[k] * d.y[k];
                nu++;
                if (k > 0 && ok[k]) { sr += rate[k]; nr++; }
            }
            if (nu < 3) {                                                        // too little before the step: the event means, flat
                double y = 0, u = 0;
                for (int k = 0; k < d.size(); k++) { y += d.y[k] / d.size(); u += d.u[k] / d.size(); }
                return new PreStep(0, u, y);
            }
            double slope = (nu * sty - st * sy) / (nu * stt - st * st);
            double intercept = (sy - slope * st) / nu;
            return new PreStep(nr > 0 ? sr / nr : 0, su / nu, intercept + slope * d.t0);
        }
    }

    static final class Trial {
        final int nk;
        final double objective, condition, gainSe;
        final ProcessModel model;

        Trial(int nk, double objective, double condition, double gainSe, ProcessModel model) {
            this.nk = nk;
            this.objective = objective;
            this.condition = condition;
            this.gainSe = gainSe;
            this.model = model;
        }
    }

    private static Trial fit(EventDataset d, double[] rate, boolean[] ok, PreStep pre, int order, int nk, double ts, EstimatorSettings s) {
        int n = d.size(), nb = 2;
        int start = Math.max(order + 1, nk + nb) + 1;                           // rate[0] does not exist
        if (n - start < 4 * (order + nb) + 4) return null;
        double[][] phi = new double[n - start][order + nb];
        for (int t = start; t < n; t++) {
            for (int i = 1; i <= order; i++) phi[t - start][i - 1] = rate[t - i] - pre.rate;
            for (int j = 1; j <= nb; j++) phi[t - start][order + j - 1] = d.u[t - nk - j] - pre.u;
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
        if (order == 1) { p0[0] = 0.5; lo[0] = -2; hi[0] = 2; }
        for (int j = 0; j < nb; j++) { p0[order + j] = j == 0 ? 0.01 : 0; lo[order + j] = -100; hi[order + j] = 100; }
        p0[np - 1] = 0; lo[np - 1] = -0.98; hi[np - 1] = 0.98;
        final int st = start;
        BoundedLm.Residuals res = p -> {
            double[] r = new double[n - st];
            double ePrev = 0;
            for (int t = st; t < n; t++) {
                double yhat = 0;
                for (int i = 1; i <= order; i++) yhat += p[i - 1] * (rate[t - i] - pre.rate);
                for (int j = 1; j <= nb; j++) yhat += p[order + j - 1] * (d.u[t - nk - j] - pre.u);
                yhat += p[np - 1] * ePrev;
                double e = ok[t] ? (rate[t] - pre.rate) - yhat : 0;
                r[t - st] = e;
                ePrev = e;
            }
            return r;
        };
        BoundedLm.Fit fit = BoundedLm.fit(res, p0, lo, hi, s.maxIterations, s.maxEvaluations, s.boundsHitFraction, s.illConditioned, s.deadlineNanos);
        if (!Double.isFinite(fit.objective)) return null;
        ProcessModel model = toModel(fit.p, order, nk, ts);
        if (model == null) return null;
        double denom = order == 1 ? 1 - fit.p[0] : 1;
        double bSe = Double.isFinite(fit.stdErr[order]) && Double.isFinite(fit.stdErr[order + 1]) ? Math.hypot(fit.stdErr[order], fit.stdErr[order + 1]) : Double.NaN;
        double gainSe = Double.isNaN(bSe) || denom == 0 ? Double.NaN : Math.abs(bSe / denom);
        return new Trial(nk, fit.objective, cond, gainSe, model);
    }

    /** The rate-domain fit as an integrating model; null when the lag is not a stable real pole or there is no gain. */
    static ProcessModel toModel(double[] p, int order, int nk, double ts) {
        if (order == 0) {
            double b1 = p[0], b2 = p[1], b = b1 + b2;
            if (b == 0) return null;
            double f = b2 / b;                                                   // integral of a delayed ZOH input over one step
            if (!(f >= 0 && f <= 1)) f = 0;
            return ProcessModel.ipdt("OP_TO_PV", b, (nk + f) * ts);
        }
        double a = p[0], b1 = p[1], b2 = p[2];
        if (!(a > 0 && a < 1) || b1 + b2 == 0) return null;
        double tau = -ts / Math.log(a);
        return ProcessModel.integratorLag("OP_TO_PV", (b1 + b2) / (1 - a), (nk + ClosedLoopPemEstimator.fractionalDelay(a, b1, b2)) * ts, tau);
    }
}
