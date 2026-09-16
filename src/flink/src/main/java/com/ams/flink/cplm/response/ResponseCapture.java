package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.event.CaptureStateMachine;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.event.ResponseEventDetector;
import com.ams.flink.cplm.response.metrics.EventDataset;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Per-loop capture state for G12 (spec §2.4), serialisable so it lives in Flink keyed state. Keeps
 * a bounded ring of recent samples (pre-support + capture), detects reference and applied-input
 * events on the ring, drives the {@link CaptureStateMachine} with the segmentation triggers
 * (mode transfer, source gap, health ineligibility) and closes a capture when the output has been
 * stable for the tail dwell or the maximum duration guard fires. Every closed capture is handed
 * out as a {@link Closed} bundle; nothing is estimated here.
 */
public final class ResponseCapture implements Serializable {
    private static final long serialVersionUID = 1L;

    /** A capture that ended, with everything the evaluator needs. */
    public static final class Closed implements Serializable {
        private static final long serialVersionUID = 1L;
        public final ResponseEvent event;
        public final EventDataset data;
        public final double u0, r0, r1;
        public final Double duApplied;
        public final String pathReason;
        public final boolean uAppliedAvailable;

        Closed(ResponseEvent event, EventDataset data, double u0, double r0, double r1, Double duApplied, String pathReason, boolean uAppliedAvailable) {
            this.event = event;
            this.data = data;
            this.u0 = u0;
            this.r0 = r0;
            this.r1 = r1;
            this.duApplied = duApplied;
            this.pathReason = pathReason;
            this.uAppliedAvailable = uAppliedAvailable;
        }
    }

    private final ResponseJobConfig cfg;
    private final String loopId;
    private final String bundleHash;
    private final List<double[]> ring = new ArrayList<>();          // [tS, pv, sp, uApplied, valid(1/0), modeAuto(1/0)]
    private final CaptureStateMachine machine;
    private final double retainedS;
    private double lastTs = Double.NaN;
    private String lastMode = null;
    private String commandPath = "OP_TO_VALVE";
    private boolean healthIneligible;
    private boolean vpMappedAtCapture;
    private Boolean lastVpUsable;
    private double lastEventT0 = Double.NaN;

    public ResponseCapture(String loopId, ResponseJobConfig cfg) {
        this.loopId = loopId;
        this.cfg = cfg;
        this.bundleHash = cfg.bundleHash();
        this.machine = new CaptureStateMachine(cfg.preSupportS, cfg.minCaptureS, cfg.maxCaptureS);
        this.retainedS = cfg.preSupportS + cfg.maxCaptureS + cfg.tailDwellS;
    }

    public CaptureStateMachine machine() { return machine; }

    public void setCommandPath(String commandPath) { this.commandPath = commandPath == null ? "UNKNOWN" : commandPath; }

    /** Called when the loop's PV instrument becomes INELIGIBLE / recovers (from the health context stream). */
    public List<Closed> onHealth(boolean ineligible, double atS) {
        this.healthIneligible = ineligible;
        if (ineligible && machine.open() != null) {
            machine.onHealthIneligible(atS);
            return closeLast();
        }
        return Collections.emptyList();
    }

