package com.ams.flink.cplm.response;

/**
 * CHG-204 (spec item 3): the PV-side tolerances of the System Response engine in the loop's own units. The job
 * defaults are calibrated on a 0-100 span, so a loop that declares its PV range scales them by k = span / 100 (a
 * 0-100 loop keeps today's values; a loop without a usable declared range keeps them too). Output-side thresholds
 * are not here: the applied input is already in %, so the input-step floor stays as configured. A value a governing
 * bundle set ({@link ResponseJobConfig#bundleEuKeys}) is already in the loop's units and is returned unscaled. The
 * settle band also widens to the loop's normal noise band before the step when that is wider (the spec's "or
 * within its normal noise band, if that is wider"), declared range or not. The noise is a robust sigma of the
 * pre-step PV ({@link #preStepNoiseSigma}), measured once per event, and its band is 4 sigma wide; a NaN sigma
 * (too few pre-step samples) contributes nothing.
 */
public final class ResponseScale {
    /** The bundle properties that are PV / gain quantities in the loop's own units. */
    public static final String STEP_MIN_INPUT_EU = "G12.step_min_input_eu";
    public static final String SETTLING_ABS_BAND_PV_EU = "G12.settling_abs_band_pv_eu";
    public static final String GAIN_ABS_MAX = "G12.gain_abs_max";
    static final String[] BUNDLE_EU_KEYS = {STEP_MIN_INPUT_EU, SETTLING_ABS_BAND_PV_EU, GAIN_ABS_MAX};
    /** The span the job defaults are calibrated on (EU). */
    static final double REFERENCE_SPAN_EU = 100.0;
    /** The width of the loop's normal noise band in noise sigmas (+-2 sigma). */
    static final double NOISE_BAND_SIGMAS = 4.0;
    /** MAD of a normal variable / its sigma; the differences of white noise have sigma x sqrt(2). */
    private static final double MAD_PER_SIGMA = 0.6745;

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

    /**
     * The reference (SP) step floor before the noise term (EU): today's floor, scaled with the span when one is
     * declared, so it stays proportional to whatever the job arguments set. A floor the bundle set is in loop units.
     */
    public double refStepFloorEu() {
        double today = Math.max(cfg.stepMinInputEu, cfg.stepMinSpanFraction * cfg.fallbackSpanEu);
        if (!declared) return today;
        return bundleSet(STEP_MIN_INPUT_EU) ? Math.max(cfg.stepMinInputEu, cfg.stepMinSpanFraction * cfg.pvSpanEu) : today * k;
    }

    /** The slope a reference ramp must reach (EU/s). */
    public double rampMinSlopeEuPerS() { return cfg.rampMinSlopeEuPerS * k; }

    /**
     * The range a stable window may span (EU): the settled tail, the baseline and the endpoint. {@code noiseSigmaEu}
     * is the event's pre-step noise sigma ({@link com.ams.flink.cplm.response.event.ResponseEvent#preNoiseSigmaEu}).
     */
    public double stableBandEu(double noiseSigmaEu) {
        return withNoise(cfg.stableBandEu * k, cfg.settleNoiseMultiplier * NOISE_BAND_SIGMAS * noiseSigmaEu);
    }

    /** The noise floor of the settle band B_resp (EU), widened to half the pre-step noise band. */
    public double noiseFloorEu(double noiseSigmaEu) {
        return withNoise(cfg.noiseFloorEu * k, 0.5 * cfg.settleNoiseMultiplier * NOISE_BAND_SIGMAS * noiseSigmaEu);
    }

    public double absSettlingBandEu() { return bundleSet(SETTLING_ABS_BAND_PV_EU) ? cfg.absSettlingBandEu : cfg.absSettlingBandEu * k; }

    /** The smallest PV move for rise time, settling and overshoot (EU). */
    public double minResponseEu() { return cfg.minResponseEu * k; }

    public double targetBandEu() { return cfg.targetBandEu * k; }

    /** The process-gain bound for the estimator (PV EU per input %). */
    public double gainAbsMax() { return bundleSet(GAIN_ABS_MAX) ? cfg.gainAbsMax : cfg.gainAbsMax * k; }

    /**
     * A robust noise sigma of the valid y in [t0S - windowS, t0S): MAD(dy) / (0.6745 x sqrt 2) over the differences
     * of consecutive valid samples. White noise of sigma s gives s; a linear drift gives ~0 and a smooth transient far
     * less than its range, so neither is read as noise. NaN when there are fewer than 3 differences (noise unknown).
     */
    public static double preStepNoiseSigma(double[] t, double[] y, boolean[] valid, double t0S, double windowS) {
        double[] d = new double[t.length];
        int n = 0;
        double prev = Double.NaN;
        for (int i = 0; i < t.length; i++) {
            if (t[i] < t0S - windowS || t[i] >= t0S || !valid[i] || !Double.isFinite(y[i])) continue;
            if (!Double.isNaN(prev)) d[n++] = y[i] - prev;
            prev = y[i];
        }
        if (n < 3) return Double.NaN;
        double[] diffs = java.util.Arrays.copyOf(d, n);
        double med = median(diffs);
        for (int i = 0; i < n; i++) diffs[i] = Math.abs(diffs[i] - med);
        return median(diffs) / (MAD_PER_SIGMA * Math.sqrt(2.0));
    }

    /** The median; sorts {@code v} in place. */
    private static double median(double[] v) {
        java.util.Arrays.sort(v);
        int n = v.length;
        return n % 2 == 1 ? v[n / 2] : 0.5 * (v[n / 2 - 1] + v[n / 2]);
    }

    private boolean bundleSet(String key) {
        return cfg.bundleEuKeys != null && cfg.bundleEuKeys.contains(key);
    }

    private static double withNoise(double band, double noiseBand) {
        return Double.isNaN(noiseBand) ? band : Math.max(band, noiseBand);
    }
}
