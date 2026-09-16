package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;

import java.io.Serializable;
import java.util.List;

/**
 * v2.5 (2C.1c): the exact intermediates of one short-feature evaluation (G0-G4, G2r), retained by
 * the calculator for the evidence builders exactly as {@link LongIntermediates} does for the long
 * tier - a transient companion of the result that never enters the results topic JSON.
 */
public final class ShortIntermediates implements Serializable {
    private static final long serialVersionUID = 1L;

    /** The accepted samples of the window in order (roles, quality, hold flags, arrival time). */
    public List<CplmNormalizedSample> samples;
    public CplmLoopDynamicsProfile profile;
    public double tsSec;
    public long windowStartMs, windowEndMs;
    /** Per sample: pv, sp, op (normalised to pp when a range is declared), error, |delta u|. */
    public double[] pv = new double[0], sp = new double[0], op = new double[0], err = new double[0], deltaU = new double[0];
    /** Per sample: cumulative integrals over held intervals (the same quadrature the scalars use). */
    public double[] cumIae = new double[0], cumIse = new double[0], cumItae = new double[0];
    public double goodErrorBand;
    public boolean[] goodErrorMask = new boolean[0];
    /** G2r: inside the declared operating region (pv AND op). */
    public boolean[] domainMask = new boolean[0];
    /** G4: OP direction reversal at this sample (SignalMath.computeReversalCount's criterion). */
    public boolean[] reversalMask = new boolean[0];
    /** G1: auto authority at this sample. */
    public boolean[] autoMask = new boolean[0];
    /** G2: SP rate of change (EU/s) between consecutive samples. */
    public double[] dSpDt = new double[0];
    public double spStabilityBandEu;
    public String spStabilityBandSource = "";
    public LimitMath.SaturationStats saturation;
    public double sigmaUNorm, sigmaPvNorm, commandTotalVariation;
}
