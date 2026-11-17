package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** CHG-208: the System Response model family follows the loop's DECLARED process behaviour; the tag rule is the fallback. */
public class ModelFamilyDeclaredTest {

    private static CplmNormalizedSample sample(String loopType, CplmLoopDynamicsProfile.DynamicClass dc, boolean declared) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = "X1";
        s.loopType = loopType;
        s.resolvedProfile = new CplmLoopDynamicsProfile();
        s.resolvedProfile.dynamicClass = dc;
        s.resolvedProfile.dynamicClassDeclared = declared;
        return s;
    }

    private static CplmLoopDynamicsProfile resolveWithModel(String loopId, String loopType, String model) {
        CplmDynamicsParameterSetSupport.MapLookup attributes = new CplmDynamicsParameterSetSupport.MapLookup();
        attributes.put(loopId + ":cplm.loop.model", model);
        return CplmDynamicsParameterSetSupport.resolve(loopId, loopType, null, attributes);
    }

    @Test
    public void declaredIntegratingPressureLoopIsIpdt() {
        CplmNormalizedSample s = sample("PIC", CplmLoopDynamicsProfile.DynamicClass.INTEGRATING, true);
        assertEquals(ModelFamily.IPDT, CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(s));
    }

    @Test
    public void declaredSelfRegulatingLevelLoopIsFopdt() {
        CplmNormalizedSample s = sample("LIC", CplmLoopDynamicsProfile.DynamicClass.SLOW_SELF_REG, true);
        assertEquals(ModelFamily.FOPDT, CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(s));
    }

    @Test
    public void undeclaredKeepsTagRule() {
        assertEquals(ModelFamily.IPDT, CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(
                sample("LIC", CplmLoopDynamicsProfile.DynamicClass.FAST_SELF_REG, false)));
        assertEquals("an undeclared integrating preset does not change a PIC", ModelFamily.FOPDT,
                CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(
                        sample("PIC", CplmLoopDynamicsProfile.DynamicClass.INTEGRATING, false)));
        CplmNormalizedSample noProfile = new CplmNormalizedSample();
        noProfile.loopType = "LIC";
        assertEquals(ModelFamily.IPDT, CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(noProfile));
    }

    @Test
    public void aSampleOverrideCountsAsDeclaredAndWins() {
        CplmNormalizedSample s = sample("LIC", CplmLoopDynamicsProfile.DynamicClass.INTEGRATING, false);
        s.dynamicClassOverride = "SLOW_SELF_REG";
        assertEquals(ModelFamily.FOPDT, CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(s));
        CplmNormalizedSample p = sample("PIC", CplmLoopDynamicsProfile.DynamicClass.FAST_SELF_REG, true);
        p.dynamicClassOverride = "INTEGRATING";
        assertEquals(ModelFamily.IPDT, CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(p));
        p.dynamicClassOverride = "UNKNOWN";
        assertEquals("an unusable override falls through to the profile", ModelFamily.FOPDT,
                CplmResponseAnalysisJob.ResponseProcessFunction.familyFor(p));
    }

    @Test
    public void explicitDynamicClassSetsDeclared() {
        CplmLoopDynamicsProfile p = resolveWithModel("PIC-1", "PIC",
                "{\"dynamic_class\":\"INTEGRATING\",\"classification_source\":\"EXPLICIT\"}");
        assertTrue(p.dynamicClassDeclared);
        assertEquals(CplmLoopDynamicsProfile.DynamicClass.INTEGRATING, p.dynamicClass);
        assertTrue("the flag survives copy()", p.copy().dynamicClassDeclared);
    }

    @Test
    public void presetOrNullClassDoesNotSetDeclared() {
        assertFalse(resolveWithModel("LIC-2", "LIC",
                "{\"dynamic_class\":\"INTEGRATING\",\"classification_source\":\"PRESET_FROM_LOOP_TYPE\"}").dynamicClassDeclared);
        assertFalse("EXPLICIT with a null class is not a declaration", resolveWithModel("LIC-3", "LIC",
                "{\"dynamic_class\":null,\"classification_source\":\"EXPLICIT\"}").dynamicClassDeclared);
        assertFalse(resolveWithModel("LIC-4", "LIC",
                "{\"dynamic_class\":\"UNKNOWN\",\"classification_source\":\"EXPLICIT\"}").dynamicClassDeclared);
        assertFalse(CplmDynamicsParameterSetSupport.resolveDefault("LIC-5", "LIC", null).dynamicClassDeclared);
    }
}
