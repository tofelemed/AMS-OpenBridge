package com.ams.flink.cplm.health;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1H.4 (spec v6 §4.5; NR-037, NR-038, NR-040, NR-042, NR-045): the per-device state
 * machine turns observations into status INTERVALS. An interval begins at the supported observed
 * time and ends on an explicit newer state, a freshness expiry or a source-offline boundary; a
 * clear needs a complete verified empty state; an old sequence never overwrites newer state; a
 * late correction is a revision that keeps the original belief.
 */
public class DeviceStateMachineTest {
    private static final long T0 = 1_758_000_000_000L;
    private static final long MIN = 60_000L;

    private static HealthObservation snapshot(long observedMs, long verifiedMs, long epoch, long seq, boolean complete,
                                              List<String> flags, String collection, String impact) {
        HealthObservation o = new HealthObservation();
        o.tenantId = "default"; o.site = "hdpe"; o.sourceId = "instr-prm-1"; o.deviceId = "TT-1";
        o.messageKind = "STATE_SNAPSHOT"; o.observationId = "obs-" + observedMs + "-" + seq;
        o.producerEpoch = epoch; o.sequence = seq; o.stateRevision = seq; o.stateComplete = complete;
        o.observedAtMs = observedMs; o.verifiedAtMs = verifiedMs; o.publishedAtMs = verifiedMs; o.receivedAtMs = verifiedMs + 100;
        o.scanIntervalS = 30;
        o.activeFlags = new java.util.ArrayList<>(flags);
        o.collectionState = collection; o.measurementImpact = impact; o.nativeStatus = String.join(",", flags);
        return o;
    }

    private static HealthObservation event(HealthObservation base, long epoch, long seq, String changeKind, String corrects) {
        HealthObservation e = base;
        e.messageKind = "STATE_EVENT"; e.producerEpoch = epoch; e.sequence = seq; e.changeKind = changeKind;
        e.correctsObservationId = corrects; e.observationId = "evt-" + seq;
        return e;
    }

    private static HealthObservation.Diagnostic diag(String id, List<String> flags, List<String> affected, String impact) {
        HealthObservation.Diagnostic d = new HealthObservation.Diagnostic();
        d.diagnosticId = id; d.nativeCode = id; d.flags = new java.util.ArrayList<>(flags);
        d.affectedVariableIds = new java.util.ArrayList<>(affected); d.measurementImpact = impact; d.firstObservedAtMs = T0;
        return d;
    }

    @Test
    public void aSnapshotOpensAnIntervalAtItsObservedTimeAndANewerStateClosesIt() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        List<DeviceStateMachine.Transition> t1 = m.apply(snapshot(T0, T0, 1, 0, true, Arrays.asList("F"), "VERIFIED", "INVALID"), T0 + 1000);
        assertEquals(1, t1.size());
        assertEquals("OPEN", t1.get(0).kind);
        HealthInterval open = t1.get(0).interval;
        assertEquals(T0, open.fromMs);
        assertNull(open.toMs);
        assertEquals(Collections.singletonList("F"), open.activeFlags);
        assertEquals("VERIFIED", open.collectionState);

