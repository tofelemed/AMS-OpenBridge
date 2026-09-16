package com.ams.flink.cplm;

import com.ams.flink.cplm.engine.LongDiagnosticsCalculator;
import com.ams.flink.cplm.engine.ShortFeatureCalculator;

import java.io.Serializable;
import java.util.List;

/**
 * CPLM gate calculation engine - Gates 0-15 per
 * CPLM_Flink_PID_Loop_Gate_Calculation_Reference_Manual (SYN_TIC_001 golden set).
 * Uses population standard deviation (ddof=0) for streaming KPIs.
 *
 * <p>v2.5 (Task 1D.1): this class is the stable entry point; the mathematics lives in
 * {@code com.ams.flink.cplm.engine} - {@link ShortFeatureCalculator} (G0-G4, G2r),
 * {@link LongDiagnosticsCalculator} (G5-G11), and the shared SignalMath / LimitMath /
 * OscillationMath / ShapeMath primitives. Nothing moved changed a formula.
 */
public final class CplmGateEngine implements Serializable {

    /** Historical fallback band, kept as the default when a loop declares no PV
     *  span (CplmLoopDynamicsProfile.goodErrorBand() applies it). */
    static final double GOOD_ERROR_BAND_DEFAULT = 0.5;

    private CplmGateEngine() {
    }

    public static CplmGateResult compute(List<CplmNormalizedSample> rawSamples, long windowStartMs, long windowEndMs) {
        return CplmGateFusionEngine.fuseFromSamples(rawSamples, windowStartMs, windowEndMs, "24h");
    }

    public static CplmGateResult compute(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            CplmLoopDynamicsProfile profile) {
        return CplmGateFusionEngine.fuseFromSamples(rawSamples, windowStartMs, windowEndMs, "24h", false, false, profile);
    }

    /** Stage 1 - short-window features (Gates 0-4 + G2r). Used by CplmShortFeatureStreamJob. */
    public static CplmShortFeatureResult computeShortFeatures(
            List<CplmNormalizedSample> rawSamples, long windowStartMs, long windowEndMs, String windowKind) {
        return ShortFeatureCalculator.computeShortFeatures(rawSamples, windowStartMs, windowEndMs, windowKind, null);
    }

    public static CplmShortFeatureResult computeShortFeatures(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            CplmLoopDynamicsProfile profileOrNull) {
        return ShortFeatureCalculator.computeShortFeatures(rawSamples, windowStartMs, windowEndMs, windowKind, profileOrNull);
    }

    /** Stage 2 - long-window diagnostics (Gates 5-11). Used by CplmLongDiagnosticsStreamJob. */
    public static CplmLongDiagnosticsResult computeLongDiagnostics(
            List<CplmNormalizedSample> rawSamples, long windowStartMs, long windowEndMs, String windowKind) {
        return LongDiagnosticsCalculator.computeLongDiagnostics(rawSamples, windowStartMs, windowEndMs, windowKind, null);
    }

    public static CplmLongDiagnosticsResult computeLongDiagnostics(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            CplmLoopDynamicsProfile profileOrNull) {
        return LongDiagnosticsCalculator.computeLongDiagnostics(rawSamples, windowStartMs, windowEndMs, windowKind, profileOrNull);
    }
}
