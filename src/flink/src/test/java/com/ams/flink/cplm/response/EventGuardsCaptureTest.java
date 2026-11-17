package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.event.ResponseEvent;
import org.junit.Test;

import java.util.function.DoubleUnaryOperator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** CHG-207: an open System Response event is censored when the valve sits at its limit or the PV leaves its region for 10 s. */
public class EventGuardsCaptureTest {
    private static final double GUARD_FROM_S = 180;

    private static ResponseJobConfig cfg(CplmLoopDynamicsProfile p) {
        ResponseJobConfig c = new ResponseJobConfig();
        c.preSupportS = 60;
        c.minCaptureS = 120;
        c.maxCaptureS = 900;
        c.tailDwellS = 60;
        c.eventDwellS = 15;
        return c.withProfileRanges(p);
    }

    private static CplmNormalizedSample sample(double tS, double pv, double sp, double op, boolean good) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC1";
        x.loopType = "FIC";
        x.eventTsMs = (long) (tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = op;
        x.mode = "AUT";
        x.quality = good ? "GOOD" : "BAD";
        return x;
    }

    /** A servo step (SP 50 -> 55 at t=120) that is open by t=140; from then on op(t) and pv(t) drive the guards, until endS. */
    private static ResponseCapture run(ResponseJobConfig c, DoubleUnaryOperator op, DoubleUnaryOperator pv, java.util.function.DoublePredicate good, double endS) {
        ResponseCapture cap = new ResponseCapture("FIC1", c);
        for (double t = 0; t <= endS; t += 1) {
            double sp = t < 120 ? 50 : 55;
            boolean afterOpen = t >= GUARD_FROM_S;
            cap.onSample(sample(t, afterOpen ? pv.applyAsDouble(t) : 50, sp, afterOpen ? op.applyAsDouble(t) : 60, good.test(t)), false);
        }
        return cap;
    }

    private static String censorReason(ResponseCapture cap) {
        assertFalse("an event was opened", cap.machine().events().isEmpty());
        ResponseEvent e = cap.machine().events().get(0);
        return e.censorReason;
    }

    private static boolean guardCensored(ResponseCapture cap) {
        for (ResponseEvent e : cap.machine().events()) {
            if ("ACTUATOR_CONSTRAINT".equals(e.censorReason) || "REGION_EXIT".equals(e.censorReason)) return true;
        }
        return false;
    }

    private static CplmLoopDynamicsProfile region(double min, double max) {
        CplmLoopDynamicsProfile p = new CplmLoopDynamicsProfile();
        p.regionPvMin = min;
        p.regionPvMax = max;
        return p;
    }

    @Test
    public void outputAtLimitTenSecondsCensors() {
        ResponseCapture cap = run(cfg(null), t -> t <= GUARD_FROM_S + 12 ? 99.5 : 60, t -> 50, t -> true, 300);
        assertEquals("ACTUATOR_CONSTRAINT", censorReason(cap));
    }

    @Test
    public void outputAtLimitUnderTenSecondsDoesNot() {
        ResponseCapture cap = run(cfg(null), t -> t <= GUARD_FROM_S + 8 ? 99.5 : 60, t -> 50, t -> true, 300);
        assertFalse(guardCensored(cap));
    }

    @Test
    public void declaredOpRangeUsedForLimit() {
        CplmLoopDynamicsProfile p = new CplmLoopDynamicsProfile();
        p.opRangeDeclared = true;
        p.opEngMin = 0;
        p.opEngMax = 200;
        ResponseCapture notAtLimit = run(cfg(p), t -> t <= GUARD_FROM_S + 12 ? 99.5 : 100, t -> 50, t -> true, 300);
        assertFalse("99.5 is mid-range on 0-200", guardCensored(notAtLimit));
        ResponseCapture atLimit = run(cfg(p), t -> t <= GUARD_FROM_S + 12 ? 198.5 : 100, t -> 50, t -> true, 300);
        assertEquals("ACTUATOR_CONSTRAINT", censorReason(atLimit));
    }

    @Test
    public void pvOutsideRegionTenSecondsCensors() {
        ResponseCapture cap = run(cfg(region(40, 60)), t -> 60, t -> t <= GUARD_FROM_S + 12 ? 65 : 50, t -> true, 300);
        assertEquals("REGION_EXIT", censorReason(cap));
    }

    @Test
    public void regionWithOneFiniteBoundCensors() {
        ResponseCapture cap = run(cfg(region(Double.NEGATIVE_INFINITY, 60)), t -> 60, t -> t <= GUARD_FROM_S + 12 ? 65 : 50, t -> true, 300);
        assertEquals("REGION_EXIT", censorReason(cap));
    }

    @Test
    public void noRegionNoRegionCensor() {
        ResponseCapture cap = run(cfg(null), t -> 60, t -> 1e6, t -> true, 300);
        assertFalse(guardCensored(cap));
    }

    @Test
    public void badSamplesDoNotCountTowardDwell() {
        // at the limit on good samples only at 140 and 150..: the bad samples between neither start nor break the dwell
        ResponseCapture bad = run(cfg(null), t -> t <= GUARD_FROM_S + 10 ? 99.5 : 60, t -> 50, t -> t <= GUARD_FROM_S || t >= GUARD_FROM_S + 10, 300);
        assertEquals("ACTUATOR_CONSTRAINT", censorReason(bad));
        // a bad sample in a short stretch does not lengthen it: 8 s of good limit samples, 1 bad with the valve back
        ResponseCapture shortStretch = run(cfg(null), t -> t <= GUARD_FROM_S + 8 ? 99.5 : 60, t -> 50, t -> t != GUARD_FROM_S + 9, 300);
        assertFalse(guardCensored(shortStretch));
    }

    @Test
    public void aSupersedingEventStartsTheDwellsAgain() {
        // a second SP step at t=200 supersedes the first at about t=215; the valve at its limit from 206 to 219 (14 s) is
        // 4 s of dwell for the second event, not 14
        ResponseCapture cap = new ResponseCapture("FIC1", cfg(null));
        for (double t = 0; t <= 330; t += 1) {
            double sp = t < 120 ? 50 : (t < 200 ? 55 : 62);
            boolean atLimit = t >= 206 && t < 220;
            cap.onSample(sample(t, 50, sp, atLimit ? 99.5 : 60, true), false);
        }
        assertTrue("the second step superseded the first", cap.machine().events().size() >= 2);
        assertFalse(guardCensored(cap));
    }
}
