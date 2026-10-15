package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * CHG-096 (SME review 2, C4): G3.objective_compliance_min is the real fraction from now on (0.5 = 50 %), and a
 * bundle published before CHG-096 (0.005 = 50 %, content-hashed, never rewritten) still means 50 %.
 */
public class ComplianceUnitTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static double applied(double stored) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        ObjectNode props = M.createObjectNode();
        props.put("G3.objective_compliance_min", stored);
        BundleProfileMapper.apply(p, props);
        return p.goodErrorPctPassMin;
    }

    @Test
    public void theRealFractionIsReadAsIs() {
        assertEquals(0.5, applied(0.5), 1e-12);
        assertEquals(0.3, applied(0.3), 1e-12);
        assertEquals(1.0, applied(1.0), 1e-12);
    }

    @Test
    public void aBundleStoredBeforeChg096KeepsItsMeaning() {
        assertEquals(0.5, applied(0.005), 1e-12);
        assertEquals(0.3, applied(0.003), 1e-12);
        assertEquals(1.0, applied(0.01), 1e-12);
    }

    @Test
    public void theFactoryLayerExportsTheRealFraction() {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        assertEquals(p.goodErrorPctPassMin, (Double) FactoryLayer.profileValues(p).get("G3.objective_compliance_min"), 1e-12);
        assertEquals(p.goodErrorPctPassMin, applied((Double) FactoryLayer.profileValues(p).get("G3.objective_compliance_min")), 1e-12);
    }
}
