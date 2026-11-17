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
    public void withParameterCopiesTheModelWithOneCatalogueParameterChanged() {     // CHG-209
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        ProcessModel k = m.withParameter("process_gain", 3.3);
        assertEquals(3.3, k.gain, 0);
        assertEquals(4.0, k.theta, 0);
        assertEquals(20.0, k.tau, 0);
        assertEquals(ModelFamily.FOPDT, k.family);
        assertEquals("OP_TO_PV", k.pathId);
        assertEquals(4.5, m.withParameter("dead_time", 4.5).theta, 0);
        assertEquals(22.0, m.withParameter("time_constant", 22.0).tau, 0);
        assertEquals("the original is untouched", 3.0, m.gain, 0);
        ProcessModel s = ProcessModel.sopdt("OP_TO_PV", 3.0, 4.0, 25.0, 10.0);
        assertEquals(11.0, s.withParameter("time_constant_2", 11.0).tau2, 0);
        assertEquals(26.0, s.withParameter("time_constant_1", 26.0).tau, 0);
        ProcessModel u = ProcessModel.underdamped("OP_TO_PV", 2.0, 1.0, 0.4, 0.2);
        assertEquals(0.41, u.withParameter("damping_ratio", 0.41).zeta, 0);
        assertEquals(0.21, u.withParameter("natural_frequency", 0.21).wn, 0);
        ProcessModel i = ProcessModel.integratorLag("OP_TO_PV", 0.01, 2.0, 15.0);
        assertEquals(0.02, i.withParameter("integrating_gain", 0.02).gain, 0);
        assertEquals(16.0, i.withParameter("time_constant", 16.0).tau, 0);
    }

    @Test
    public void withParameterRefusesAParameterTheFamilyDoesNotHaveOrAnIllegalValue() {
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        for (String name : new String[] {"integrating_gain", "time_constant_2", "damping_ratio", "baseline", "nonsense"}) {
            try {
                m.withParameter(name, 1.0);
                fail(name + " is not a parameter of an FOPDT");
            } catch (IllegalArgumentException expected) {
                // the catalogue names of parameters() only
            }
        }
        try {
            ProcessModel.ipdt("OP_TO_PV", 0.01, 2.0).withParameter("process_gain", 1.0);
            fail("an integrating model has no static gain");
        } catch (IllegalArgumentException expected) {
            // INTEGRATING_OR_NOT_IDENTIFIABLE
        }
        try {
            m.withParameter("time_constant", -1.0);
            fail("the factory's checks apply");
        } catch (IllegalArgumentException expected) {
            // tau must be > 0
        }
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
