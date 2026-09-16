package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.Array2DRowRealMatrix;
import org.apache.commons.math3.linear.RealMatrix;

/**
 * Continuous realisation (A, B, C) of a path model in deviation variables, and its exact ZOH
 * discretisation for one hold interval (spec §2.7): A_d = exp(A dt), B_d = int exp(A s) B ds,
 * both read off exp([[A,B],[0,0]] dt). Equal poles are ordinary here - no 1/(tau1-tau2) anywhere.
 */
public final class StateSpace {
    public final RealMatrix a, b, c;
    public final double theta;

    public static final class Discrete {
        public final RealMatrix ad, bd;

        Discrete(RealMatrix ad, RealMatrix bd) {
            this.ad = ad;
            this.bd = bd;
        }
    }

    private StateSpace(RealMatrix a, RealMatrix b, RealMatrix c, double theta) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.theta = theta;
    }

    public static StateSpace of(ProcessModel m) {
        double[][] a, b, c;
        switch (m.family) {
            case FOPDT:
                a = new double[][] {{-1.0 / m.tau}};
                b = new double[][] {{m.gain / m.tau}};
                c = new double[][] {{1.0}};
                break;
            case SOPDT: {
                double p = m.tau * m.tau2;
                a = new double[][] {{0, 1}, {-1.0 / p, -(m.tau + m.tau2) / p}};
                b = new double[][] {{0}, {m.gain / p}};
                c = new double[][] {{1, 0}};
                break;
            }
            case SO_UNDERDAMPED:
                a = new double[][] {{0, 1}, {-m.wn * m.wn, -2 * m.zeta * m.wn}};
                b = new double[][] {{0}, {m.gain * m.wn * m.wn}};
                c = new double[][] {{1, 0}};
                break;
            case IPDT:
                a = new double[][] {{0}};
                b = new double[][] {{m.gain}};
                c = new double[][] {{1}};
                break;
            case INTEGRATOR_LAG:
                a = new double[][] {{0, 1}, {0, -1.0 / m.tau}};
                b = new double[][] {{0}, {m.gain / m.tau}};
                c = new double[][] {{1, 0}};
                break;
            default:
                throw new IllegalArgumentException(m.family + " is not simulable");
        }
        return new StateSpace(new Array2DRowRealMatrix(a), new Array2DRowRealMatrix(b), new Array2DRowRealMatrix(c), m.theta);
    }

    public int order() { return a.getRowDimension(); }

    public Discrete discretize(double dt) {
        int n = order();
        RealMatrix aug = new Array2DRowRealMatrix(n + 1, n + 1);
        aug.setSubMatrix(a.scalarMultiply(dt).getData(), 0, 0);
        aug.setSubMatrix(b.scalarMultiply(dt).getData(), 0, n);
        RealMatrix e = MatrixExp.expm(aug);
        return new Discrete(e.getSubMatrix(0, n - 1, 0, n - 1), e.getSubMatrix(0, n - 1, n, n));
    }
}
