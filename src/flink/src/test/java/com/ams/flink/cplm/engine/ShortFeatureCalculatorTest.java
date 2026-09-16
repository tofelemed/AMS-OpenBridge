package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

/**
 * v2.5 Task 1D.2 (spec v6 R06 / NR-018): G2 and G4 must not depend on the loop's units.
 *
 * <ul>
 * <li>G2's stability band is an approved policy in PV engineering units or as a fraction of
 * the declared PV span - never a universal 1 EU. With no commissioned band the 1 % of span
 * default is used and the record says so (LEGACY_DEFAULT on an undeclared span).</li>
 * <li>G4 publishes a dimensionless activity ratio ((sigma_u / span_u) / (sigma_pv / span_pv))
 * when the PV span is declared, and its thresholds come from the profile.</li>
 * </ul>
 * The SYN-TIC-001 golden declares no ranges, so its numbers are untouched (0-100 default span
 * x 1 % = the historical 1.0 EU band).
 */
public class ShortFeatureCalculatorTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final int N = 120;                       // 10 minutes at 5 s
    private static final long WINDOW_MS = N * 5_000L;

    /** PV around 200 +/- 3 with SP drifting 2 EU over the window, OP around 40 +/- 5; all scaled by {@code k}. */
    private static List<CplmNormalizedSample> window(double k) {
        List<CplmNormalizedSample> out = new ArrayList<>();
        for (int i = 0; i < N; i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "TIC_UNITS";
            s.eventTsMs = T0 + i * 5_000L;
            s.pv = k * (200 + 3 * Math.sin(i / 6.0));
            s.sp = k * (200 + 2.0 * i / (N - 1));           // 2 EU range (x k)
            s.op = 40 + 5 * Math.sin(i / 6.0);                // pp, never scaled
            s.mode = "AUT";
            s.quality = "GOOD";
            out.add(s);
        }
        return out;
    }

    private static CplmLoopDynamicsProfile tic(double pvMin, double pvMax) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("TIC_UNITS", "TIC", null).copy();
        p.pvEngMin = pvMin;
        p.pvEngMax = pvMax;
        p.pvRangeDeclared = true;
        return p;
    }

    private static CplmShortFeatureResult run(List<CplmNormalizedSample> w, CplmLoopDynamicsProfile p) {
        return ShortFeatureCalculator.computeShortFeatures(w, T0, T0 + WINDOW_MS, "10m", p);
    }

    @Test
    public void g2G3G4AreInvariantUnderAUnitChangeWhenSpansAreDeclared() {
        CplmShortFeatureResult celsius = run(window(1.0), tic(0, 400));
        CplmShortFeatureResult scaled = run(window(10.0), tic(0, 4000));   // same loop, 10x units

        assertEquals(celsius.gate2Status, scaled.gate2Status);
        assertEquals(celsius.gate3Status, scaled.gate3Status);
        assertEquals(celsius.gate4Status, scaled.gate4Status);
        assertEquals(celsius.gate2BandEu * 10.0, scaled.gate2BandEu, 1e-9);   // band scales with the span
        assertNotNull(celsius.activityRatioNorm);
        assertNotNull(scaled.activityRatioNorm);
        assertEquals(celsius.activityRatioNorm, scaled.activityRatioNorm, 1e-9);
        assertEquals("NORMALIZED_DECLARED_SPAN", celsius.activityBasis);
        assertEquals("COMMISSIONED_SPAN_FRACTION", celsius.gate2BandSource);
        // the legacy unit-dependent ratio is still published, and it is NOT invariant
        assertEquals(celsius.effortRatio, scaled.effortRatio * 10.0, 1e-9);
    }

    @Test
    public void undeclaredSpanFallsBackToTheLegacyBandAndSaysSo() {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("FIC_UNITS", "FIC", null);   // 0-100 default span, undeclared
        CplmShortFeatureResult r = run(window(1.0), p);
        assertEquals("LEGACY_DEFAULT", r.gate2BandSource);
        assertEquals(1.0, r.gate2BandEu, 1e-12);                       // 1 % x default 100 = the historical 1.0 EU
        assertNull(r.activityRatioNorm);                                // no declared PV span: not invented
        assertEquals("OBSERVED_RATIO_LEGACY", r.activityBasis);
        assertEquals("NO_PV_SPAN", r.activityReason);
        assertEquals(3.0, r.gate4WarnRatio, 1e-12);                    // the effective thresholds are published
        assertEquals(8.0, r.gate4HighRatio, 1e-12);
    }

    @Test
    public void commissionedEuBandTakesPrecedenceOverTheSpanFraction() {
        CplmLoopDynamicsProfile p = tic(0, 400);
        p.spStabilityBandPvEu = 0.5;                                   // approved objective in EU
        CplmShortFeatureResult r = run(window(1.0), p);
        assertEquals("COMMISSIONED_EU", r.gate2BandSource);
        assertEquals(0.5, r.gate2BandEu, 1e-12);
        assertEquals("WARN", r.gate2Status);                           // SP range 2 EU exceeds 0.5
        assertEquals("PASS", run(window(1.0), tic(0, 400)).gate2Status);   // 1 % of 400 = 4 EU band: 2 EU passes
    }

    @Test
    public void g4ThresholdsComeFromTheProfileNotTheCode() {
        // +/-5 pp of OP against +/-3 EU of PV on a 400 EU span is a normalised activity of
        // about 6.7: the same data reads WARN, PASS or STRONG purely by the commissioned thresholds.
        CplmLoopDynamicsProfile p = tic(0, 400);
        CplmShortFeatureResult base = run(window(1.0), p);
        assertNotNull(base.activityRatioNorm);
        assertEquals(base.activityRatioNorm > 8.0 ? "STRONG" : base.activityRatioNorm > 3.0 ? "WARN" : "PASS", base.gate4Status);

        p.g4ActivityWarnRatio = 100.0;
        p.g4ActivityHighRatio = 200.0;
        assertEquals("PASS", run(window(1.0), p).gate4Status);

        p.g4ActivityWarnRatio = 0.01;
        p.g4ActivityHighRatio = 0.02;
        CplmShortFeatureResult tight = run(window(1.0), p);
        assertEquals("STRONG", tight.gate4Status);
        assertEquals(0.02, tight.gate4HighRatio, 1e-12);
    }

    @Test
    public void averagingServiceKeepsItsWiderBandAsASpanFraction() {
        CplmLoopDynamicsProfile lic = CplmLoopDynamicsProfile.resolve("LIC_UNITS", "LIC", null);
        assertEquals(0.05, lic.spStabilityBandSpanFraction, 1e-12);   // was spRangePassMax = 5.0 on a 0-100 span
        assertEquals(5.0, lic.spStabilityBandEu(), 1e-12);
    }
}
