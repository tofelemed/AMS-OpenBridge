package com.ams.flink.cplm.response.event;

import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.fail;

public class CaptureStateMachineTest {
    private static ResponseEvent step(String loop, double t0S) {
        return new ResponseEvent(ResponseEvent.idFor(loop, (long) (t0S * 1000), EventType.SERVO_STEP, "profile:abc"), loop, EventType.SERVO_STEP, "OP_TO_PV",
                t0S * 1000, 100, 115, Collections.singletonList(new double[] {t0S * 1000, 115}));
    }

    @Test
    public void aSecondStepCensorsTheFirstAndKeepsBothRecords() {              // NR-007
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("FIC10302", 100), 100);
        m.onSample(120);
        assertEquals(CaptureStateMachine.State.CAPTURING, m.state());
        m.onNewEvent(step("FIC10302", 130), 130);
        assertEquals(2, m.events().size());
        ResponseEvent first = m.events().get(0), second = m.events().get(1);
        assertEquals("CENSORED", first.captureState);
        assertEquals("SUPERSEDED_BY_EVENT", first.censorReason);
        assertEquals(130 * 1000, first.tEndMs, 1e-9);
        assertEquals(CaptureStateMachine.State.CAPTURING, m.state());
        assertEquals(2, second.inputSequence.size());                          // the real input sequence is preserved
        assertEquals(130 * 1000, second.inputSequence.get(1)[0], 1e-9);
    }

    @Test
    public void modeTransferAndHealthIneligibilityCensorWithTheirReasons() {   // NR-043 (health), mode transfer
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("L", 0), 0);
        m.onModeTransfer(30);
        assertEquals(CaptureStateMachine.State.CENSORED, m.state());
        assertEquals("MODE_TRANSFER", m.events().get(0).censorReason);

        CaptureStateMachine h = new CaptureStateMachine(60, 120, 3600);
        h.onCandidate(step("L", 0), 0);
        h.onHealthIneligible(45);
        assertEquals("HEALTH_INELIGIBLE", h.events().get(0).censorReason);
    }

    @Test
    public void theMaximumCaptureGuardCensorsAndNeverTruncatesSilently() {     // NR-017
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("TIC", 0), 0);
        m.onSample(3599);
        assertEquals(CaptureStateMachine.State.CAPTURING, m.state());
        m.onSample(3601);
        assertEquals(CaptureStateMachine.State.CENSORED, m.state());
        assertEquals("CAPTURE_MAX", m.events().get(0).censorReason);
    }

    @Test
    public void theHappyPathReachesCompleteOnlyThroughQualification() {
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("L", 0), 0);
        m.onSample(200);
        m.qualified(200);
        assertEquals(CaptureStateMachine.State.QUALIFIED, m.state());
        m.complete(300);
        assertEquals(CaptureStateMachine.State.COMPLETE, m.state());
        assertEquals("COMPLETE", m.events().get(0).captureState);
        try {
            new CaptureStateMachine(60, 120, 3600).complete(10);
            fail("COMPLETE without an event is illegal");
        } catch (IllegalStateException expected) {
            // no open capture
        }
    }

    @Test
    public void eventIdsAreDeterministic() {
        assertEquals(ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "b"), ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "b"));
        assertNotEquals(ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "b"), ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "c"));
    }

    @Test
    public void inputPathsRequireAnAppliedInput() {
        InputPathResolver.Resolution r = InputPathResolver.resolve("OP_TO_SLAVE_SP", false, false);
        assertEquals(InputPathResolver.Path.SLAVE_SP_TO_PV, r.path);
        assertFalse("a cascade master OP is not a valve command", r.uAppliedAvailable);
        assertEquals(InputPathResolver.Path.VP_TO_PV, InputPathResolver.resolve("OP_TO_VALVE", true, false).path);
        assertEquals(InputPathResolver.Path.EXOGENOUS_TEST, InputPathResolver.resolve("OP_TO_VALVE", true, true).path);
        assertFalse(InputPathResolver.resolve("UNKNOWN", false, false).uAppliedAvailable);
    }
}
