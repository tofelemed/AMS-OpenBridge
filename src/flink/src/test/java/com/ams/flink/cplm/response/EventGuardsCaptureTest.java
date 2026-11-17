package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.event.ResponseEvent;
import org.apache.flink.api.common.ExecutionConfig;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.common.typeutils.TypeSerializer;
import org.apache.flink.util.InstantiationUtil;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.function.DoubleUnaryOperator;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-207: an open System Response event is censored when the valve sits at its limit or the PV leaves its region for 10 s.
 * Final review: the guards see the event from its step, an invalid region is no region, and an open capture survives a checkpoint.
 */
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

    /** A second SP step at t=200 supersedes the first at t=215 (eventDwellS 15); the valve at its limit on [fromS, toS). */
    private static ResponseCapture supersededWithLimit(double fromS, double toS) {
        ResponseCapture cap = new ResponseCapture("FIC1", cfg(null));
        for (double t = 0; t <= 330; t += 1) {
            double sp = t < 120 ? 50 : (t < 200 ? 55 : 62);
            boolean atLimit = t >= fromS && t < toS;
            cap.onSample(sample(t, 50, sp, atLimit ? 99.5 : 60, true), false);
        }
        assertTrue("the second step superseded the first", cap.machine().events().size() >= 2);
        assertEquals("SUPERSEDED_BY_EVENT", cap.machine().events().get(0).censorReason);
        return cap;
    }

    /**
     * Final review I2 (CHG-207): the merged event is guarded from its own step at t=200, not from the supersede at t=215 - the valve
     * at its limit from 206 to 219 (14 s) censors it. A stretch under the first event counts for the merged one only from the merged
     * event's step: at the limit 195-204 is 5 s of dwell for it, not 10.
     */
    @Test
    public void aSupersedingEventIsGuardedFromItsOwnStep() {
        assertEquals("ACTUATOR_CONSTRAINT", supersededWithLimit(206, 220).machine().events().get(1).censorReason);
        assertFalse(guardCensored(supersededWithLimit(195, 205)));
    }

    /**
     * Final review I2 (CHG-207): an event opens eventDwellS (30 s) after its step, and the guards see it from the step: the valve at
     * its limit from the SP step at t=120 to t=145, back before the event opened at t=150, censors it when the dwell was met.
     */
    @Test
    public void guardsSeeTheEventFromItsStep() {
        ResponseJobConfig c = cfg(null);
        c.eventDwellS = 30;
        ResponseCapture cap = new ResponseCapture("FIC1", c);
        for (double t = 0; t <= 300; t += 1) cap.onSample(sample(t, 50, t < 120 ? 50 : 55, t >= 120 && t <= 145 ? 99.5 : 60, true), false);
        assertEquals("ACTUATOR_CONSTRAINT", censorReason(cap));
        assertEquals("closed when the dwell was met, 10 s after the step", 130_000, cap.machine().events().get(0).tEndMs, 0);
    }

    /** Final review M1 (CHG-207): a region with min >= max is bad registry data - no region, like an unusable PV span. */
    @Test
    public void swappedRegionIsIgnored() {
        for (double[] bounds : new double[][] {{60, 40}, {50, 50}}) {
            ResponseCapture cap = run(cfg(region(bounds[0], bounds[1])), t -> 60, t -> 50, t -> true, 300);
            assertFalse("region " + bounds[0] + ".." + bounds[1] + " would censor every event", guardCensored(cap));
            assertEquals(Double.NEGATIVE_INFINITY, cap.config().regionPvMin, 0);
            assertEquals(Double.POSITIVE_INFINITY, cap.config().regionPvMax, 0);
        }
    }

    /**
     * Final review M7: a capture with an open event (its pre-step noise measured) and a limit dwell running (180..185 of 180..192)
     * goes through Flink's own serializer, as keyed state at a checkpoint; fed on, the copy closes what the original closes.
     */
    @Test
    public void openCaptureSurvivesACheckpoint() throws Exception {
        Random rnd = new Random(7);
        double[] pv = new double[301];
        for (int i = 0; i < pv.length; i++) pv[i] = 50 + 0.05 * rnd.nextGaussian();
        ResponseCapture original = new ResponseCapture("FIC1", cfg(null));
        for (int t = 0; t <= 185; t++) original.onSample(sample(t, pv[t], t < 120 ? 50 : 55, t >= 180 ? 99.5 : 60, true), false);
        assertFalse("an event is open", original.idle());
        assertFalse("its pre-step noise is measured", Double.isNaN(original.machine().open().preNoiseSigmaEu));
        TypeSerializer<ResponseCapture> ser = TypeInformation.of(ResponseCapture.class).createSerializer(new ExecutionConfig());
        ResponseCapture restored = InstantiationUtil.deserializeFromByteArray(ser, InstantiationUtil.serializeToByteArray(ser, original));
        List<ResponseCapture.Closed> a = new ArrayList<>(), b = new ArrayList<>();
        for (int t = 186; t <= 300; t++) {
            CplmNormalizedSample s = sample(t, pv[t], 55, t <= 192 ? 99.5 : 60, true);
            a.addAll(original.onSample(s, false));
            b.addAll(restored.onSample(s, false));
        }
        assertFalse(a.isEmpty());
        assertEquals("the limit dwell carried over the checkpoint", "ACTUATOR_CONSTRAINT", a.get(0).event.censorReason);
        assertEquals(190_000, a.get(0).event.tEndMs, 0);
        assertEquals(a.size(), b.size());
        for (int i = 0; i < a.size(); i++) {
            ResponseCapture.Closed x = a.get(i), y = b.get(i);
            assertEquals(x.event.eventId, y.event.eventId);
            assertEquals(x.event.censorReason, y.event.censorReason);
            assertEquals(x.event.tEndMs, y.event.tEndMs, 0);
            assertEquals(x.event.preNoiseSigmaEu, y.event.preNoiseSigmaEu, 0);
            assertArrayEquals(x.data.t, y.data.t, 0);
            assertArrayEquals(x.data.y, y.data.y, 0);
            assertArrayEquals(x.data.u, y.data.u, 0);
        }
    }
}
