package com.ams.flink.cplm.condition;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmShortFeatureResult;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1D.5 (spec v6 R11): fusion consumes the fast-path conditions. An OPEN limit or
 * freeze condition observed since the last long slice is evidence the verdict must reflect
 * now - not at the next 12 h slice - but it is evidence, never an exclusion and never a
 * confirmation.
 */
public class FusionConditionsTest {
    private static final long T0 = 1_756_600_000_000L;

    private static CplmShortFeatureResult shortOk() {
        CplmShortFeatureResult s = new CplmShortFeatureResult();
        s.loopId = "COND_LOOP"; s.loopType = "FIC"; s.windowKind = "24h";
        s.windowStartMs = T0; s.windowEndMs = T0 + 86_400_000L;
        s.sufficientData = true; s.completeness = 1.0; s.sampleCount = 17_280; s.expectedSampleCount = 17_280;
        s.gate0Status = "PASS"; s.gate1Status = "PASS"; s.gate2Status = "PASS"; s.gate2rStatus = "PASS";
        s.operatingRegionValid = true; s.gate3Status = "PASS"; s.gate4Status = "PASS"; s.autoPct = 1.0;
        return s;
    }

    private static CplmLongDiagnosticsResult longOk() {
        CplmLongDiagnosticsResult l = new CplmLongDiagnosticsResult();
        l.loopId = "COND_LOOP"; l.loopType = "FIC"; l.windowKind = "24h";
        l.windowStartMs = T0; l.windowEndMs = T0 + 86_400_000L; l.sampleCount = 17_280;
        l.gate5Status = "PASS"; l.gate6Status = "PASS"; l.gate7Status = "PASS"; l.gate8Status = "PASS";
        l.gate9Status = "PASS"; l.gate10Status = "PASS"; l.gate11Status = "PASS"; l.gate11Reason = "";
        l.periodStatus = "NO_VALID_CYCLE"; l.stictionSignal = "OP";
        l.alignedShort = shortOk();
        return l;
    }

    private static ConditionEvent open(String gate, String kind, double durationS) {
        ConditionEvent e = new ConditionEvent();
        e.loopId = "COND_LOOP"; e.gate = gate; e.kind = kind; e.state = "OPEN";
        e.startMs = T0 + 80_000_000L; e.lastMs = e.startMs + (long) (durationS * 1000); e.durationS = durationS;
        e.evidence.put("limit_source", "DECLARED_RANGE");
        e.emittedAtMs = e.lastMs;
        return e;
    }

    @Test
    public void openLimitConditionRaisesG10ToWarnAndFlagsIt() {
        Map<String, ConditionEvent> conds = new HashMap<>();
        conds.put("LIMIT_HIGH", open("G10", "LIMIT_HIGH", 900));
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("COND_LOOP", "FIC", null);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p, OpenConditions.of(conds));
        assertEquals("WARN", r.gate10Status);
        assertTrue(r.observabilityFlags.contains("OPEN_LIMIT_CONDITION"));
        assertEquals("LIMIT_HIGH", r.openConditions.limitKind);
        assertEquals(900.0, r.openConditions.limitDurationS, 1e-9);
    }

    @Test
    public void openFreezeConditionMakesG11WarnButNeverExcludesTheWindow() {
        Map<String, ConditionEvent> conds = new HashMap<>();
        conds.put("FREEZE", open("G11", "FREEZE", 600));
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("COND_LOOP", "FIC", null);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p, OpenConditions.of(conds));
        assertEquals("WARN", r.gate11Status);
        assertEquals("OPEN_FREEZE_CONDITION", r.gate11Reason);
        assertFalse(r.freezeMaterial);
        assertNotEquals("EXCLUDED_SENSOR", r.diagnosis);
        assertTrue(r.observabilityFlags.contains("OPEN_FREEZE_CONDITION"));
    }

    @Test
    public void noConditionsLeavesTheVerdictUntouched() {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("COND_LOOP", "FIC", null);
        CplmGateResult a = CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p);
        CplmGateResult b = CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p, OpenConditions.none());
        assertEquals(a.gate10Status, b.gate10Status);
        assertEquals(a.gate11Status, b.gate11Status);
        assertEquals(a.diagnosis, b.diagnosis);
        assertFalse(b.observabilityFlags.contains("OPEN_LIMIT_CONDITION"));
    }

    @Test
    public void conditionEventRoundTripsThroughJson() {
        ConditionEvent e = open("G10", "LIMIT_LOW", 45.5);
        e.state = "CLOSED"; e.endMs = e.lastMs; e.closeReason = "LEFT_LIMIT";
        ConditionEvent back = ConditionEvent.fromJson(e.toJson());
        assertEquals("COND_LOOP", back.loopId);
        assertEquals("G10", back.gate);
        assertEquals("LIMIT_LOW", back.kind);
        assertEquals("CLOSED", back.state);
        assertEquals(e.startMs, back.startMs);
        assertEquals(e.endMs, back.endMs);
        assertEquals(45.5, back.durationS, 1e-9);
        assertEquals("LEFT_LIMIT", back.closeReason);
        assertEquals("DECLARED_RANGE", back.evidence.get("limit_source"));
    }
}
