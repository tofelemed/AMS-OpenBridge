package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.EstimationResult;
import com.ams.flink.cplm.response.estimation.EstimatorSettings;
import com.ams.flink.cplm.response.estimation.ModelEstimator;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.apache.commons.math3.distribution.ChiSquaredDistribution;
import org.apache.commons.math3.distribution.NormalDistribution;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

/** Parameter intervals by a NAMED method with its assumptions recorded (spec §2.8). */
public final class UncertaintyEstimator {
    public static final class Interval {
        public final String parameter, method;
        public final double lo, hi, level;
        public final int repetitions;
        public final long seed;

        Interval(String parameter, String method, double lo, double hi, double level, int repetitions, long seed) {
            this.parameter = parameter;
            this.method = method;
            this.lo = lo;
            this.hi = hi;
            this.level = level;
            this.repetitions = repetitions;
            this.seed = seed;
        }
    }

    private UncertaintyEstimator() {}

    /** Under the local-linear Gaussian assumption of the LM covariance. */
    public static Interval covariance(String parameter, double value, double stdErr, double level) {
        double z = new NormalDistribution().inverseCumulativeProbability(0.5 + level / 2);
        return new Interval(parameter, "COVARIANCE", value - z * stdErr, value + z * stdErr, level, 0, 0);
    }

    /** The delays whose objective stays within the chi-square band of the minimum: J <= Jmin (1 + chi2_1(level)/N). */
    public static Interval profileLikelihood(double[] delayProfileS, double[] delayObjective, int samples, double level) {
        double jmin = Double.POSITIVE_INFINITY;
        for (double j : delayObjective) if (!Double.isNaN(j)) jmin = Math.min(jmin, j);
        double crit = new ChiSquaredDistribution(1).inverseCumulativeProbability(level);
        double bound = jmin * (1 + crit / Math.max(1, samples));
        double lo = Double.POSITIVE_INFINITY, hi = Double.NEGATIVE_INFINITY;
        for (int k = 0; k < delayProfileS.length; k++) {
            if (!Double.isNaN(delayObjective[k]) && delayObjective[k] <= bound) {
                lo = Math.min(lo, delayProfileS[k]);
                hi = Math.max(hi, delayProfileS[k]);
            }
        }
        return new Interval("dead_time", "PROFILE_LIKELIHOOD", lo, hi, level, 0, 0);
    }

    /** Block bootstrap of the residuals (blocks preserve temporal structure); blockSamples = 1 is the i.i.d. variant. */
    public static List<Interval> blockBootstrap(ModelEstimator est, EventDataset d, double u0, ModelFamily family, EstimatorSettings s,
                                                int repetitions, int blockSamples, long seed, double level) {
        EstimationResult base = est.estimate(d, u0, family, s);
        if (base.best() == null) return Collections.emptyList();
        EstimationResult.Candidate c = base.best();
        ZohSimulator.Result fit = ZohSimulator.simulate(c.model, d.t, d.u, u0, c.y0, c.v0, d.t0, s.maxBridgeS);
        int n = d.size();
        double[] res = new double[n];
        for (int i = 0; i < n; i++) res[i] = d.valid[i] && fit.valid[i] ? d.y[i] - fit.yHat[i] : 0;
        Random rnd = new Random(seed);
        Map<String, List<Double>> draws = new TreeMap<>();
        for (int rep = 0; rep < repetitions; rep++) {
            double[] y = new double[n];
            int i = 0;
            while (i < n) {
                int start = rnd.nextInt(n);
                for (int b = 0; b < blockSamples && i < n; b++, i++) y[i] = fit.yHat[i] + res[(start + b) % n];
            }
            EstimationResult r = est.estimate(new EventDataset(d.t, y, d.r, d.u, d.valid, d.t0, d.tEnd), u0, family, s);
            if (r.best() == null) continue;
            for (Map.Entry<String, Quantity> e : r.best().model.parameters().entrySet()) {
                if (!e.getValue().available()) continue;
                draws.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue().value);
            }
        }
        List<Interval> out = new ArrayList<>();
        for (Map.Entry<String, List<Double>> e : draws.entrySet()) {
            List<Double> v = e.getValue();
            Collections.sort(v);
            int lo = (int) Math.floor((1 - level) / 2 * (v.size() - 1)), hi = (int) Math.ceil((1 + level) / 2 * (v.size() - 1));
            out.add(new Interval(e.getKey(), blockSamples > 1 ? "BLOCK_BOOTSTRAP" : "IID_BOOTSTRAP",
                    v.get(Math.max(0, lo)), v.get(Math.min(v.size() - 1, hi)), level, v.size(), seed));
        }
        return out;
    }
}
