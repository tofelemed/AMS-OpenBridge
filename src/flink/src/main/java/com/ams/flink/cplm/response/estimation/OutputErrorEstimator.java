package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bounded weighted output-error fitting (spec §2.7): J = sum w_i (y_i - yhat_i(p))^2 with the exact
 * ZOH simulation; a profile of delays on the signal-time grid, the other parameters optimised per
 * delay seed, then the delay refined by golden section; both gain signs when the sign is not
 * established; objective versus delay and identifiability diagnostics retained. Requires an
 * applied-input excitation - constant input is NO_EXCITATION, never a model.
 */
public final class OutputErrorEstimator implements ModelEstimator {
    public static final String METHOD_ID = "OE_LM_DELAY_PROFILE";
    public static final String METHOD_VERSION = "1.0.0";

    @Override
    public Set<ModelFamily> supportedFamilies() {
        return EnumSet.of(ModelFamily.FOPDT, ModelFamily.SOPDT, ModelFamily.SO_UNDERDAMPED, ModelFamily.IPDT, ModelFamily.INTEGRATOR_LAG);
    }

    @Override
    public String methodId() { return METHOD_ID; }

    @Override
    public String methodVersion() { return METHOD_VERSION; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        if (!supportedFamilies().contains(family)) return EstimationResult.none(EstimationResult.State.UNSUPPORTED, "UNSUPPORTED_MODEL_FAMILY");
        Support sup = Support.of(d, u0, s);
        if (sup.n < 8) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "INSUFFICIENT_SUPPORT");
        if (sup.inputRange < s.minInputEu || sup.inputEnergy < s.minInputEnergy) return EstimationResult.none(EstimationResult.State.NO_EXCITATION, "NO_INPUT_EXCITATION");

        double gainSeed = seedGain(sup, family);
        List<Double> signs = new ArrayList<>();
        signs.add(1.0);
        if (s.includeBothSigns) signs.add(-1.0);
        List<Double> thetas = new ArrayList<>();
        for (double th = s.thetaMinS; th <= s.thetaMaxS + 1e-9; th += s.delayGridS) thetas.add(th);

