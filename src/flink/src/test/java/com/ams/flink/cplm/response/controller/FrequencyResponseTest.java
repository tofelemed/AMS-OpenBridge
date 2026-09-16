package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class FrequencyResponseTest {
    @Test
    public void pureDelayWithProportionalControlHasTheClosedFormGainMargin() {
        // L ~ 0.5 e^{-j w 10}: |L| = 0.5 (no gain crossover), phase crossover at w = pi/10 -> GM = 1/0.5 = 6.02 dB
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 1.0, 10.0, 0.001);
        ControllerSnapshot c = ControllerSnapshot.ideal(0.5, null, null, 1.0, "DIRECT");
        FrequencyResponse.Result r = FrequencyResponse.of(m, c, 1e-3, 10, 4000, true);
        assertEquals(6.02, r.gainMarginDb.value, 0.15);
        assertEquals(Math.PI / 10, r.phaseCrossover.value, 0.02);
        assertFalse(r.phaseMarginDeg.available());
        assertEquals("UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING", r.phaseMarginDeg.reasonIfNull);
        assertEquals("dB", r.gainMarginDb.unit);
        assertEquals("rad/s", r.phaseCrossover.unit);
    }

    @Test
    public void fopdtWithPiMatchesABruteForceCrossover() {
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 2.0, 5.0, 30.0);
        ControllerSnapshot c = ControllerSnapshot.ideal(0.4, 40.0, null, 1.0, "DIRECT");
        FrequencyResponse.Result r = FrequencyResponse.of(m, c, 1e-4, 10, 20000, true);
        assertTrue(r.gainCrossover.available());
        double w = r.gainCrossover.value;
        double magC = 0.4 * Math.hypot(1, 1 / (40.0 * w));
        double magG = 2.0 / Math.hypot(1, 30.0 * w);
        assertEquals(1.0, magC * magG, 0.01);                                   // |L| = 1 at the reported crossover
        assertTrue(r.phaseMarginDeg.value > 0 && r.phaseMarginDeg.value < 180);
        assertTrue(r.peakS.value >= 1.0);
    }

    @Test
    public void unknownControllerFormYieldsUnavailableNotFabrication() {         // NR-014
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 2.0, 5.0, 30.0);
        ControllerSnapshot unknown = ControllerSnapshot.unknown();
        FrequencyResponse.Result r = FrequencyResponse.of(m, unknown, 1e-4, 10, 100, true);
        assertFalse(r.gainMarginDb.available());
        assertEquals("UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING", r.gainMarginDb.reasonIfNull);
        try {
            ControllerFormAdapter.toIdeal(ControllerSnapshot.series(1, 10.0, 1.0, 1.0));
            fail();
        } catch (ControllerFormAdapter.UnsupportedFormException expected) {
            // series form has no universal conversion
        }
        FrequencyResponse.Result nv = FrequencyResponse.of(m, ControllerSnapshot.ideal(0.4, 40.0, null, 1.0, "DIRECT"), 1e-4, 10, 100, false);
        assertEquals("MODEL_DOMAIN_UNAVAILABLE", nv.peakS.reasonIfNull);
    }
}
