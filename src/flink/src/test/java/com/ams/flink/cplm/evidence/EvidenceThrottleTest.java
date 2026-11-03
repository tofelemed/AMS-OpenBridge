package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

/** CHG-049: the long tier's per-loop, per-window-kind emission throttle. */
public class EvidenceThrottleTest {
    private static final long H = 3_600_000L;

    @Test public void firstEverEmits() { assertTrue(EvidenceThrottle.due(null, null, "W|P|P|P|P", 0, H)); }
    @Test public void sameSignatureInsideIntervalIsSuppressed() { assertFalse(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|P|P|P|P", H - 1, H)); }
    @Test public void sameSignatureAfterIntervalEmits() { assertTrue(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|P|P|P|P", H, H)); }
    // CHG-102 5a: a changed signature no longer bypasses the interval (the plant's W/F flapping emitted ~1.8x per loop-hour)
    @Test public void changedSignatureWaitsForTheInterval() {
        assertFalse(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|W|P|P|P", 1, H));
        assertTrue(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|W|P|P|P", H, H));
    }
    @Test public void clearedSignatureWithKeptTimeStillThrottles() { assertFalse(EvidenceThrottle.due(null, 0L, "W|P|P|P|P", H - 1, H)); }
    @Test public void zeroIntervalNeverThrottles() { assertTrue(EvidenceThrottle.due("a", 5L, "a", 5, 0)); }

    @Test public void signatureJoinsGates7To11() {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.gate7Status = "WARN"; r.gate8Status = "PASS"; r.gate9Status = "FAIL"; r.gate10Status = "PASS"; r.gate11Status = "PENDING";
        assertEquals("WARN|PASS|FAIL|PASS|PENDING", EvidenceThrottle.signature(r));
    }

    /** Review Focus 3: state is keyed by window kind, so a 4h emission never suppresses the 24h one. */
    @Test public void emissionOf4hDoesNotSuppress24h() {
        Map<String, String> sigs = new HashMap<>();
        Map<String, Long> times = new HashMap<>();
        String sig = "W|P|P|P|P";
        assertTrue(EvidenceThrottle.due(sigs.get("4h"), times.get("4h"), sig, 0, H));
        sigs.put("4h", sig); times.put("4h", 0L);
        assertTrue("24h has its own state", EvidenceThrottle.due(sigs.get("24h"), times.get("24h"), sig, 1000, H));
        assertFalse("4h is throttled", EvidenceThrottle.due(sigs.get("4h"), times.get("4h"), sig, 1000, H));
    }

    @Test public void policyParsesMinIntervalInAnyOrder() {
        EvidencePolicy p = EvidencePolicy.fromArgs(new String[]{"--evidence-min-interval-min", "5", "--evidence-max-cycles", "7", "--evidence-emit", "all"});
        assertEquals(5 * 60_000L, p.minIntervalMs);
        assertEquals(7, p.maxCycles);
        assertEquals(EvidencePolicy.Mode.ALL, p.mode);
        assertEquals(3_600_000L, EvidencePolicy.fromArgs(new String[0]).minIntervalMs);
        assertEquals(3_600_000L, EvidencePolicy.fromArgs(new String[]{"--evidence-min-interval-min", "x"}).minIntervalMs);
        assertEquals(0L, EvidencePolicy.fromArgs(new String[]{"--evidence-min-interval-min", "0"}).minIntervalMs);
        assertEquals(3_600_000L, new EvidencePolicy(EvidencePolicy.Mode.NONE, 3).minIntervalMs);
    }
    // CHG-049 (M1) / CHG-102 5a: a window the policy does not emit returns CLEAR (the jobs drop the signature, keep the time)
    @Test public void policySkipClearsState() {
        assertEquals(EvidenceThrottle.Action.CLEAR, EvidenceThrottle.action(false, "W|P|P|P|P", 0L, "P|P|P|P|P", 1, H));
        assertEquals(EvidenceThrottle.Action.CLEAR, EvidenceThrottle.action(false, null, null, "P|P|P|P|P", 1, H));
    }
    // CHG-102 5a: CLEAR drops only the signature, so a finding returning after a PASS waits for the interval
    @Test public void findingReturningAfterPassWaitsForTheInterval() {
        // W emitted at 0; the PASS at 15 min clears the signature but keeps t=0; the W at 30 min is throttled
        assertEquals(EvidenceThrottle.Action.SKIP, EvidenceThrottle.action(true, null, 0L, "W|P|P|P|P", 30 * 60_000L, H));
        assertEquals(EvidenceThrottle.Action.EMIT, EvidenceThrottle.action(true, null, 0L, "W|P|P|P|P", H, H));
        assertEquals("never emitted: at once", EvidenceThrottle.Action.EMIT, EvidenceThrottle.action(true, null, null, "W|P|P|P|P", 1, H));
    }

    /** Replays the jobs' state handling (CLEAR keeps the time) over a sequence of 15-min windows; returns emission times. */
    private static java.util.List<Long> run(String[] sigs, boolean[] policyEmits, boolean[] boundary) {
        java.util.List<Long> emitted = new java.util.ArrayList<>();
        String sig = null; Long ms = null;
        for (int i = 0; i < sigs.length; i++) {
            long now = i * 15 * 60_000L;
            EvidenceThrottle.Action a = EvidenceThrottle.action(boundary != null && boundary[i], policyEmits[i], sig, ms, sigs[i], now, H);
            if (a == EvidenceThrottle.Action.CLEAR) { sig = null; continue; }
            if (a == EvidenceThrottle.Action.SKIP) continue;
            emitted.add(now); sig = sigs[i]; ms = now;
        }
        return emitted;
    }

    @Test public void flappingWarnFailEmitsAtMostOncePerHour() {
        int n = 4 * 6;   // six hours of 15-min windows: W,F,W,F,...
        String[] sigs = new String[n]; boolean[] emits = new boolean[n];
        for (int i = 0; i < n; i++) { sigs[i] = (i % 2 == 0 ? "WARN" : "FAIL") + "|PASS|PASS|PASS|PASS"; emits[i] = true; }
        java.util.List<Long> out = run(sigs, emits, null);
        assertEquals(java.util.Arrays.asList(0L, H, 2 * H, 3 * H, 4 * H, 5 * H), out);
        for (int i = 1; i < out.size(); i++) assertTrue(out.get(i) - out.get(i - 1) >= H);
    }

    @Test public void flappingFindingAndPassEmitsAtMostOncePerHour() {
        int n = 4 * 6;   // W, PASS, W, PASS: the PASS windows are not emitted (CLEAR)
        String[] sigs = new String[n]; boolean[] emits = new boolean[n];
        for (int i = 0; i < n; i++) { emits[i] = i % 2 == 0; sigs[i] = (emits[i] ? "WARN" : "PASS") + "|PASS|PASS|PASS|PASS"; }
        assertEquals(java.util.Arrays.asList(0L, H, 2 * H, 3 * H, 4 * H, 5 * H), run(sigs, emits, null));
    }

    @Test public void boundaryEmitsEvenWhenThrottledAndRestartsTheInterval() {
        String[] sigs = new String[8]; boolean[] emits = new boolean[8]; boolean[] b = new boolean[8];
        java.util.Arrays.fill(sigs, "W|P|P|P|P"); java.util.Arrays.fill(emits, true);
        b[2] = true;                                   // 30 min: a plant boundary, inside the interval of the 0-min emission
        emits[3] = false;                              // a PASS boundary still emits; this one is a plain PASS
        assertEquals(java.util.Arrays.asList(0L, 30 * 60_000L, 90 * 60_000L), run(sigs, emits, b));
        assertEquals(EvidenceThrottle.Action.BOUNDARY, EvidenceThrottle.action(true, false, "x", 0L, "x", 1, H));
    }

    @Test public void stateRecordedOnlyWhenSomethingWasOutput() {
        assertFalse(EvidenceThrottle.recordsState(0));
        assertTrue(EvidenceThrottle.recordsState(1));
    }
    // CHG-049 (Task 10): fusion signature
    @Test public void fusionSignatureIsDiagnosisFamilyG14G15() {
        com.ams.flink.cplm.CplmGateResult r = new com.ams.flink.cplm.CplmGateResult();
        r.diagnosis = "SUSPECTED_OSCILLATION"; r.selectedFamily = "OSC"; r.gate14Status = "WARN"; r.gate15Status = "SUSPECTED";
        assertEquals("SUSPECTED_OSCILLATION|OSC|WARN|SUSPECTED", EvidenceThrottle.signature(r));
    }
}
