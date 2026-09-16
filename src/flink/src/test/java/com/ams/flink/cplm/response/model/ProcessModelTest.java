package com.ams.flink.cplm.response.model;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ProcessModelTest {
    @Test
    public void sopdtOrdersItsPolesAndExposesOnlyExistingParameters() {
        ProcessModel m = ProcessModel.sopdt("OP_TO_PV", 3.0, 4.0, 10.0, 25.0);
        assertEquals(25.0, m.tau, 0);
        assertEquals(10.0, m.tau2, 0);
        assertTrue(m.parameters().containsKey("time_constant_1"));
        assertFalse(m.parameters().containsKey("time_constant"));
        assertEquals("s", m.parameters().get("dead_time").unit);
        assertEquals("PV_EU/input_EU", m.parameters().get("process_gain").unit);
    }

    @Test
    public void integratingModelsHaveNoStaticGain() {
        ProcessModel m = ProcessModel.ipdt("OP_TO_PV", 0.000166667, 12.0);
        assertTrue(m.integrating());
        Quantity kp = m.parameters().get("process_gain");
        assertFalse(kp.available());
        assertEquals("INTEGRATING_OR_NOT_IDENTIFIABLE", kp.reasonIfNull);
        assertEquals("PV_EU/(input_EU*s)", m.parameters().get("integrating_gain").unit);
    }

    @Test
    public void unsupportedFamiliesAreCapabilityStatesNotModels() {
        assertFalse(ModelFamily.UNSUPPORTED_INVERSE.supported());
        assertTrue(ModelFamily.INTEGRATOR_LAG.integrating());
        assertFalse(ModelFamily.SO_UNDERDAMPED.integrating());
    }

    @Test
    public void quantityNullAlwaysCarriesAReasonAndAUnit() {
        Quantity q = Quantity.unavailable("settle_response", "s", "RIGHT_CENSORED");
        assertNull(q.value);
        assertEquals("RIGHT_CENSORED", q.reasonIfNull);
        assertEquals("s", q.unit);
        try {
            Quantity.unavailable("x", "s", "");
            fail("empty reason must be refused");
        } catch (IllegalArgumentException expected) {
            // a null value without a reason is not a quantity
        }
    }
}
