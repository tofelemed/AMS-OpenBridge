package com.ams.flink.cplm;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1B.2 (spec v6 R04 / NR-021): in the engine, UNKNOWN quality is not GOOD.
 *
 * The old rule ("anything starting with g, or an OPC numeric >= 192, or an ABSENT field is
 * good") let a producer that never sent quality — or sent an undecodable token — score
 * bad_quality_pct = 0 and pass G0. Now only the exact normalised verdict GOOD is good;
 * UNCERTAIN/BAD/UNKNOWN and anything unrecognised are not, and G0 reports how much of the
 * window was UNKNOWN separately from how much was BAD so the operator sees "no quality
 * information" rather than "sensor failed".
 */
public class CplmGateEngineQualityTest {

    private static List<CplmNormalizedSample> window(String quality, int n) {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "Q_LOOP";
            s.eventTsMs = 1_000L * i;
            s.pv = 50 + Math.sin(i / 7.0);
            s.sp = 50;
            s.op = 40 + Math.cos(i / 7.0);
            s.mode = "AUT";
            s.quality = quality;
            samples.add(s);
        }
        return samples;
    }

    @Test
    public void onlyTheExactGoodVerdictIsGood() {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.quality = "GOOD";      assertTrue(s.isGoodQuality());
        s.quality = "good";      assertTrue(s.isGoodQuality());
        s.quality = "UNCERTAIN"; assertFalse(s.isGoodQuality());
        s.quality = "BAD";       assertFalse(s.isGoodQuality());
        s.quality = "UNKNOWN";   assertFalse(s.isGoodQuality());
        s.quality = "goodish";   assertFalse(s.isGoodQuality());      // the old g-prefix rule
        s.quality = "Good_NonSpecific"; assertFalse(s.isGoodQuality()); // vendor vocab is decoded at ingestion, not here
        s.quality = "192";       assertFalse(s.isGoodQuality());      // a raw OPC word is not a verdict
        s.quality = null;        assertFalse(s.isGoodQuality());      // absent is UNKNOWN, not GOOD
        s.quality = "";          assertFalse(s.isGoodQuality());
    }

    @Test
    public void absentQualityFieldParsesAsUnknown() {
        CplmNormalizedSample s = CplmNormalizedSample.fromJson(
                "{\"loop_id\":\"Q\",\"event_ts_ms\":1,\"pv\":1,\"sp\":1,\"op\":1}");
        assertTrue(s.isValid);
        assertEquals("UNKNOWN", s.quality);
        assertFalse(s.isGoodQuality());
    }

    @Test
    public void allUnknownWindowFailsG0AndSaysWhy() {
        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(window("UNKNOWN", 60), 0, 60_000, "1m");
        assertEquals("FAIL", r.gate0Status);
        assertEquals(1.0, r.unknownQualityPct, 1e-12);
        assertEquals(1.0, r.badQualityPct, 1e-12);          // not-good share, as before (UNKNOWN counts)
        assertEquals("QUALITY_UNKNOWN", r.gate0Reason);
    }

    @Test
    public void allBadWindowFailsG0WithBadReason() {
        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(window("BAD", 60), 0, 60_000, "1m");
        assertEquals("FAIL", r.gate0Status);
        assertEquals(0.0, r.unknownQualityPct, 1e-12);
        assertEquals("BAD_QUALITY", r.gate0Reason);
    }

    @Test
    public void allGoodWindowPassesG0AsBefore() {
        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(window("GOOD", 60), 0, 60_000, "1m");
        assertEquals("PASS", r.gate0Status);
        assertEquals(0.0, r.unknownQualityPct, 1e-12);
        assertEquals("", r.gate0Reason);
    }

    @Test
    public void unknownShareRoundTripsThroughJson() {
        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(window("UNKNOWN", 60), 0, 60_000, "1m");
        CplmShortFeatureResult back = CplmShortFeatureResult.fromJson(r.toJson());
        assertEquals(1.0, back.unknownQualityPct, 1e-12);
        assertEquals("QUALITY_UNKNOWN", back.gate0Reason);
    }
}
