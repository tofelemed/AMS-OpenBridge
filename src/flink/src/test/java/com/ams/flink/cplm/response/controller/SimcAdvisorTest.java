package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class SimcAdvisorTest {
    @Test
    public void selfRegulatingAndIntegratingRulesAreTheNamedSimcForms() {
        ProcessModel fopdt = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        SimcAdvisor.Advice a = SimcAdvisor.advise(fopdt, true, ControllerSnapshot.ideal(1, 1.0, null, 1.0, "DIRECT"), 4.0);
        assertEquals("SIMC_2003_CORRECTED", a.rule);
        assertEquals((1.0 / 3.0) * 20.0 / (4.0 + 4.0), a.kc, 1e-9);
        assertEquals(Math.min(20.0, 4 * (4.0 + 4.0)), a.ti, 1e-9);
        assertNull(a.td);
        ProcessModel ipdt = ProcessModel.ipdt("OP_TO_PV", 0.01, 12.0);
        SimcAdvisor.Advice b = SimcAdvisor.advise(ipdt, true, ControllerSnapshot.ideal(1, 1.0, null, 1.0, "DIRECT"), 12.0);
        assertEquals((1.0 / 0.01) / (12.0 + 12.0), b.kc, 1e-9);
        assertEquals(4 * (12.0 + 12.0), b.ti, 1e-9);
    }

    @Test
    public void refusesWithoutAValidatedModelKnownControllerAndApprovedLambda() {
        ProcessModel fopdt = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        assertEquals("MODEL_NOT_VALIDATED", SimcAdvisor.advise(fopdt, false, ControllerSnapshot.ideal(1, 1.0, null, 1.0, "DIRECT"), 4.0).reason);
        assertEquals("CONTROLLER_FORM_UNKNOWN", SimcAdvisor.advise(fopdt, true, ControllerSnapshot.unknown(), 4.0).reason);
        assertEquals("LAMBDA_NOT_APPROVED", SimcAdvisor.advise(fopdt, true, ControllerSnapshot.ideal(1, 1.0, null, 1.0, "DIRECT"), null).reason);
        assertNull(SimcAdvisor.advise(fopdt, false, ControllerSnapshot.unknown(), null).kc);
    }
}
