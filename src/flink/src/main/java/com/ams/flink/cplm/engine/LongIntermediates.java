package com.ams.flink.cplm.engine;

import java.io.Serializable;

/**
 * v2.5 (2C.1a): the exact intermediates of one long-diagnostics evaluation, retained by the
 * calculator for the evidence builders (spec §3.1: "exact accepted samples and every intermediate
 * the gate used - never a series re-derived from a summary"). Held on the result object as a
 * transient companion: it never enters the results topic JSON (toJson is unchanged) and lives
 * only as long as the operator invocation that turns it into artifacts.
 */
public final class LongIntermediates implements Serializable {
    private static final long serialVersionUID = 1L;

    /** Sample instants (ms) and the accepted signals in window order. */
    public long[] tsMs = new long[0];
    public double[] pv = new double[0], op = new double[0];
    /** null when the loop maps no VP. */
    public double[] vp;
    /** The shape signal the oscillation gates ran on (op, or pv for integrating loops), detrended and centred. */
    public double[] shapeCentered = new double[0];
    public double tsSec;

    public OscillationMath.AcfResult acf;
    public OscillationMath.FftResult fft;
    public ShapeMath.TriangularityResult triangularity;
    public ShapeMath.HorchResult horch;
    public ShapeMath.GeometryResult geometry;
    public LimitMath.SaturationStats saturation;
    public LimitMath.DeltaPvResult deltaPv;
    /** Per-sample |delta PV| spike flags (LimitMath.computeSpikeCount's criterion). */
    public boolean[] spikeMask = new boolean[0];
}
