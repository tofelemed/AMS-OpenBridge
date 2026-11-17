package com.ams.flink.cplm.response;

/**
 * CHG-204 (spec item 3): the PV-side tolerances of the System Response engine in the loop's own units. The job
 * defaults are calibrated on a 0-100 span, so a loop that declares its PV range scales them by k = span / 100 (a
 * 0-100 loop keeps today's values; a loop without a usable declared range keeps them too). Output-side thresholds
 * are not here: the applied input is already in %, so the input-step floor stays as configured. A value a governing
 * bundle set ({@link ResponseJobConfig#bundleEuKeys}) is already in the loop's units and is returned unscaled. The
 * settle band also widens to the loop's normal noise band before the step when that is wider (the spec's "or
 * within its normal noise band, if that is wider"), declared range or not; a NaN pre-step range contributes nothing.
 */
public final class ResponseScale {
    /** The bundle properties that are PV / gain quantities in the loop's own units. */
    public static final String STEP_MIN_INPUT_EU = "G12.step_min_input_eu";
    public static final String SETTLING_ABS_BAND_PV_EU = "G12.settling_abs_band_pv_eu";
    public static final String GAIN_ABS_MAX = "G12.gain_abs_max";
    static final String[] BUNDLE_EU_KEYS = {STEP_MIN_INPUT_EU, SETTLING_ABS_BAND_PV_EU, GAIN_ABS_MAX};
    /** The span the job defaults are calibrated on (EU). */
    static final double REFERENCE_SPAN_EU = 100.0;

    private final ResponseJobConfig cfg;
    private final boolean declared;
    private final double k;

    private ResponseScale(ResponseJobConfig cfg) {
        this.cfg = cfg;
        this.declared = Double.isFinite(cfg.pvSpanEu) && cfg.pvSpanEu > 0;
        this.k = declared ? cfg.pvSpanEu / REFERENCE_SPAN_EU : 1.0;
    }

    public static ResponseScale of(ResponseJobConfig cfg) {
        return new ResponseScale(cfg);
    }

    /** span / 100 when the loop declares a usable PV range, else 1. */
    public double k() { return k; }

    /** True when the loop declared a usable PV range (finite, positive span). */
    public boolean spanDeclared() { return declared; }

    /** The reference (SP) step floor before the noise term (EU). */
    public double refStepFloorEu() {
        if (!declared) return Math.max(cfg.stepMinInputEu, cfg.stepMinSpanFraction * cfg.fallbackSpanEu);
        double fromSpan = cfg.stepMinSpanFraction * cfg.pvSpanEu;
        return bundleSet(STEP_MIN_INPUT_EU) ? Math.max(cfg.stepMinInputEu, fromSpan) : fromSpan;
    }

    /** The slope a reference ramp must reach (EU/s). */
    public double rampMinSlopeEuPerS() { return cfg.rampMinSlopeEuPerS * k; }

    /** The range the PV tail may span over the tail dwell to count as settled (EU); {@code preRangeEu} = the pre-step PV range. */
    public double stableBandEu(double preRangeEu) {
        return withNoise(cfg.stableBandEu * k, cfg.settleNoiseMultiplier * preRangeEu);
    }

    /** The noise floor of the settle band B_resp (EU), widened to half the pre-step noise band. */
    public double noiseFloorEu(double preRangeEu) {
        return withNoise(cfg.noiseFloorEu * k, 0.5 * cfg.settleNoiseMultiplier * preRangeEu);
    }

    public double absSettlingBandEu() { return bundleSet(SETTLING_ABS_BAND_PV_EU) ? cfg.absSettlingBandEu : cfg.absSettlingBandEu * k; }

    /** The smallest PV move for rise time, settling and overshoot (EU). */
    public double minResponseEu() { return cfg.minResponseEu * k; }

    public double targetBandEu() { return cfg.targetBandEu * k; }

    /** The process-gain bound for the estimator (PV EU per input %). */
    public double gainAbsMax() { return bundleSet(GAIN_ABS_MAX) ? cfg.gainAbsMax : cfg.gainAbsMax * k; }

    /** max - min of the valid y in [t0S - windowS, t0S); NaN when fewer than 3 valid samples (the noise is then unknown). */
    public static double preStepRange(double[] t, double[] y, boolean[] valid, double t0S, double windowS) {
        double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
        int n = 0;
        for (int i = 0; i < t.length; i++) {
            if (t[i] < t0S - windowS || t[i] >= t0S || !valid[i] || !Double.isFinite(y[i])) continue;
            min = Math.min(min, y[i]);
            max = Math.max(max, y[i]);
            n++;
        }
        return n < 3 ? Double.NaN : max - min;
    }

    private boolean bundleSet(String key) {
        return cfg.bundleEuKeys != null && cfg.bundleEuKeys.contains(key);
    }

    private static double withNoise(double band, double noiseBand) {
        return Double.isNaN(noiseBand) ? band : Math.max(band, noiseBand);
    }
}