        Trial best = null;
        double[] profile = new double[thetas.size()], objective = new double[thetas.size()];
        Map<Double, Trial> bestPerSign = new LinkedHashMap<>();
        for (int k = 0; k < thetas.size(); k++) {
            double theta = thetas.get(k);
            Trial bestAtTheta = null;
            try {                                                              // CHG-075: the deadline stops the profile here
                FitBudgetExceeded.check(s.deadlineNanos);
                for (double sign : signs) {
                    Trial t = fitAtDelay(sup, family, theta, sign * Math.abs(gainSeed), s);
                    if (t == null) continue;
                    if (bestAtTheta == null || t.fit.objective < bestAtTheta.fit.objective) bestAtTheta = t;
                    Trial prev = bestPerSign.get(sign);
                    if (prev == null || t.fit.objective < prev.fit.objective) bestPerSign.put(sign, t);
                }
            } catch (FitBudgetExceeded e) {
                throw e.atStage("OE_THETA " + k + "/" + thetas.size());
            }
            profile[k] = theta;
            objective[k] = bestAtTheta == null ? Double.NaN : bestAtTheta.fit.objective;
            if (bestAtTheta != null && (best == null || bestAtTheta.fit.objective < best.fit.objective)) best = bestAtTheta;
        }
        if (best == null) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "FIT_FAILED");

        // refine the delay continuously around the best grid seed (golden section, LM inside)
        double lo = Math.max(s.thetaMinS, best.theta - s.delayGridS), hi = Math.min(s.thetaMaxS, best.theta + s.delayGridS);
        double sign = Math.signum(best.gain()) == 0 ? 1 : Math.signum(best.gain());
        best = refineDelay(sup, family, lo, hi, sign * Math.abs(gainSeed), s, best);

        // flat delay: the objective within flatTolerance of the minimum over a range wider than two grid steps
        double jmin = Double.POSITIVE_INFINITY;
        for (double v : objective) if (!Double.isNaN(v)) jmin = Math.min(jmin, v);
        double flatLo = Double.POSITIVE_INFINITY, flatHi = Double.NEGATIVE_INFINITY;
        for (int k = 0; k < profile.length; k++) {
            if (!Double.isNaN(objective[k]) && objective[k] <= jmin * (1 + s.flatTolerance)) {
                flatLo = Math.min(flatLo, profile[k]);
                flatHi = Math.max(flatHi, profile[k]);
            }
        }
        boolean flat = flatHi - flatLo > 2 * s.delayGridS || best.theta < s.delayGridS;
        double thetaUnc = Math.max(0.5 * s.delayGridS, 0.5 * (flatHi - flatLo));

        boolean signUncertain = false;
        if (bestPerSign.size() == 2) {
            double a = bestPerSign.get(1.0).fit.objective, b = bestPerSign.get(-1.0).fit.objective;
            signUncertain = Math.abs(a - b) <= s.ambiguityTolerance * Math.max(a, b);
        }
        Map<String, Double> se = new LinkedHashMap<>();
        String[] names = paramNames(family);
        for (int i = 0; i < names.length; i++) se.put(names[i], best.fit.stdErr[i]);
        EstimationResult.Candidate c = new EstimationResult.Candidate(best.model(family), best.y0(), best.v0(), best.fit.objective, sup.n, se,
                best.fit.boundsHit, flat, signUncertain, best.fit.conditionNumber, thetaUnc, profile, objective);
        List<EstimationResult.Candidate> list = new ArrayList<>();
        list.add(c);
        return new EstimationResult(EstimationResult.State.ESTIMATED, signUncertain ? "SIGN_UNCERTAIN" : "", list);
    }

    // ---- internals -------------------------------------------------------------------------

    /** The valid support of the event and the excitation facts. */
    static final class Support {
        final double[] t, y, u, w;
        final int n;
        final double u0, t0, span, inputRange, inputEnergy, yFirst, vGuess, maxBridgeS, duration;

        private Support(double[] t, double[] y, double[] u, double[] w, double u0, double t0, double maxBridgeS) {
            this.t = t;
            this.y = y;
            this.u = u;
            this.w = w;
            this.n = t.length;
            this.u0 = u0;
            this.t0 = t0;
            this.maxBridgeS = maxBridgeS;
            double ymin = Double.POSITIVE_INFINITY, ymax = Double.NEGATIVE_INFINITY, umax = 0, energy = 0;
            for (int i = 0; i < n; i++) {
                ymin = Math.min(ymin, y[i]);
                ymax = Math.max(ymax, y[i]);
                umax = Math.max(umax, Math.abs(u[i] - u0));
                energy += (u[i] - u0) * (u[i] - u0);
            }
            this.span = Math.max(ymax - ymin, 1e-9);
            this.inputRange = umax;
            this.inputEnergy = energy;
            this.yFirst = y[0];
            this.duration = Math.max(t[n - 1] - t[0], 1e-9);
            this.vGuess = (y[n - 1] - y[0]) / duration;
        }

        static Support of(EventDataset d, double u0, EstimatorSettings s) {
            List<Integer> idx = new ArrayList<>();
            for (int i = 0; i < d.size(); i++) if (d.valid[i] && Double.isFinite(d.y[i]) && Double.isFinite(d.u[i])) idx.add(i);
            double[] t = new double[idx.size()], y = new double[idx.size()], u = new double[idx.size()], w = new double[idx.size()];
            for (int k = 0; k < idx.size(); k++) {
                int i = idx.get(k);
                t[k] = d.t[i];
                y[k] = d.y[i];
                u[k] = d.u[i];
                w[k] = s.weights == null ? 1 : s.weights[i];
            }
            return new Support(t, y, u, w, u0, d.t0, s.maxBridgeS);
        }
    }

    static final class Trial {
        final double theta;
        final double[] p;
        final BoundedLm.Fit fit;
        final ModelFamily family;

        Trial(double theta, BoundedLm.Fit fit, ModelFamily family) {
            this.theta = theta;
            this.p = fit.p;
            this.fit = fit;
            this.family = family;
        }

        double gain() { return p[0]; }

        double y0() { return p[p.length - (family.integrating() ? 2 : 1)]; }

        double v0() { return family.integrating() ? p[p.length - 1] : 0.0; }

        ProcessModel model(ModelFamily f) { return build(f, "fit", theta, p); }
    }

    static String[] paramNames(ModelFamily f) {
        switch (f) {
            case FOPDT: return new String[] {"process_gain", "time_constant", "baseline"};
            case SOPDT: return new String[] {"process_gain", "time_constant_1", "time_constant_2", "baseline"};
            case SO_UNDERDAMPED: return new String[] {"process_gain", "damping_ratio", "natural_frequency", "baseline"};
            case IPDT: return new String[] {"integrating_gain", "baseline", "baseline_slope"};
            default: return new String[] {"integrating_gain", "time_constant", "baseline", "baseline_slope"};
        }
    }

    static ProcessModel build(ModelFamily f, String path, double theta, double[] p) {
        switch (f) {
            case FOPDT: return ProcessModel.fopdt(path, p[0], theta, p[1]);
            case SOPDT: return ProcessModel.sopdt(path, p[0], theta, p[1], p[2]);
            case SO_UNDERDAMPED: return ProcessModel.underdamped(path, p[0], theta, p[1], p[2]);
            case IPDT: return ProcessModel.ipdt(path, p[0], theta);
            default: return ProcessModel.integratorLag(path, p[0], theta, p[1]);
        }
    }

    private static double seedGain(Support sup, ModelFamily f) {
        double du = 0;
        for (int i = 0; i < sup.n; i++) if (Math.abs(sup.u[i] - sup.u0) > Math.abs(du)) du = sup.u[i] - sup.u0;
        if (du == 0) return 1.0;
        if (f.integrating()) {
            int h = sup.n / 2;
            double vBefore = (sup.y[h] - sup.y[0]) / Math.max(sup.t[h] - sup.t[0], 1e-9);
            double vAfter = (sup.y[sup.n - 1] - sup.y[h]) / Math.max(sup.t[sup.n - 1] - sup.t[h], 1e-9);
            double ki = (vAfter - vBefore) / du;
            return ki == 0 ? 1e-3 / Math.abs(du) : ki;
        }
        return (sup.y[sup.n - 1] - sup.y[0]) / du;
    }

    private static Trial fitAtDelay(Support sup, ModelFamily f, double theta, double gainSeed, EstimatorSettings s) {
        double[] p0, lo, hi;
        double g = Math.max(Math.abs(gainSeed), 1e-6);
        double gLo = gainSeed >= 0 ? 1e-9 : -s.gainAbsMax, gHi = gainSeed >= 0 ? s.gainAbsMax : -1e-9;
        double yLo = sup.yFirst - 2 * sup.span - 1, yHi = sup.yFirst + 2 * sup.span + 1;
        double vMax = Math.max(Math.abs(sup.vGuess) * 4, sup.span / sup.duration) + 1e-9;
        double signedG = Math.copySign(g, gainSeed);
        switch (f) {
            case FOPDT:
                p0 = new double[] {signedG, Math.max(s.tauMinS * 2, sup.duration / 5), sup.yFirst};
                lo = new double[] {gLo, s.tauMinS, yLo};
                hi = new double[] {gHi, s.tauMaxS, yHi};
                break;
            case SOPDT:
                p0 = new double[] {signedG, sup.duration / 5, sup.duration / 10, sup.yFirst};
                lo = new double[] {gLo, s.tauMinS, s.tauMinS, yLo};
                hi = new double[] {gHi, s.tauMaxS, s.tauMaxS, yHi};
                break;
            case SO_UNDERDAMPED:
                p0 = new double[] {signedG, 0.5, 2 * Math.PI / sup.duration * 4, sup.yFirst};
                lo = new double[] {gLo, s.zetaMin, s.wnMinRadS, yLo};
                hi = new double[] {gHi, s.zetaMax, s.wnMaxRadS, yHi};
                break;
            case IPDT:
                p0 = new double[] {signedG, sup.yFirst, sup.vGuess};
                lo = new double[] {gLo, yLo, -vMax};
                hi = new double[] {gHi, yHi, vMax};
                break;
            default:
                p0 = new double[] {signedG, sup.duration / 10, sup.yFirst, sup.vGuess};
                lo = new double[] {gLo, s.tauMinS, yLo, -vMax};
                hi = new double[] {gHi, s.tauMaxS, yHi, vMax};
                break;
        }
        final double th = theta;
        BoundedLm.Residuals res = p -> {
            ProcessModel m;
            try {
                m = build(f, "fit", th, p);
            } catch (IllegalArgumentException e) {
                return huge(sup.n);
            }
            double y0 = p[p.length - (f.integrating() ? 2 : 1)], v0 = f.integrating() ? p[p.length - 1] : 0;
            ZohSimulator.Result sim = ZohSimulator.simulate(m, sup.t, sup.u, sup.u0, y0, v0, sup.t0, sup.maxBridgeS, s.deadlineNanos);
            double[] r = new double[sup.n];
            for (int i = 0; i < sup.n; i++) {
                r[i] = sim.valid[i] && Double.isFinite(sim.yHat[i]) ? Math.sqrt(sup.w[i]) * (sup.y[i] - sim.yHat[i]) : 1e3;
            }
            return r;
        };
        BoundedLm.Fit fit = BoundedLm.fit(res, p0, lo, hi, s.maxIterations, s.maxEvaluations, s.boundsHitFraction, s.illConditioned, s.deadlineNanos);
        return Double.isFinite(fit.objective) ? new Trial(theta, fit, f) : null;
    }

    private static double[] huge(int n) {
        double[] r = new double[n];
        Arrays.fill(r, 1e3);
        return r;
    }

    private static Trial refineDelay(Support sup, ModelFamily f, double lo, double hi, double gainSeed, EstimatorSettings s, Trial incumbent) {
        double gr = (Math.sqrt(5) - 1) / 2;
        double a = lo, b = hi;
        double c = b - gr * (b - a), d = a + gr * (b - a);
        int it = 0;
        try {                                                                  // CHG-075: the deadline stops the refinement too
            FitBudgetExceeded.check(s.deadlineNanos);
            Trial tc = fitAtDelay(sup, f, c, gainSeed, s), td = fitAtDelay(sup, f, d, gainSeed, s);
            Trial best = incumbent;
            for (; it < 20 && b - a > 0.01 * s.delayGridS; it++) {
                FitBudgetExceeded.check(s.deadlineNanos);
                double jc = tc == null ? Double.POSITIVE_INFINITY : tc.fit.objective;
                double jd = td == null ? Double.POSITIVE_INFINITY : td.fit.objective;
                if (tc != null && jc < best.fit.objective) best = tc;
                if (td != null && jd < best.fit.objective) best = td;
                if (jc < jd) {
                    b = d;
                    d = c;
                    td = tc;
                    c = b - gr * (b - a);
                    tc = fitAtDelay(sup, f, c, gainSeed, s);
                } else {
                    a = c;
                    c = d;
                    tc = td;
                    d = a + gr * (b - a);
                    td = fitAtDelay(sup, f, d, gainSeed, s);
                }
            }
            return best;
        } catch (FitBudgetExceeded e) {
            throw e.atStage("OE_REFINE " + it + "/20");
        }
    }
}