        List<DeviceStateMachine.Transition> t2 = m.apply(snapshot(T0 + 5 * MIN, T0 + 5 * MIN, 1, 1, true, Collections.emptyList(), "VERIFIED", "VALID"), T0 + 5 * MIN + 1000);
        assertEquals(2, t2.size());
        assertEquals("CLOSE", t2.get(0).kind);
        assertEquals(Long.valueOf(T0 + 5 * MIN), t2.get(0).interval.toMs);
        assertEquals("NEWER_STATE", t2.get(0).interval.boundaryKind);
        assertEquals("OPEN", t2.get(1).kind);
        assertTrue(t2.get(1).interval.activeFlags.isEmpty());
        assertEquals(HealthInterval.NO_ACTIVE_DIAGNOSTIC, t2.get(1).interval.healthStateId);
    }

    @Test
    public void nr037AClearNeedsACompleteVerifiedEmptyState() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        m.apply(snapshot(T0, T0, 1, 0, true, Arrays.asList("F"), "VERIFIED", "INVALID"), T0 + 1000);
        // an INCOMPLETE empty state is not a clear: the flags are retained, impact UNKNOWN
        List<DeviceStateMachine.Transition> t = m.apply(snapshot(T0 + MIN, T0 + MIN, 1, 1, false, Collections.emptyList(), "VERIFIED", "UNKNOWN"), T0 + MIN + 1000);
        HealthInterval cur = m.current();
        assertEquals(Collections.singletonList("F"), cur.activeFlags);
        assertEquals("UNKNOWN", cur.measurementImpact);
        assertFalse(HealthInterval.NO_ACTIVE_DIAGNOSTIC.equals(cur.healthStateId));
        // a complete verified empty state clears
        m.apply(snapshot(T0 + 2 * MIN, T0 + 2 * MIN, 1, 2, true, Collections.emptyList(), "VERIFIED", "VALID"), T0 + 2 * MIN + 1000);
        assertEquals(HealthInterval.NO_ACTIVE_DIAGNOSTIC, m.current().healthStateId);
    }

    @Test
    public void nr038AStaleRetainedSnapshotIsStaleNotAFreshClearAndFreshnessExpiryClosesAnInterval() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        // verified two hours before it was applied: retained old data delivered fresh
        long verified = T0 - 2 * 3600_000L;
        m.apply(snapshot(verified, verified, 1, 0, true, Collections.emptyList(), "VERIFIED", "VALID"), T0);
        assertEquals("STALE", m.current().collectionState);
        assertFalse(HealthInterval.NO_ACTIVE_DIAGNOSTIC.equals(m.current().healthStateId));

        DeviceStateMachine m2 = new DeviceStateMachine(2 * MIN);
        m2.apply(snapshot(T0, T0, 1, 0, true, Arrays.asList("M"), "VERIFIED", "VALID"), T0 + 1000);
        assertTrue(m2.onTimer(T0 + MIN).isEmpty());                          // within 3 x 30 s? no: 2 min site minimum
        List<DeviceStateMachine.Transition> exp = m2.onTimer(T0 + 3 * MIN);
        assertEquals(2, exp.size());
        assertEquals("FRESHNESS_EXPIRED", exp.get(0).interval.boundaryKind);
        assertEquals("STALE", m2.current().collectionState);
        assertEquals(Collections.singletonList("M"), m2.current().activeFlags);   // last observed status retained
    }

    @Test
    public void nr040AnOldSequenceOrOldEpochNeverOverwritesNewerStateAndANewEpochNeedsASnapshot() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        m.apply(snapshot(T0, T0, 2, 5, true, Arrays.asList("S"), "VERIFIED", "DEGRADED"), T0 + 1000);
        assertTrue(m.apply(snapshot(T0 + MIN, T0 + MIN, 2, 3, true, Collections.emptyList(), "VERIFIED", "VALID"), T0 + MIN).isEmpty());
        assertEquals(Collections.singletonList("S"), m.current().activeFlags);
        assertTrue(m.apply(snapshot(T0 + MIN, T0 + MIN, 1, 99, true, Collections.emptyList(), "VERIFIED", "VALID"), T0 + MIN).isEmpty());
        assertEquals(Collections.singletonList("S"), m.current().activeFlags);
        // an event of a newer epoch without that epoch's snapshot is ignored
        HealthObservation ev = event(snapshot(T0 + 2 * MIN, T0 + 2 * MIN, 3, 0, true, Collections.emptyList(), "VERIFIED", "VALID"), 3, 0, "STATE_RESYNC", null);
        assertTrue(m.apply(ev, T0 + 2 * MIN).isEmpty());
        // the snapshot of epoch 3 supersedes
        assertEquals(2, m.apply(snapshot(T0 + 3 * MIN, T0 + 3 * MIN, 3, 1, true, Collections.emptyList(), "VERIFIED", "VALID"), T0 + 3 * MIN).size());
        assertEquals(HealthInterval.NO_ACTIVE_DIAGNOSTIC, m.current().healthStateId);
    }

    @Test
    public void nr042AVariableSpecificFaultCarriesItsAffectedVariables() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        HealthObservation o = snapshot(T0, T0, 1, 0, true, Arrays.asList("F"), "VERIFIED", "INVALID");
        o.diagnostics.add(diag("occ-1", Collections.singletonList("F"), Collections.singletonList("FIC1.PV"), "INVALID"));
        m.apply(o, T0 + 1000);
        assertEquals(Collections.singletonList("FIC1.PV"), m.current().affectedVariableIds);
    }

    @Test
    public void sourceOfflineClosesTheIntervalAndTheNextSnapshotReopens() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        m.apply(snapshot(T0, T0, 1, 0, true, Arrays.asList("M"), "VERIFIED", "VALID"), T0 + 1000);
        List<DeviceStateMachine.Transition> off = m.sourceOffline(T0 + MIN);
        assertEquals("SOURCE_OFFLINE", off.get(0).interval.boundaryKind);
        assertEquals("OFFLINE", m.current().collectionState);
        assertEquals(Collections.singletonList("M"), m.current().activeFlags);
        m.apply(snapshot(T0 + 2 * MIN, T0 + 2 * MIN, 1, 1, true, Arrays.asList("M"), "VERIFIED", "VALID"), T0 + 2 * MIN);
        assertEquals("VERIFIED", m.current().collectionState);
    }

    @Test
    public void nr045ALateCorrectionIsARevisionThatKeepsTheOriginalBeliefAndDoesNotMoveTheCurrentState() {
        DeviceStateMachine m = new DeviceStateMachine(2 * MIN);
        m.apply(snapshot(T0, T0, 1, 0, true, Collections.emptyList(), "VERIFIED", "VALID"), T0);
        m.apply(snapshot(T0 + 10 * MIN, T0 + 10 * MIN, 1, 1, true, Arrays.asList("F"), "VERIFIED", "INVALID"), T0 + 10 * MIN);
        // the source later says the failure actually began at T0 + 4 min
        HealthObservation corr = event(snapshot(T0 + 4 * MIN, T0 + 11 * MIN, 1, 2, true, Arrays.asList("F"), "VERIFIED", "INVALID"), 1, 2, "LATE_CORRECTION", "obs-" + (T0 + 10 * MIN) + "-1");
        List<DeviceStateMachine.Transition> t = m.apply(corr, T0 + 11 * MIN);
        assertEquals(1, t.size());
        assertEquals("REVISION", t.get(0).kind);
        assertEquals(2, t.get(0).interval.revision);
        assertEquals(T0 + 4 * MIN, t.get(0).interval.fromMs);
        assertEquals(Collections.singletonList("F"), t.get(0).interval.activeFlags);
        // the live state is unchanged: still the F interval that began at T0 + 10 min, revision 1
        assertEquals(T0 + 10 * MIN, m.current().fromMs);
        assertEquals(1, m.current().revision);
    }
}
