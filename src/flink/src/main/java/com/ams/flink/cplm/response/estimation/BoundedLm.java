package com.ams.flink.cplm.response.estimation;

import org.apache.commons.math3.analysis.MultivariateMatrixFunction;
import org.apache.commons.math3.analysis.MultivariateVectorFunction;
import org.apache.commons.math3.fitting.leastsquares.LeastSquaresBuilder;
import org.apache.commons.math3.fitting.leastsquares.LeastSquaresOptimizer;
import org.apache.commons.math3.fitting.leastsquares.LevenbergMarquardtOptimizer;
import org.apache.commons.math3.linear.RealMatrix;
import org.apache.commons.math3.linear.SingularValueDecomposition;

import java.util.Arrays;

/**
 * Levenberg–Marquardt over an unconstrained vector z mapped to bounded parameters
 * p = lo + (hi - lo) * sigmoid(z) (commons-math3's LM has no bounds). Central-difference Jacobian.
 * Reports the objective sum(r^2), parameter standard errors from the covariance at the optimum
 * (chain rule through the transform), the Jacobian condition number and whether a bound is hit.
 */
public final class BoundedLm {
    public interface Residuals {
        double[] at(double[] p);
    }

    public static final class Fit {
        public final double[] p, stdErr;
        public final double objective, conditionNumber;
        public final boolean boundsHit, converged;

        Fit(double[] p, double[] stdErr, double objective, double conditionNumber, boolean boundsHit, boolean converged) {
            this.p = p;
            this.stdErr = stdErr;
            this.objective = objective;
            this.conditionNumber = conditionNumber;
            this.boundsHit = boundsHit;
            this.converged = converged;
        }
    }

    private BoundedLm() {}

    static double toZ(double p, double lo, double hi) {
        double f = Math.min(Math.max((p - lo) / (hi - lo), 1e-6), 1 - 1e-6);
        return Math.log(f / (1 - f));
    }

    static double toP(double z, double lo, double hi) {
        return lo + (hi - lo) / (1 + Math.exp(-z));
    }

    public static Fit fit(Residuals f, double[] p0, double[] lo, double[] hi, int maxIter, int maxEval, double boundsHitFraction, double illConditioned) {
        return fit(f, p0, lo, hi, maxIter, maxEval, boundsHitFraction, illConditioned, 0);
    }

    /** CHG-075: as above, with every residual evaluation (value and Jacobian columns) checked against deadlineNanos (0 = none). */
    public static Fit fit(Residuals f, double[] p0, double[] lo, double[] hi, int maxIter, int maxEval, double boundsHitFraction, double illConditioned,
                          long deadlineNanos) {
        int n = p0.length;
        double[] z0 = new double[n];
        for (int i = 0; i < n; i++) z0[i] = toZ(p0[i], lo[i], hi[i]);
        MultivariateVectorFunction value = z -> {
            FitBudgetExceeded.check(deadlineNanos);
            return f.at(unmap(z, lo, hi));
        };
        MultivariateMatrixFunction jac = z -> {
            double[] base = value.value(z);
            double[][] j = new double[base.length][n];
            for (int k = 0; k < n; k++) {
                double h = 1e-4 * Math.max(1, Math.abs(z[k]));
                double[] zp = z.clone(), zm = z.clone();
                zp[k] += h;
                zm[k] -= h;
                double[] rp = value.value(zp), rm = value.value(zm);
                for (int i = 0; i < base.length; i++) j[i][k] = (rp[i] - rm[i]) / (2 * h);
            }
            return j;
        };
        int m = f.at(p0).length;
        double[] target = new double[m];                       // residuals are already (y - yhat): target 0
        LeastSquaresOptimizer.Optimum opt;
        try {
            opt = new LevenbergMarquardtOptimizer().optimize(new LeastSquaresBuilder()
                    .start(z0).model(value, jac).target(target).lazyEvaluation(false)
                    .maxEvaluations(maxEval).maxIterations(maxIter).build());
        } catch (FitBudgetExceeded e) {
            throw e;                                           // CHG-075: the deadline is not "fit at p0"
        } catch (RuntimeException e) {
            double[] r = f.at(p0);
            double obj = 0;
            for (double v : r) obj += v * v;
            return new Fit(p0.clone(), nan(n), obj, Double.POSITIVE_INFINITY, false, false);
        }
        double[] z = opt.getPoint().toArray();
        double[] p = unmap(z, lo, hi);
        double[] r = f.at(p);
        double obj = 0;
        for (double v : r) obj += v * v;
        double[] se = nan(n);
        double cond = Double.POSITIVE_INFINITY;
        try {
            RealMatrix j = opt.getJacobian();
            SingularValueDecomposition svd = new SingularValueDecomposition(j);
            double[] sv = svd.getSingularValues();
            cond = sv[sv.length - 1] > 0 ? sv[0] / sv[sv.length - 1] : Double.POSITIVE_INFINITY;
            RealMatrix cov = opt.getCovariances(1e-14);
            double sigma2 = m > n ? obj / (m - n) : obj;
            for (int i = 0; i < n; i++) {
                double dpdz = (hi[i] - lo[i]) * sig(z[i]) * (1 - sig(z[i]));
                se[i] = Math.sqrt(Math.max(0, cov.getEntry(i, i) * sigma2)) * dpdz;
            }
        } catch (RuntimeException ignored) {
            // singular Jacobian: standard errors stay NaN, condition stays infinite
        }
        // A bound is "hit" when the estimate sits against an edge on BOTH yardsticks: within the
        // fraction of the range AND within that fraction of its own magnitude. A gain of 3 inside
        // [1e-9, 1000] is 0.3 % of the range from the floor but 1e9 times its own scale away from it.
        boolean hit = false;
        for (int i = 0; i < n; i++) {
            double range = hi[i] - lo[i];
            double scale = Math.max(Math.abs(p[i]), 1e-12);
            double toLo = p[i] - lo[i], toHi = hi[i] - p[i];
            if ((toLo < boundsHitFraction * range && toLo < 5 * boundsHitFraction * scale)
                    || (toHi < boundsHitFraction * range && toHi < 5 * boundsHitFraction * scale)) hit = true;
        }
        return new Fit(p, se, obj, cond, hit, cond < illConditioned);
    }

    private static double sig(double z) {
        return 1 / (1 + Math.exp(-z));
    }

    private static double[] unmap(double[] z, double[] lo, double[] hi) {
        double[] p = new double[z.length];
        for (int i = 0; i < z.length; i++) p[i] = toP(z[i], lo[i], hi[i]);
        return p;
    }

    private static double[] nan(int n) {
        double[] a = new double[n];
        Arrays.fill(a, Double.NaN);
        return a;
    }
}
