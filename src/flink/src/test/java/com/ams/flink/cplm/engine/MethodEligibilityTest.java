package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.junit.After;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2G.1 (spec v6 §6.1-6.3, R05; NR-016, NR-019): the acquisition contract bounds what a
 * method can claim. A 5 s grid cannot resolve a 10 s period (G5/G6 LIMITED, reason BANDWIDTH) nor
 * a dead time below the grid (G12 LIMITED); an RBE source's held samples are RBE holds, not
 * process values. An EXPLICIT loop model overrides the loop_type preset's class and objective,
 * and a preset never overrides an explicit one.
 */
public class MethodEligibilityTest {
    private final CplmDynamicsParameterSetSupport.MapLookup attributes = new CplmDynamicsParameterSetSupport.MapLookup();

    @After
    public void clear() {
        // 3C.1: the attributes are a per-test lookup, never a static map
    }

    private static CplmLoopDynamicsProfile fastFlow() {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        p.tauMinS = 10;                                                  // the fastest oscillation period of interest
        p.tauMaxS = 900;
        p.minSamplesPerPeriod = 8;
        return p;
    }

    @Test
    public void nr016AFiveSecondGridOnAFastFlowLoopIsLimitedByBandwidthOnG5G6AndG12() {
        Map<String, MethodEligibility.Verdict> v = MethodEligibility.evaluate(fastFlow(), 5.0);
        assertEquals("LIMITED", v.get("G5").state);
        assertEquals("BANDWIDTH", v.get("G5").reason);
        assertTrue(v.get("G5").detail, v.get("G5").detail.contains("2.0 samples per 10.0 s period < 8"));
        assertEquals("LIMITED", v.get("G6").state);
        assertEquals("LIMITED", v.get("G12").state);
        assertEquals("BANDWIDTH", v.get("G12").reason);
        assertTrue(MethodEligibility.anyLimited(v));
    }

    @Test
    public void aOneSecondGridOnTheSameLoopIsEligible() {
        Map<String, MethodEligibility.Verdict> v = MethodEligibility.evaluate(fastFlow(), 1.0);
        assertEquals("ELIGIBLE", v.get("G5").state);
        assertEquals("ELIGIBLE", v.get("G6").state);
        assertEquals("ELIGIBLE", v.get("G12").state);
        assertFalse(MethodEligibility.anyLimited(v));
    }

    @Test
    public void theDeclaredGridWinsOverTheObservedOneAndAnUnknownGridIsStated() {
        CplmLoopDynamicsProfile p = fastFlow();
        p.acquisitionGridS = 30;                                         // the data source declares a 30 s grid
        Map<String, MethodEligibility.Verdict> v = MethodEligibility.evaluate(p, 5.0);
        assertEquals("LIMITED", v.get("G5").state);
        assertTrue(v.get("G5").detail, v.get("G5").detail.contains("declared grid 30.0 s"));
        Map<String, MethodEligibility.Verdict> none = MethodEligibility.evaluate(fastFlow(), 0);
        assertEquals("UNKNOWN", none.get("G5").state);
        assertEquals("NO_GRID", none.get("G5").reason);
    }

    @Test
    public void nr019AnRbeSourceHoldsAreRbeHolds() {
        CplmLoopDynamicsProfile p = fastFlow();
        p.acquisitionMode = "RBE";
        assertEquals("RBE_HOLD", MethodEligibility.holdKind(p, true));
        assertEquals("NONE", MethodEligibility.holdKind(p, false));
        p.acquisitionMode = "PERIODIC";
        assertEquals("HELD_PREVIOUS", MethodEligibility.holdKind(p, true));
        p.acquisitionMode = "SAMPLE_HOLD";
        assertEquals("SAMPLE_HOLD", MethodEligibility.holdKind(p, true));
    }

    @Test
    public void anExplicitLoopModelOverridesTheLoopTypePresetAndAPresetDoesNot() {
        attributes.put("LIC-1:cplm.loop.model",
                "{\"service_family\":\"LEVEL\",\"dynamic_class\":\"SLOW_SELF_REG\",\"objective_type\":\"TIGHT\",\"topology\":\"CASCADE_SLAVE\",\"command_path\":\"OP_TO_VALVE\","
                        + "\"acquisition\":{\"mode\":\"RBE\",\"grid_seconds\":5,\"declared_scan_s\":1.0},\"classification_source\":\"EXPLICIT\"}");
        CplmLoopDynamicsProfile explicit = CplmDynamicsParameterSetSupport.resolve("LIC-1", "LIC", null, attributes);
        assertEquals(CplmLoopDynamicsProfile.DynamicClass.SLOW_SELF_REG, explicit.dynamicClass);
        assertEquals(CplmLoopDynamicsProfile.ServiceObjective.TIGHT, explicit.serviceObjective);
        assertFalse("a self-regulating level loop is NOT integrating: the shape signal is OP", explicit.integrating);
        assertEquals("OP", explicit.stictionSignal());
        assertEquals("EXPLICIT", explicit.classificationSource);
        assertEquals("RBE", explicit.acquisitionMode);
        assertEquals(5.0, explicit.acquisitionGridS, 1e-9);
        assertEquals("CASCADE_SLAVE", explicit.topology);
        assertEquals("OP_TO_VALVE", explicit.commandPath);

        attributes.put("LIC-2:cplm.loop.model",
                "{\"service_family\":\"LEVEL\",\"dynamic_class\":\"INTEGRATING\",\"objective_type\":\"AVERAGING\",\"topology\":\"SINGLE\",\"command_path\":\"OP_TO_VALVE\","
                        + "\"acquisition\":{\"mode\":\"PERIODIC\"},\"classification_source\":\"PRESET_FROM_LOOP_TYPE\"}");
        CplmLoopDynamicsProfile preset = CplmDynamicsParameterSetSupport.resolve("LIC-2", "LIC", null, attributes);
        assertEquals("the loop_type pack stays the source of the class when the model is only a preset",
                CplmLoopDynamicsProfile.DynamicClass.INTEGRATING, preset.dynamicClass);
        assertEquals("PRESET_FROM_LOOP_TYPE", preset.classificationSource);
        assertTrue(preset.integrating);
    }

    @Test
    public void theSpecDynamicClassesMapOntoTheEngineAndUnknownStaysUnknown() {
        assertEquals(CplmLoopDynamicsProfile.DynamicClass.INTEGRATING_LAG, CplmLoopDynamicsProfile.DynamicClass.parse("INTEGRATING_LAG"));
        assertEquals(CplmLoopDynamicsProfile.DynamicClass.UNDERDAMPED, CplmLoopDynamicsProfile.DynamicClass.parse("UNDERDAMPED"));
        assertEquals(CplmLoopDynamicsProfile.DynamicClass.NEAR_INTEGRATING, CplmLoopDynamicsProfile.DynamicClass.parse("NEAR_INTEGRATING"));
        assertEquals(CplmLoopDynamicsProfile.DynamicClass.UNKNOWN, CplmLoopDynamicsProfile.DynamicClass.parse("WHATEVER"));
        assertTrue(CplmLoopDynamicsProfile.DynamicClass.INTEGRATING_LAG.integrating());
        assertFalse(CplmLoopDynamicsProfile.DynamicClass.UNDERDAMPED.integrating());
    }
}
