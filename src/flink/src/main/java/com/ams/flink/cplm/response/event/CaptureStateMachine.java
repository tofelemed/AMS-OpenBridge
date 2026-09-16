package com.ams.flink.cplm.response.event;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * IDLE -> CANDIDATE -> CAPTURING -> QUALIFIED -> ESTIMATING -> CANDIDATE_MODEL -> VALIDATING -> COMPLETE,
 * or REJECTED / CENSORED (spec §2.4). Segmentation triggers censor the open capture with a named
 * reason and, for a new event, start the next capture with the real input sequence carried over.
 * The maximum-duration guard censors (CAPTURE_MAX); nothing is ever truncated silently (NR-017).
 */
public final class CaptureStateMachine {
    public enum State { IDLE, CANDIDATE, CAPTURING, QUALIFIED, ESTIMATING, CANDIDATE_MODEL, VALIDATING, COMPLETE, REJECTED, CENSORED }

    private final double preSupportS, minCaptureS, maxCaptureS;
    private final List<ResponseEvent> events = new ArrayList<>();
    private State state = State.IDLE;
    private String reason = "";
    private ResponseEvent open;

    public CaptureStateMachine(double preSupportS, double minCaptureS, double maxCaptureS) {
        this.preSupportS = preSupportS;
        this.minCaptureS = minCaptureS;
        this.maxCaptureS = maxCaptureS;
    }

    public State state() { return state; }

    public String reason() { return reason; }

    public double preSupportS() { return preSupportS; }

    public List<ResponseEvent> events() { return Collections.unmodifiableList(events); }

    public ResponseEvent open() { return open; }

    public void onCandidate(ResponseEvent e, double atS) {
        if (open != null) {
            onNewEvent(e, atS);
            return;
        }
        open = e;
        e.captureState = "CANDIDATE";
        events.add(e);
        state = State.CANDIDATE;
        reason = "";
    }

    public void onSample(double atS) {
        if (open == null) return;
        double elapsed = atS - open.t0Ms / 1000.0;
        if (elapsed > maxCaptureS) {
            censor("CAPTURE_MAX", atS);
            return;
        }
        if (state == State.CANDIDATE && elapsed >= 0) {
            state = State.CAPTURING;
            open.captureState = "CAPTURING";
        }
    }

    public void onNewEvent(ResponseEvent next, double atS) {
        List<double[]> carried = new ArrayList<>();
        if (open != null) {
            carried.addAll(open.inputSequence);
            censor("SUPERSEDED_BY_EVENT", atS);
        }
        for (double[] change : next.inputSequence) {
            boolean known = false;
            for (double[] c : carried) if (c[0] == change[0]) { known = true; break; }
            if (!known) carried.add(change);
        }
        ResponseEvent merged = new ResponseEvent(next.eventId, next.loopId, next.type, next.pathId, next.t0Ms, next.preAmplitude, next.postAmplitude, carried);
        open = merged;
        merged.captureState = "CAPTURING";
        events.add(merged);
        state = State.CAPTURING;
        reason = "";
    }

    public void onModeTransfer(double atS) { censor("MODE_TRANSFER", atS); }

    public void onSourceGap(double atS) { censor("SOURCE_GAP", atS); }

    public void onHealthIneligible(double atS) { censor("HEALTH_INELIGIBLE", atS); }

    public void onBindingOrConfigChange(double atS) { censor("CONTEXT_CHANGED", atS); }

    public void onRegionExit(double atS) { censor("REGION_EXIT", atS); }

    public void onActuatorConstraint(double atS) { censor("ACTUATOR_CONSTRAINT", atS); }

    public void qualified(double atS) {
        requireOpen();
        if (atS - open.t0Ms / 1000.0 < minCaptureS) {
            reject("CAPTURE_TOO_SHORT", atS);
            return;
        }
        state = State.QUALIFIED;
        open.captureState = "QUALIFIED";
    }

    public void estimating() {
        requireOpen();
        state = State.ESTIMATING;
        open.captureState = "ESTIMATING";
    }

    public void candidateModel() {
        requireOpen();
        state = State.CANDIDATE_MODEL;
        open.captureState = "CANDIDATE_MODEL";
    }

    public void validating() {
        requireOpen();
        state = State.VALIDATING;
        open.captureState = "VALIDATING";
    }

    public void complete(double atS) {
        requireOpen();
        open.tEndMs = atS * 1000.0;
        open.captureState = "COMPLETE";
        state = State.COMPLETE;
        open = null;
    }

    public void reject(String why, double atS) {
        requireOpen();
        open.tEndMs = atS * 1000.0;
        open.captureState = "REJECTED";
        open.censorReason = why;
        state = State.REJECTED;
        reason = why;
        open = null;
    }

    private void censor(String why, double atS) {
        if (open == null) return;
        open.tEndMs = atS * 1000.0;
        open.captureState = "CENSORED";
        open.censorReason = why;
        state = State.CENSORED;
        reason = why;
        open = null;
    }

    private void requireOpen() {
        if (open == null) throw new IllegalStateException("no open capture");
    }
}
