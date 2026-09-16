package com.ams.flink.cplm.response.simulation;

import org.apache.commons.math3.linear.LUDecomposition;
import org.apache.commons.math3.linear.MatrixUtils;
import org.apache.commons.math3.linear.RealMatrix;

/** Padé(6) scaling-and-squaring matrix exponential (commons-math3 3.6.1 has none). Deterministic. */
public final class MatrixExp {
    private static final int Q = 6;
    private static final double[] C = new double[Q + 1];

    static {
        C[0] = 1.0;
        for (int k = 1; k <= Q; k++) C[k] = C[k - 1] * (Q - k + 1) / (double) (k * (2 * Q - k + 1));
    }

    private MatrixExp() {}

    public static RealMatrix expm(RealMatrix a) {
        int n = a.getRowDimension();
        double norm = a.getNorm();                        // maximum absolute row sum
        int s = norm > 0.5 ? Math.max(0, (int) Math.ceil(Math.log(norm / 0.5) / Math.log(2))) : 0;
        RealMatrix as = a.scalarMultiply(1.0 / Math.pow(2, s));
        RealMatrix id = MatrixUtils.createRealIdentityMatrix(n);
        RealMatrix x = as;
        RealMatrix num = id.add(as.scalarMultiply(C[1]));
        RealMatrix den = id.subtract(as.scalarMultiply(C[1]));
        for (int k = 2; k <= Q; k++) {
            x = x.multiply(as);
            num = num.add(x.scalarMultiply(C[k]));
            den = den.add(x.scalarMultiply((k % 2 == 0 ? 1 : -1) * C[k]));
        }
        RealMatrix e = new LUDecomposition(den).getSolver().solve(num);
        for (int i = 0; i < s; i++) e = e.multiply(e);
        return e;
    }
}