    /**
     * One accepted sample; returns the captures closed by it (usually none). {@code vpUsable} says whether
     * VP is evidence for THIS sample (mapped, good, not held past vp_max_age_s): then VP is the applied
     * input, otherwise OP is (spec §2.3, §2.7).
     */
    public List<Closed> onSample(CplmNormalizedSample s, boolean vpUsable) {
        double tS = s.eventTsMs / 1000.0;
        boolean auto = s.isAutoMode();
        boolean good = s.isGoodQuality() && Double.isFinite(s.pv) && Double.isFinite(s.sp) && Double.isFinite(s.op);
        boolean vpMapped = vpUsable && s.vp != null && Double.isFinite(s.vp);
        double uApplied = vpMapped ? s.vp : s.op;
        List<Closed> closed = new ArrayList<>();
        boolean timeGap = !Double.isNaN(lastTs) && tS - lastTs > cfg.maxGapS;
        // the applied input changing source (VP going stale, or a stale VP coming back) is a gap in the
        // applied-input support: samples on either side of it are not one series, so it is treated like one
        boolean inputSourceChange = lastVpUsable != null && lastVpUsable.booleanValue() != vpMapped;
        boolean gap = timeGap || inputSourceChange;

        // segmentation triggers on the open capture (the gap is judged BEFORE the new sample joins the ring)
        if (machine.open() != null) {
            if (gap) {
                machine.onSourceGap(lastTs);
                closed.addAll(closeLast());
            } else if (lastMode != null && auto != "AUT".equals(lastMode) && !auto) {
                machine.onModeTransfer(tS);
                closed.addAll(closeLast());
            }
        }
        // a gap longer than maxGapS is a break in support (spec §2.7): samples before it can neither be
        // pre-support for a new event nor be bridged into one, so the ring restarts after it
        if (gap) {
            ring.clear();
            lastEventT0 = Double.NaN;
        }
        ring.add(new double[] {tS, s.pv, s.sp, uApplied, good ? 1 : 0, auto ? 1 : 0});
        evict(tS);
        lastTs = tS;
        lastMode = auto ? "AUT" : "MAN";
        lastVpUsable = vpMapped;
        if (healthIneligible) return closed;

        if (machine.open() == null) {
            if (auto && good) detect(vpMapped, tS);                              // no authority, no capture (spec §2.4)
        } else {
            machine.onSample(tS);
            if (machine.state() == CaptureStateMachine.State.CENSORED) {
                closed.addAll(closeLast());
            } else if (settled(tS)) {
                machine.qualified(tS);
                if (machine.state() == CaptureStateMachine.State.QUALIFIED) {
                    machine.complete(tS);
                    closed.addAll(closeLast());
                } else {
                    closed.addAll(closeLast());
                }
            }
        }
        return closed;
    }

    private void detect(boolean vpMapped, double nowS) {
        int n = ring.size();
        if (n < 4) return;
        int from = 0;
        while (from < n - 1 && nowS - ring.get(from)[0] > cfg.preSupportS + cfg.eventDwellS) from++;
        int m = n - from;
        if (m < 4) return;
        double[] t = new double[m], sp = new double[m], u = new double[m];
        boolean[] valid = new boolean[m];
        for (int i = 0; i < m; i++) {
            double[] row = ring.get(from + i);
            t[i] = row[0];
            sp[i] = row[2];
            u[i] = row[3];
            valid[i] = row[4] > 0 && row[5] > 0;
        }
        ResponseEventDetector.Settings ds = detectorSettings();
        ResponseEventDetector.Candidate ref = ResponseEventDetector.detect(t, sp, valid, ds);
        if (ref != null && !Double.isNaN(lastEventT0) && t[ref.index] <= lastEventT0) ref = null;   // already captured
        ResponseEventDetector.Candidate inp = ref == null ? ResponseEventDetector.detect(t, u, valid, ds) : null;
        if (inp != null && !Double.isNaN(lastEventT0) && t[inp.index] <= lastEventT0) inp = null;
        ResponseEventDetector.Candidate c = ref != null ? ref : inp;
        if (c == null) return;
        boolean isReference = ref != null;
        double t0 = t[c.index];
        EventType type = isReference ? (c.type == EventType.RAMP_TRACKING ? EventType.RAMP_TRACKING : EventType.SERVO_STEP)
                : EventType.INPUT_TEST;
        String pathId = InputPathResolver.resolve(commandPath, vpMapped, false).path.name();
        double pre = isReference ? sp[c.index - 1] : u[c.index - 1];
        double post = isReference ? sp[c.index] : u[c.index];
        ResponseEvent e = new ResponseEvent(ResponseEvent.idFor(loopId, (long) (t0 * 1000), type, bundleHash), loopId, type, pathId,
                t0 * 1000, pre, post, Collections.singletonList(new double[] {t0 * 1000, post}));
        lastEventT0 = t0;
        vpMappedAtCapture = vpMapped;
        machine.onCandidate(e, t0);
        machine.onSample(nowS);
    }

