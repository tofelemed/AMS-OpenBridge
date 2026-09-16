package com.ams.flink.cplm.response.estimation;

import java.io.Serializable;

/** Bounds, grids and tolerances of the fitters (spec §2.7: all declared, versioned with the method). */
public final class EstimatorSettings implements Serializable {
    private static final long serialVersionUID = 1L;
    public double gainAbsMax = 1e3, tauMinS = 0.5, tauMaxS = 7200, thetaMinS = 0, thetaMaxS = 600, delayGridS = 5;
    public double wnMinRadS = 1e-4, wnMaxRadS = 10, zetaMin = 0.02, zetaMax = 0.98;
    public int maxIterations = 200, maxEvaluations = 4000;
    public double relTol = 1e-9, flatTolerance = 0.05, maxBridgeS = 60, minInputEu = 0.5, minInputEnergy = 1.0;
    public double boundsHitFraction = 0.01, illConditioned = 1e6, ambiguityTolerance = 0.05;
    public boolean includeBothSigns = true;
    /** Optional per-sample weights (length = samples of the dataset); null = uniform. */
    public double[] weights;
    public long seed = 1;
}
