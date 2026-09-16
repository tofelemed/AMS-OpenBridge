package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.apache.commons.math3.distribution.ChiSquaredDistribution;

/**
 * Validation on an INDEPENDENT holdout event (spec §2.8): free-run simulation RMSE and one-step
 * prediction RMSE reported separately, fit improvement against the named constant-baseline model,
 * residual bias, Ljung-Box whiteness (lags 1..10), residual-vs-PAST-input correlation (positive
 * lags only - the declared convention; feedback correlates residuals with FUTURE inputs), AICc.
 */
public final class ModelValidator {
    public static final String METHOD = "HOLDOUT_FREE_RUN_V1";
    public static final String LAG_CONVENTION = "POSITIVE_LAGS_RESIDUAL_VS_PAST_INPUT";
    public static final String BASELINE = "CONSTANT_BASELINE_Y0";
    public static final int ACF_LAGS = 10;

    public static final class Report {
        public final String verdict;
        public final Quantity validationRmse, predictionRmse, fitImprovement, residualBias;
        public final double[] residuals, residualAcf;
        public final boolean whitenessPassed;
        public final double whitenessP, inputResidualMaxCorr, aicc;
        public final String lagConvention, reason;

        Report(String verdict, Quantity vr, Quantity pr, Quantity fi, Quantity rb, double[] residuals, double[] acf, boolean white, double whiteP,
               double corr, double aicc, String reason) {
            this.verdict = verdict;
            validationRmse = vr;
            predictionRmse = pr;
            fitImprovement = fi;
            residualBias = rb;
            this.residuals = residuals;
            this.residualAcf = acf;
            whitenessPassed = white;
            whitenessP = whiteP;
            inputResidualMaxCorr = corr;
            this.aicc = aicc;
            lagConvention = LAG_CONVENTION;
            this.reason = reason;
        }
    }

    private ModelValidator() {}

    public static Report validate(ProcessModel m, double y0, double v0, EventDataset h, double u0, double noiseFloorEu, double maxBridgeS) {
        ZohSimulator.Result sim = ZohSimulator.simulate(m, h.t, h.u, u0, y0, v0, h.t0, maxBridgeS);
        int n = 0;
        for (int i = 0; i < h.size(); i++) if (h.valid[i] && sim.valid[i]) n++;
        if (n < 8) return unavailable("INSUFFICIENT_HOLDOUT_SUPPORT");
        double[] res = new double[n], uDev = new double[n];
        double sse = 0, sseP = 0, sseB = 0, bias = 0;
        int k = 0;
        double prevErr = 0;
        for (int i = 0; i < h.size(); i++) {
            if (!(h.valid[i] && sim.valid[i])) continue;
            double e = h.y[i] - sim.yHat[i];
            res[k] = e;
            sse += e * e;
            bias += e;
            double pred = sim.yHat[i] + prevErr;                              // one-step: carry the last innovation
            double ep = h.y[i] - pred;
            sseP += ep * ep;
            prevErr = e;
            double eb = h.y[i] - y0;                                          // the named baseline: constant y0
            sseB += eb * eb;
            uDev[k] = h.u[i] - u0;
            k++;
        }
        double rmse = Math.sqrt(sse / n), rmseP = Math.sqrt(sseP / n), rmseB = Math.sqrt(sseB / n);
        bias /= n;
        double improvement = rmseB > 0 ? 1 - rmse / rmseB : Double.NaN;
        double[] acf = acf(res, ACF_LAGS);
        double q = 0;
        for (int lag = 1; lag <= ACF_LAGS; lag++) q += acf[lag] * acf[lag] / (n - lag);
        q *= n * (n + 2);
        double p = 1 - new ChiSquaredDistribution(ACF_LAGS).cumulativeProbability(q);
        boolean white = p > 0.05;
        double corr = 0;
        for (int lag = 1; lag <= ACF_LAGS; lag++) corr = Math.max(corr, Math.abs(crossCorr(res, uDev, lag)));
        int params = m.order() + 2;
        double aicc = n * Math.log(Math.max(sse / n, 1e-300)) + 2 * params + (2.0 * params * (params + 1)) / Math.max(1, n - params - 1);

        String verdict, reason = "";
        if (Double.isNaN(improvement) || improvement <= 0) {
            verdict = "REJECTED";
            reason = "NO_IMPROVEMENT_OVER_BASELINE";
        } else if (rmse > Math.max(3 * noiseFloorEu, 0.1 * rmseB)) {
            verdict = "CANDIDATE";
            reason = "FREE_RUN_ERROR_ABOVE_NOISE";
        } else if (Math.abs(bias) > Math.max(noiseFloorEu, 0.02 * rmseB)) {
            verdict = "CANDIDATE";
            reason = "RESIDUAL_BIAS";
        } else {
            verdict = "VALIDATED";
            reason = white ? "" : "RESIDUALS_NOT_WHITE";
        }
        return new Report(verdict,
                Quantity.of("validation_rmse", rmse, "PV_EU", METHOD),
                Quantity.of("prediction_rmse", rmseP, "PV_EU", "ONE_STEP_INNOVATION_CARRY"),
                Double.isNaN(improvement)
                        ? Quantity.unavailable("fit_improvement", "fraction", "DEGENERATE_OR_UNSPECIFIED_BASELINE")
                        : Quantity.of("fit_improvement", improvement, "fraction", BASELINE),
                Quantity.of("residual_bias", bias, "PV_EU", METHOD), res, acf, white, p, corr, aicc, reason);
    }

    private static Report unavailable(String reason) {
        return new Report("CANDIDATE",
                Quantity.unavailable("validation_rmse", "PV_EU", "NO_INDEPENDENT_VALIDATION"),
                Quantity.unavailable("prediction_rmse", "PV_EU", "PREDICTOR_UNAVAILABLE"),
                Quantity.unavailable("fit_improvement", "fraction", "DEGENERATE_OR_UNSPECIFIED_BASELINE"),
                Quantity.unavailable("residual_bias", "PV_EU", "NO_RESIDUAL_SUPPORT"),
                new double[0], new double[0], false, Double.NaN, Double.NaN, Double.NaN, reason);
    }

    static double[] acf(double[] x, int lags) {
        int n = x.length;
        double mean = 0;
        for (double v : x) mean += v / n;
        double var = 0;
        for (double v : x) var += (v - mean) * (v - mean);
        double[] a = new double[lags + 1];
        a[0] = 1;
        for (int lag = 1; lag <= lags; lag++) {
            double s = 0;
            for (int i = lag; i < n; i++) s += (x[i] - mean) * (x[i - lag] - mean);
            a[lag] = var > 0 ? s / var : 0;
        }
        return a;
    }

    /** corr(res_t, u_{t-lag}) for lag >= 1. */
    static double crossCorr(double[] res, double[] u, int lag) {
        int n = res.length;
        if (n - lag < 3) return 0;
        double mr = 0, mu = 0;
        for (int i = lag; i < n; i++) {
            mr += res[i];
            mu += u[i - lag];
        }
        mr /= (n - lag);
        mu /= (n - lag);
        double sru = 0, srr = 0, suu = 0;
        for (int i = lag; i < n; i++) {
            sru += (res[i] - mr) * (u[i - lag] - mu);
            srr += (res[i] - mr) * (res[i] - mr);
            suu += (u[i - lag] - mu) * (u[i - lag] - mu);
        }
        return srr > 0 && suu > 0 ? sru / Math.sqrt(srr * suu) : 0;
    }
}
