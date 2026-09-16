package com.ams.flink.cplm.condition;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1D.4 (spec v6 R11 / R08): the fast condition path. G10 limit dwell and G11
 * freeze are detected sample by sample and published as OPEN / UPDATE / CLOSED events with
 * event-time bounds, so an operator sees a valve pinned at its limit or a frozen sensor
 * within the dwell time, not at the next 12 h / 24 h fusion.
 *
 * <p>{@link ConditionDetector} is a pure keyed state machine (one per loop); the Flink job
 * wraps it. Same primitives as the long-window gates (LimitMath), same profile thresholds.
 */
public class ConditionDetectorTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final long GRID = 5_000L;

    private static CplmNormalizedSample s(long ts, double pv, double op) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "COND_LOOP";
        x.eventTsMs = ts;
        x.pv = pv;
        x.sp = 50;
        x.op = op;
        x.mode = "AUT";
        x.quality = "GOOD";
        return x;
    }

    private static CplmLoopDynamicsProfile fic() {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("COND_LOOP", "FIC", null).copy();
        p.opEngMin = 0; p.opEngMax = 100; p.opRangeDeclared = true;
        p.freezeDwellS = 60;
        p.limitDwellWarnS = 30;
        return p;
    }

    private static List<ConditionEvent> feed(ConditionDetector d, CplmLoopDynamicsProfile p, double[] pv, double[] op) {
        List<ConditionEvent> out = new ArrayList<>();
        for (int i = 0; i < pv.length; i++) out.addAll(d.onSample(s(T0 + i * GRID, pv[i], op[i]), p));
        return out;
    }

    @Test
    public void flatPvOpensAFreezeAtTheDwellAndClosesWhenItMoves() {
        ConditionDetector d = new ConditionDetector();
        int n = 40;                                        // 200 s
        double[] pv = new double[n], op = new double[n];
        for (int i = 0; i < n; i++) { pv[i] = i < 20 ? 50.0 : 50 + 0.5 * (i - 19); op[i] = 40 + Math.sin(i); }
        List<ConditionEvent> ev = feed(d, fic(), pv, op);

        ConditionEvent open = ev.get(0);
        assertEquals("G11", open.gate);
        assertEquals("FREEZE", open.kind);
        assertEquals("OPEN", open.state);
        assertEquals(T0, open.startMs);                    // the run started at the first flat sample
        assertEquals(T0 + 12 * GRID, open.lastMs);         // opened once 60 s of flatness had elapsed
        ConditionEvent closed = ev.get(ev.size() - 1);
        assertEquals("CLOSED", closed.state);
        assertEquals(T0 + 20 * GRID, closed.endMs);        // the first moving sample ends it
        assertEquals(100.0, closed.durationS, 1e-9);
        assertTrue(ev.stream().filter(e -> "UPDATE".equals(e.state)).count() >= 1);
    }

    @Test
    public void shortFlatnessBelowTheDwellNeverOpensAnything() {
        ConditionDetector d = new ConditionDetector();
        int n = 30;
        double[] pv = new double[n], op = new double[n];
        for (int i = 0; i < n; i++) { pv[i] = (i % 10) < 8 ? 50.0 : 51.0; op[i] = 40; }   // 40 s flat runs
        assertTrue(feed(d, fic(), pv, op).stream().noneMatch(e -> "FREEZE".equals(e.kind)));
    }

    @Test
    public void outputPinnedAtTheDeclaredMaximumOpensALimitConditionInSeconds() {
        ConditionDetector d = new ConditionDetector();
        CplmLoopDynamicsProfile p = fic();
        p.opEngMax = 80;                                   // declared 0-80: 80 IS the limit
        int n = 30;
        double[] pv = new double[n], op = new double[n];
        for (int i = 0; i < n; i++) { pv[i] = 50 + Math.sin(i); op[i] = i < 12 ? 80.0 : 40.0; }
        List<ConditionEvent> ev = feed(d, p, pv, op);
        ConditionEvent open = ev.stream().filter(e -> "OPEN".equals(e.state)).findFirst().orElse(null);
        assertEquals("G10", open.gate);
        assertEquals("LIMIT_HIGH", open.kind);
        assertEquals(T0 + 6 * GRID, open.lastMs);          // 30 s dwell reached
        ConditionEvent closed = ev.stream().filter(e -> "CLOSED".equals(e.state)).findFirst().orElse(null);
        assertEquals(T0 + 12 * GRID, closed.endMs);
        assertEquals(60.0, closed.durationS, 1e-9);
        assertEquals("DECLARED_RANGE", closed.evidence.get("limit_source"));
    }

    @Test
    public void undeclaredRangeNeverCallsEightyPercentALimit() {
        ConditionDetector d = new ConditionDetector();
        CplmLoopDynamicsProfile p = fic();
        p.opRangeDeclared = false; p.opEngMin = 0; p.opEngMax = 100;
        double[] pv = new double[30], op = new double[30];
        for (int i = 0; i < 30; i++) { pv[i] = 50 + Math.sin(i); op[i] = 80.0; }
        assertTrue(feed(d, p, pv, op).stream().noneMatch(e -> e.kind.startsWith("LIMIT")));
    }

    @Test
    public void aSourceGapEndsAnOpenConditionAtTheLastObservation() {
        ConditionDetector d = new ConditionDetector();
        CplmLoopDynamicsProfile p = fic();
        List<ConditionEvent> ev = new ArrayList<>();
        for (int i = 0; i < 20; i++) ev.addAll(d.onSample(s(T0 + i * GRID, 50.0, 40), p));   // 100 s flat -> OPEN
        assertTrue(ev.stream().anyMatch(e -> "OPEN".equals(e.state)));
        ev.addAll(d.onSample(s(T0 + 20 * GRID + 3_600_000L, 50.0, 40), p));                 // one hour later, still flat
        ConditionEvent closed = ev.stream().filter(e -> "CLOSED".equals(e.state)).findFirst().orElse(null);
        assertEquals("SOURCE_GAP", closed.closeReason);
        assertEquals(T0 + 19 * GRID + GRID, closed.endMs);   // ended at the last observed sample + one grid, not across the gap
        assertNull(d.openCondition("G11"));                  // the hour-later sample starts a fresh run, nothing open yet
    }
}
