package com.ams.flink.cplm.response.simulation;

import org.apache.commons.math3.linear.Array2DRowRealMatrix;
import org.apache.commons.math3.linear.RealMatrix;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class MatrixExpTest {
    @Test
    public void scalarExponentialMatchesMathExp() {
        RealMatrix e = MatrixExp.expm(new Array2DRowRealMatrix(new double[][] {{-0.05 * 7.0}}));
        assertEquals(Math.exp(-0.35), e.getEntry(0, 0), 1e-12);
    }

    @Test
    public void nilpotentBlockGivesExactPolynomial() {
        // exp([[0,1],[0,0]] * dt) = [[1, dt],[0, 1]] exactly
        RealMatrix e = MatrixExp.expm(new Array2DRowRealMatrix(new double[][] {{0, 3.0}, {0, 0}}));
        assertEquals(1.0, e.getEntry(0, 0), 1e-14);
        assertEquals(3.0, e.getEntry(0, 1), 1e-12);
        assertEquals(0.0, e.getEntry(1, 0), 1e-14);
        assertEquals(1.0, e.getEntry(1, 1), 1e-14);
    }

    @Test
    public void largeNormIsHandledByScalingAndSquaring() {
        RealMatrix e = MatrixExp.expm(new Array2DRowRealMatrix(new double[][] {{-40.0}}));
        assertEquals(Math.exp(-40.0), e.getEntry(0, 0), 1e-22);
    }
}
