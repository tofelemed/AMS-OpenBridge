package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.event.ResponseEvent;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.DoubleFunction;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

/**
 * CHG-212 (plan 2c): each event carries the P / I / D in force at its step; a change of P, I or D while an event is open
 * censors it TUNING_CHANGED. Tuning that first appears, or stops arriving, is not a change.
 */
public class ResponseCaptureTuningTest {

    private static ResponseJobConfig cfg() {
        ResponseJobConfig c = new ResponseJobConfig();
        c.preSupportS = 60;
        c.minCaptureS = 120;
        c.maxCaptureS = 900;
        c.tailDwellS = 60;
        c.eventDwellS = 15;
        return c;
    }

    private static CplmNormalizedSample sample(double tS, double pv, double sp, double[] pid) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC1";
        x.loopType = "FIC";
        x.eventTsMs = (long) (tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = 60;
        x.mode = "AUT";
        x.quality = "GOOD";
        if (pid != null) { x.p = pid[0]; x.i = pid[1]; x.d = pid[2]; }
        return x;
    }

    /** A setpoint step 50 to 55 at t = 120 that settles; {@code pidAt} gives each sample's P / I / D (null = not sent). */
    private static List<ResponseCapture.Closed> servoStep(ResponseCapture cap, DoubleFunction<double[]> pidAt) {
        List<ResponseCapture.Closed> out = new ArrayList<>();
        for (double t = 0; t <= 420; t += 1) {
            double sp = t < 120 ? 50 : 55;
            double pv = t < 125 ? 50 : 50 + 5 * (1 - Math.exp(-(t - 125) / 20));
            out.addAll(cap.onSample(sample(t, pv, sp, pidAt.apply(t)), false));
        }
        return out;
    }

    private static final double[] A = {40, 30, 0}, B = {50, 30, 0};

    @Test
    public void theEventCarriesTheTuningInForceAtItsStep() {
        List<ResponseCapture.Closed> closed = servoStep(new ResponseCapture("FIC1", cfg()), t -> t < 60 ? B : A);
        assertEquals(1, closed.size());
        ResponseCapture.Closed c = closed.get(0);
        assertEquals("COMPLETE", c.event.captureState);
        assertArrayEquals("[since s, P, I, D]: A since t = 60", new double[] {60, 40, 30, 0}, c.tuningAtT0, 0);
    }

    @Test
    public void aTuningChangeWhileTheEventIsOpenCensorsIt() {
        ResponseCapture cap = new ResponseCapture("FIC1", cfg());
        List<ResponseCapture.Closed> closed = servoStep(cap, t -> t < 200 ? A : B);
        ResponseEvent e = cap.machine().events().get(0);
        assertEquals("TUNING_CHANGED", e.censorReason);
        assertEquals("closed once, when the change arrived", 1, closed.stream().filter(c -> c.event == e).count());
    }

    @Test
    public void aChangeBetweenTheStepAndTheDetectionCensorsTheEventFromItsStep() {
        ResponseCapture cap = new ResponseCapture("FIC1", cfg());
        servoStep(cap, t -> t < 125 ? A : B);                                   // step at 120, opened about 15 s later
        assertEquals("TUNING_CHANGED", cap.machine().events().get(0).censorReason);
    }

    @Test
    public void tuningThatFirstAppearsDuringAnEventIsNotAChange() {
        List<ResponseCapture.Closed> closed = servoStep(new ResponseCapture("FIC1", cfg()), t -> t < 200 ? null : A);
        assertEquals(1, closed.size());
        assertEquals("COMPLETE", closed.get(0).event.captureState);
        assertNull("no tuning at the step", closed.get(0).tuningAtT0);
    }

    @Test
    public void tuningThatStopsArrivingIsNotAChange() {
        List<ResponseCapture.Closed> closed = servoStep(new ResponseCapture("FIC1", cfg()), t -> t < 200 ? A : null);
        assertEquals("COMPLETE", closed.get(0).event.captureState);
        assertArrayEquals(new double[] {0, 40, 30, 0}, closed.get(0).tuningAtT0, 0);
    }

    @Test
    public void aMissingIOrDIsPartOfTheTuning() {
        double[] pOnly = {40, Double.NaN, Double.NaN};
        ResponseCapture cap = new ResponseCapture("FIC1", cfg());
        servoStep(cap, t -> t < 200 ? pOnly : A);                               // I and D start arriving: a change
        assertEquals("TUNING_CHANGED", cap.machine().events().get(0).censorReason);
    }

    @Test
    public void aReplacementCaptureKeepsTheTuningHistory() {
        ResponseCapture old = new ResponseCapture("FIC1", cfg());
        for (double t = 0; t < 50; t += 1) old.onSample(sample(t, 50, 50, A), false);
        ResponseCapture next = new ResponseCapture("FIC1", cfg());
        next.inheritTuning(old);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 50; t <= 420; t += 1) {
            double sp = t < 120 ? 50 : 55;
            double pv = t < 125 ? 50 : 50 + 5 * (1 - Math.exp(-(t - 125) / 20));
            closed.addAll(next.onSample(sample(t, pv, sp, A), false));
        }
        assertFalse(closed.isEmpty());
        assertArrayEquals("since t = 0, from the old capture", new double[] {0, 40, 30, 0}, closed.get(0).tuningAtT0, 0);
    }
}
