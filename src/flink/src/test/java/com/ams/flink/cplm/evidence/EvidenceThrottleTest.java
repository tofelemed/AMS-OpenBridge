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
    @Test public void changedSignatureEmitsAtOnce() { assertTrue(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|W|P|P|P", 1, H)); }
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
    // CHG-049 (final review M1/M2): a window the policy does not emit clears its state, so a finding that comes back emits at once
    @Test public void policySkipClearsState() {
        assertEquals(EvidenceThrottle.Action.CLEAR, EvidenceThrottle.action(false, "W|P|P|P|P", 0L, "P|P|P|P|P", 1, H));
        assertEquals(EvidenceThrottle.Action.CLEAR, EvidenceThrottle.action(false, null, null, "P|P|P|P|P", 1, H));
    }
    @Test public void findingReturningAfterPassEmitsAtOnce() {
        // W emitted at 0; the PASS at 15 min is not emitted by the policy -> CLEAR; the W at 30 min sees no state
        assertEquals(EvidenceThrottle.Action.EMIT, EvidenceThrottle.action(true, null, null, "W|P|P|P|P", 30 * 60_000L, H));
        assertEquals("without M1 it would be throttled", EvidenceThrottle.Action.SKIP, EvidenceThrottle.action(true, "W|P|P|P|P", 0L, "W|P|P|P|P", 30 * 60_000L, H));
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
