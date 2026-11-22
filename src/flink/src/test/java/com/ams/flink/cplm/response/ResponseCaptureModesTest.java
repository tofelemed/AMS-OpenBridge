package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.event.ResponseEvent;
import org.junit.Test;

import java.util.Set;
import java.util.function.DoubleFunction;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * Owner decision 22 Nov 2026: System Response captures events only in AUT. Cascade is the next phase and is added by the
 * job argument {@code --response-capture-modes}; AUT to CAS during an event censors it like AUT to MAN. The KPIs and short
 * features keep counting CAS as automatic through {@link CplmNormalizedSample#isAutoMode()}, which is not changed.
 */
public class ResponseCaptureModesTest {

    private static ResponseJobConfig cfg() {
        ResponseJobConfig c = new ResponseJobConfig();
        c.preSupportS = 60;
        c.minCaptureS = 120;
        c.maxCaptureS = 900;
        c.tailDwellS = 60;
        c.eventDwellS = 15;
        return c;
    }

    private static CplmNormalizedSample sample(double tS, double pv, double sp, String mode) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC1";
        x.loopType = "FIC";
        x.eventTsMs = (long) (tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = 60;
        x.mode = mode;
        x.quality = "GOOD";
        return x;
    }

    /** A setpoint step 50 to 55 at t = 120 with a first-order PV response; {@code modeAt} gives each sample's mode. */
    private static ResponseCapture servoStep(ResponseJobConfig c, DoubleFunction<String> modeAt) {
        ResponseCapture cap = new ResponseCapture("FIC1", c);
        for (double t = 0; t <= 400; t += 1) {
            double sp = t < 120 ? 50 : 55;
            double pv = t < 125 ? 50 : 50 + 5 * (1 - Math.exp(-(t - 125) / 20));
            cap.onSample(sample(t, pv, sp, modeAt.apply(t)), false);
        }
        return cap;
    }

    @Test
    public void theDefaultCapturesInAutOnly() {
        ResponseJobConfig c = new ResponseJobConfig();
        assertEquals(Set.of("AUT"), c.captureModes);
        assertTrue(c.capturesIn("AUT"));
        assertTrue("an Auto spelling is AUT", c.capturesIn(" auto "));
        assertFalse("Cascade is the next phase", c.capturesIn("CAS"));
        assertFalse(c.capturesIn("CASCADE"));
        assertFalse(c.capturesIn("MAN"));
        assertFalse(c.capturesIn("IMAN"));
        assertFalse(c.capturesIn(null));
        assertFalse(c.capturesIn("UNKNOWN"));
    }

    @Test
    public void cascadeIsAddedByTheJobArgumentWithoutANewJar() {
        ResponseJobConfig c = ResponseJobConfig.fromArgs(new String[] {"--response-capture-modes", "AUT,CAS"});
        assertEquals(Set.of("AUT", "CAS"), c.captureModes);
        assertTrue(c.capturesIn("CASCADE"));
        assertEquals("absent argument keeps AUT", Set.of("AUT"), ResponseJobConfig.fromArgs(new String[0]).captureModes);
        assertEquals("blank argument keeps AUT", Set.of("AUT"), ResponseJobConfig.fromArgs(new String[] {"--response-capture-modes", " "}).captureModes);
    }

    @Test
    public void manualModesAreNeverCaptureModes() {
        ResponseJobConfig c = ResponseJobConfig.fromArgs(new String[] {"--response-capture-modes", "AUT,MAN,IMAN"});
        assertEquals(Set.of("AUT"), c.captureModes);
        assertEquals("only manual modes keeps AUT", Set.of("AUT"), ResponseJobConfig.fromArgs(new String[] {"--response-capture-modes", "MAN"}).captureModes);
        c.captureModes = new java.util.HashSet<>(Set.of("AUT", "MAN"));
        assertFalse("manual is refused even if set directly", c.capturesIn("MAN"));
    }

    @Test
    public void aSetpointStepInAutOpensAnEvent() {
        assertFalse(servoStep(cfg(), t -> "AUT").machine().events().isEmpty());
    }

    @Test
    public void aSetpointStepInCascadeOpensNoEvent() {
        assertTrue(servoStep(cfg(), t -> "CAS").machine().events().isEmpty());
    }

    @Test
    public void aSetpointStepInCascadeOpensAnEventOnceCascadeIsConfigured() {
        ResponseJobConfig c = cfg();
        c.captureModes = new java.util.HashSet<>(Set.of("AUT", "CAS"));
        assertFalse(servoStep(c, t -> "CAS").machine().events().isEmpty());
    }

    @Test
    public void autToCascadeDuringAnEventCensorsItAsAModeTransfer() {
        ResponseCapture cap = servoStep(cfg(), t -> t < 160 ? "AUT" : "CAS");
        assertFalse("an event was opened in AUT", cap.machine().events().isEmpty());
        ResponseEvent e = cap.machine().events().get(0);
        assertEquals("MODE_TRANSFER", e.censorReason);
    }

    @Test
    public void theCaptureModesArePartOfTheSettingsIdentity() {
        ResponseJobConfig aut = new ResponseJobConfig();
        ResponseJobConfig withCas = new ResponseJobConfig();
        withCas.captureModes = new java.util.HashSet<>(Set.of("CAS", "AUT"));
        assertNotEquals(aut.bundleHash(), withCas.bundleHash());
        ResponseJobConfig copy = withCas.copy();
        assertEquals(withCas.captureModes, copy.captureModes);
        assertEquals(withCas.bundleHash(), copy.bundleHash());
        assertEquals("a bundle keeps the job's capture modes", withCas.captureModes, withCas.underBundle("b1", null).captureModes);
    }

    @Test
    public void theKpisStillCountCascadeAsAutomatic() {
        assertTrue(sample(0, 50, 50, "CAS").isAutoMode());
        assertTrue(sample(0, 50, 50, "AUT").isAutoMode());
        assertFalse(sample(0, 50, 50, "MAN").isAutoMode());
    }
}