    /**
     * The capture may close as settled only when the tail is BOTH a stable endpoint support (range within
     * stableBandEu over tailDwellS, spec §2.5 endpoints) AND inside the settle band around that endpoint for the
     * whole tail dwell - the same B_resp = max(abs, rel x |dy|, noise floor) the metric uses. Closing on the range
     * test alone left settle_response right-censored on captures the job itself had declared settled (lab, 2B).
     */
    private boolean settled(double nowS) {
        ResponseEvent e = machine.open();
        if (e == null) return false;
        double t0 = e.t0Ms / 1000.0;
        if (nowS - t0 < cfg.minCaptureS) return false;
        double from = nowS - cfg.tailDwellS;
        List<Double> tail = new ArrayList<>();
        for (int i = ring.size() - 1; i >= 0; i--) {
            double[] row = ring.get(i);
            if (row[0] < from) break;
            if (row[4] == 0) continue;
            tail.add(row[1]);
        }
        if (tail.size() < 3) return false;
        double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
        for (double v : tail) {
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
        if (max - min > cfg.stableBandEu) return false;
        double yss = median(tail);
        List<Double> pre = new ArrayList<>();
        for (double[] row : ring) if (row[0] >= t0 - cfg.preSupportS && row[0] < t0 && row[4] > 0) pre.add(row[1]);
        double dy = pre.size() >= 3 ? yss - median(pre) : 0;
        double band = com.ams.flink.cplm.response.metrics.Settling.responseBand(cfg.absSettlingBandEu, cfg.relSettlingBand, dy, cfg.noiseFloorEu);
        for (double v : tail) if (Math.abs(v - yss) > band) return false;
        return true;
    }

    private static double median(List<Double> vals) {
        List<Double> s = new ArrayList<>(vals);
        java.util.Collections.sort(s);
        int n = s.size();
        return n % 2 == 1 ? s.get(n / 2) : 0.5 * (s.get(n / 2 - 1) + s.get(n / 2));
    }

    private List<Closed> closeLast() {
        List<ResponseEvent> events = machine.events();
        if (events.isEmpty()) return Collections.emptyList();
        ResponseEvent e = events.get(events.size() - 1);
        if (Double.isNaN(e.tEndMs)) return Collections.emptyList();
        double t0 = e.t0Ms / 1000.0, tEnd = e.tEndMs / 1000.0, from = t0 - cfg.preSupportS;
        List<double[]> rows = new ArrayList<>();
        for (double[] row : ring) if (row[0] >= from && row[0] <= tEnd) rows.add(row);
        if (rows.size() < 4) return Collections.emptyList();
        int m = rows.size();
        double[] t = new double[m], y = new double[m], r = new double[m], u = new double[m];
        boolean[] v = new boolean[m];
        double u0 = Double.NaN, r0 = Double.NaN, r1 = Double.NaN;
        for (int i = 0; i < m; i++) {
            double[] row = rows.get(i);
            t[i] = row[0];
            y[i] = row[1];
            r[i] = row[2];
            u[i] = row[3];
            v[i] = row[4] > 0 && row[5] > 0;
            if (row[0] < t0 && v[i]) {
                u0 = row[3];
                r0 = row[2];
            }
            if (v[i]) r1 = row[2];
        }
        if (Double.isNaN(u0)) u0 = u[0];
        if (Double.isNaN(r0)) r0 = r[0];
        if (Double.isNaN(r1)) r1 = r[m - 1];
        InputPathResolver.Resolution res = InputPathResolver.resolve(commandPath, vpMappedAtCapture, false);
        Double du = e.type == EventType.INPUT_TEST ? e.postAmplitude - e.preAmplitude : null;
        EventDataset d = new EventDataset(t, y, r, u, v, t0, tEnd);
        return Collections.singletonList(new Closed(e, d, u0, r0, r1, du, res.reason, res.uAppliedAvailable));
    }

    private void evict(double nowS) {
        while (!ring.isEmpty() && nowS - ring.get(0)[0] > retainedS) ring.remove(0);
    }

    private ResponseEventDetector.Settings detectorSettings() {
        ResponseEventDetector.Settings s = new ResponseEventDetector.Settings();
        s.stepMinInputEu = cfg.stepMinInputEu;
        s.stepMinSpanFraction = cfg.stepMinSpanFraction;
        s.span = cfg.fallbackSpanEu;
        s.noiseMultiplier = cfg.noiseMultiplier;
        s.preSupportS = cfg.preSupportS;
        s.eventDwellS = cfg.eventDwellS;
        s.rampMinSlopeEuPerS = cfg.rampMinSlopeEuPerS;
        s.rampMinDurationS = cfg.rampMinDurationS;
        return s;
    }
}
