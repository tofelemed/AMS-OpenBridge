package com.ams.flink.cplm.response.event;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ResponseEventDetectorTest {
    private static ResponseEventDetector.Settings settings() {
        ResponseEventDetector.Settings s = new ResponseEventDetector.Settings();
        s.stepMinInputEu = 1.0;
        s.stepMinSpanFraction = 0.01;
        s.span = 200;
        s.noiseMultiplier = 4;
        s.preSupportS = 60;
        s.eventDwellS = 15;
        s.rampMinSlopeEuPerS = 0.02;
        s.rampMinDurationS = 60;
        return s;
    }

    private static double[] grid(int n, double dt) {
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = i * dt;
        return t;
    }

    private static boolean[] all(int n) {
        boolean[] v = new boolean[n];
        java.util.Arrays.fill(v, true);
        return v;
    }

    @Test
    public void constantInputIsNoEvent() {                                     // NR-006
        double[] t = grid(100, 5);
        double[] sp = new double[100];
        java.util.Arrays.fill(sp, 100);
        assertNull(ResponseEventDetector.detect(t, sp, all(100), settings()));
    }

    @Test
    public void noiseBelowTheTriggerIsNoEvent() {
        double[] t = grid(120, 5);
        double[] sp = new double[120];
        java.util.Random rnd = new java.util.Random(7);
        for (int i = 0; i < 120; i++) sp[i] = 100 + 0.2 * rnd.nextGaussian();
        assertNull(ResponseEventDetector.detect(t, sp, all(120), settings()));
        assertTrue(ResponseEventDetector.trigger(java.util.Arrays.copyOf(sp, 12), settings()) >= 2.0);   // max(1, 2, 4*1.4826*MAD)
    }

    @Test
    public void aHeldStepIsAServoStepWithItsAmplitude() {
        double[] t = grid(60, 5);
        double[] sp = new double[60];
        for (int i = 0; i < 60; i++) sp[i] = t[i] < 100 ? 100 : 115;
        ResponseEventDetector.Candidate c = ResponseEventDetector.detect(t, sp, all(60), settings());
        assertNotNull(c);
        assertEquals(EventType.SERVO_STEP, c.type);
        assertEquals(20, c.index);
        assertEquals(15.0, c.amplitude, 1e-9);
    }

    @Test
    public void aStepThatDoesNotPersistIsNoEvent() {
        double[] t = grid(60, 5);
        double[] sp = new double[60];
        for (int i = 0; i < 60; i++) sp[i] = (t[i] >= 100 && t[i] < 110) ? 115 : 100;   // 10 s blip < 15 s dwell
        assertNull(ResponseEventDetector.detect(t, sp, all(60), settings()));
    }

    @Test
    public void aSustainedRampIsRampTrackingNotAStep() {
        double[] t = grid(120, 5);
        double[] sp = new double[120];
        for (int i = 0; i < 120; i++) sp[i] = t[i] < 100 ? 100 : 100 + 0.05 * (t[i] - 100);   // 0.05 EU/s for 500 s
        ResponseEventDetector.Candidate c = ResponseEventDetector.detect(t, sp, all(120), settings());
        assertNotNull(c);
        assertEquals(EventType.RAMP_TRACKING, c.type);
    }
}
