package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1D.3 (spec v6 R08; NR-024, NR-025).
 *
 * <ul>
 * <li>G10 judges limits against the DECLARED output range (an 80 % maximum is a limit), in
 * seconds of dwell, and publishes the limit episodes and where the limits came from.</li>
 * <li>G11 keeps every flatness episode at or beyond the dwell as evidence: a one-hour freeze
 * inside a 24 h window is reported (WARN, FREEZE_EPISODE) instead of vanishing under the old
 * "10 % of the window" rule - while the fusion block still requires a MATERIAL freeze, so a
 * compressed-historian hold cannot exclude a whole day (the P1-1 regression stays fixed).</li>
 * </ul>
 */
public class LimitEpisodesTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final long GRID = 5_000L;

    private static CplmNormalizedSample sample(long ts, double pv, double sp, double op) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = "LIM_LOOP";
        s.eventTsMs = ts;
        s.pv = pv;
        s.sp = sp;
        s.op = op;
        s.mode = "AUT";
        s.quality = "GOOD";
        return s;
    }

    /** 10 minutes at 5 s: OP sits at {@code opCap} for the first {@code capFraction}, then oscillates around 40. */
    private static List<CplmNormalizedSample> cappedWindow(double opCap, double capFraction) {
        int n = 120;
        List<CplmNormalizedSample> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double op = i < n * capFraction ? opCap : 40 + 5 * Math.sin(i / 6.0);
            out.add(sample(T0 + i * GRID, 50 + 2 * Math.sin(i / 6.0), 50, op));
        }
        return out;
    }

    private static CplmLoopDynamicsProfile fic() {
        return CplmLoopDynamicsProfile.resolve("LIM_LOOP", "FIC", null).copy();
    }

    @Test
    public void declaredOutputMaximumIsALimitButTheFallbackNeverSeesIt() {
        // NR-024: the valve's command is capped at 80 %; the loop declares OP 0-80.
        CplmLoopDynamicsProfile declared = fic();
        declared.opEngMin = 0;
        declared.opEngMax = 80;
        declared.opRangeDeclared = true;
        CplmLongDiagnosticsResult r = LongDiagnosticsCalculator.computeLongDiagnostics(
                cappedWindow(80, 0.7), T0, T0 + 120 * GRID, "4h", declared);
        assertEquals("DECLARED_RANGE", r.limitSource);
        assertEquals("WARN", r.gate10Status);
        assertEquals(0.7, r.saturationPct, 0.02);
        assertEquals(1, r.dwellEvents.size());
        assertEquals("HIGH", r.dwellEvents.get(0).side);
        assertEquals(84 * GRID / 1000.0, r.dwellEvents.get(0).durationS, 5.0);
        assertEquals(r.satLimitDwellS, r.dwellEvents.get(0).durationS, 1e-9);

        CplmLongDiagnosticsResult fallback = LongDiagnosticsCalculator.computeLongDiagnostics(
                cappedWindow(80, 0.7), T0, T0 + 120 * GRID, "4h", fic());      // undeclared: 0-100 assumed
        assertEquals("FALLBACK_0_100", fallback.limitSource);
        assertEquals("PASS", fallback.gate10Status);                           // 80 < 95: invisible, and it says so
        assertTrue(fallback.dwellEvents.isEmpty());
    }

    @Test
    public void limitDwellIsJudgedInSecondsWhenCommissioned() {
        CplmLoopDynamicsProfile p = fic();
        p.opEngMin = 0; p.opEngMax = 80; p.opRangeDeclared = true;
        List<CplmNormalizedSample> w = cappedWindow(80, 0.1);                   // 12 samples = 60 s at the limit
        CplmLongDiagnosticsResult legacy = LongDiagnosticsCalculator.computeLongDiagnostics(w, T0, T0 + 120 * GRID, "4h", p);
        assertEquals(60.0, legacy.satLimitDwellS, 1e-9);
        assertEquals(30 * 5.0, legacy.limitDwellWarnS, 1e-9);                 // unset -> the old 30 samples, expressed in seconds
        assertEquals("WARN", legacy.gate10Status);                             // 10 % occupancy >= satWarnOccupancy 0.05

        p.satWarnOccupancy = 0.5;                                             // isolate the dwell rule
        p.limitDwellWarnS = 50;                                                // commissioned: 50 s
        CplmLongDiagnosticsResult r = LongDiagnosticsCalculator.computeLongDiagnostics(w, T0, T0 + 120 * GRID, "4h", p);
        assertEquals(50.0, r.limitDwellWarnS, 1e-9);
        assertEquals("WARN", r.gate10Status);
        p.limitDwellWarnS = 90;
        assertEquals("PASS", LongDiagnosticsCalculator.computeLongDiagnostics(w, T0, T0 + 120 * GRID, "4h", p).gate10Status);
    }

    @Test
    public void oneHourFreezeInsideTwentyFourHoursStaysVisibleWithoutExcludingTheDay() {
        // NR-025: 24 h at 5 s = 17 280 samples; PV flat for exactly one hour (720 samples) in the middle.
        int n = 17_280;
        List<CplmNormalizedSample> w = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            boolean frozen = i >= 8_000 && i < 8_720;
            double pv = frozen ? 50.0 : 50 + 2 * Math.sin(i / 60.0) + 0.01 * ((i * 7919) % 13);
            w.add(sample(T0 + i * GRID, pv, 50, 40 + 5 * Math.sin(i / 60.0)));
        }
        CplmLoopDynamicsProfile p = fic();
        CplmLongDiagnosticsResult r = LongDiagnosticsCalculator.computeLongDiagnostics(w, T0, T0 + n * GRID, "24h", p);
        assertEquals(1, r.freezeEvents.size());
        assertEquals(3_600.0, r.freezeEvents.get(0).durationS, 10.0);
        assertEquals(T0 + 8_000 * GRID, r.freezeEvents.get(0).startMs, GRID);
        assertEquals("WARN", r.gate11Status);                                  // visible
        assertEquals("FREEZE_EPISODE", r.gate11Reason);
        assertFalse("1 h of 24 h is not material", r.freezeMaterial);
        assertEquals(60.0, r.freezeDwellS, 1e-9);

        // fusion: an episode is evidence, not an exclusion - the day is still diagnosed
        CplmShortFeatureResult shortF = ShortFeatureCalculator.computeShortFeatures(w.subList(0, 720), T0, T0 + 720 * GRID, "60m", p);
        CplmGateResult fused = CplmGateFusionEngine.fuse(shortF, r);
        assertNotEquals("EXCLUDED_SENSOR", fused.diagnosis);
    }

    @Test
    public void aMaterialFreezeStillExcludesTheWindow() {
        int n = 2_000;
        List<CplmNormalizedSample> w = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            boolean frozen = i >= 500 && i < 1_800;                            // 65 % of the window
            double pv = frozen ? 50.0 : 50 + 2 * Math.sin(i / 20.0) + 0.01 * ((i * 7919) % 13);
            w.add(sample(T0 + i * GRID, pv, 50, 40 + 5 * Math.sin(i / 20.0)));
        }
        CplmLoopDynamicsProfile p = fic();
        CplmLongDiagnosticsResult r = LongDiagnosticsCalculator.computeLongDiagnostics(w, T0, T0 + n * GRID, "4h", p);
        assertTrue(r.freezeMaterial);
        assertEquals("MATERIAL_FREEZE", r.gate11Reason);
        CplmShortFeatureResult shortF = ShortFeatureCalculator.computeShortFeatures(w.subList(0, 720), T0, T0 + 720 * GRID, "60m", p);
        assertEquals("EXCLUDED_SENSOR", CplmGateFusionEngine.fuse(shortF, r).diagnosis);
    }
}
