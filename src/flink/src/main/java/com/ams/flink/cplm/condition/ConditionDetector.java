package com.ams.flink.cplm.condition;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.engine.LimitMath;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-loop fast condition state machine (v2.5 Task 1D.4, spec v6 R11/R08). Pure and
 * serialisable so it lives in Flink keyed state and is unit-tested without a harness.
 *
 * <ul>
 * <li><b>G11 FREEZE</b>: a run of adjacent PV samples differing by at most
 * {@code freezeToleranceEu} (0 = exact) opens once its event-time span reaches
 * {@code freezeDwellS}; it closes on the first sample that moves (PV_MOVED).</li>
 * <li><b>G10 LIMIT_LOW / LIMIT_HIGH</b>: OP normalised to 0-100 pp of the declared (or
 * assumed) range within {@code limitTolerancePp} of an end opens once its span reaches the
 * commissioned {@code limitDwellWarnS} (or the legacy {@code satLimitDwellSamplesWarn} x grid);
 * it closes when the sample leaves the limit (LEFT_LIMIT).</li>
 * <li>A <b>source gap</b> (an interval beyond max(3 x last interval, 60 s)) closes everything
 * open at the last observation plus one grid (SOURCE_GAP) - silence is never extended into
 * a condition.</li>
 * </ul>
 * UPDATE events are throttled to {@link #DEFAULT_UPDATE_INTERVAL_MS}. Same primitives and
 * thresholds as the long-window gates, so both paths agree.
 */
public final class ConditionDetector implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final long DEFAULT_UPDATE_INTERVAL_MS = 30_000L;
    private static final long DEFAULT_GRID_MS = 5_000L;

    private final long updateIntervalMs;
    private long lastTsMs = Long.MIN_VALUE;
    private long lastDeltaMs = DEFAULT_GRID_MS;
    private double lastPv = Double.NaN;
    private long freezeRunStartMs = Long.MIN_VALUE;
    private String limitSide = null;
    private long limitRunStartMs = Long.MIN_VALUE;
    private final Map<String, ConditionEvent> open = new HashMap<>();
    private final Map<String, Long> lastUpdateMs = new HashMap<>();

    public ConditionDetector() {
        this(DEFAULT_UPDATE_INTERVAL_MS);
    }

    public ConditionDetector(long updateIntervalMs) {
        this.updateIntervalMs = updateIntervalMs;
    }

    /** The open condition for a gate (G10 or G11), or null. */
    public ConditionEvent openCondition(String gate) {
        for (ConditionEvent e : open.values()) if (gate.equals(e.gate)) return e;
        return null;
    }

    public List<ConditionEvent> onSample(CplmNormalizedSample s, CplmLoopDynamicsProfile p) {
        List<ConditionEvent> out = new ArrayList<>();
        if (s == null || !s.isValid) return out;
        long ts = s.eventTsMs;

        if (lastTsMs != Long.MIN_VALUE) {
            long delta = ts - lastTsMs;
            long gapThreshold = Math.max(3 * lastDeltaMs, 60_000L);
            if (delta > gapThreshold) {
                long endAt = lastTsMs + lastDeltaMs;
                for (String kind : new ArrayList<>(open.keySet())) close(out, kind, endAt, "SOURCE_GAP");
                freezeRunStartMs = Long.MIN_VALUE;
                limitSide = null;
                limitRunStartMs = Long.MIN_VALUE;
                lastPv = Double.NaN;
            } else if (delta > 0) {
                lastDeltaMs = delta;
            }
        }
        double gridS = lastDeltaMs / 1000.0;

        // ── G11 freeze ──
        double tol = p.freezeToleranceEu > 0 ? p.freezeToleranceEu : LimitMath.PV_FREEZE_EPS;
        if (!Double.isNaN(lastPv) && Math.abs(s.pv - lastPv) <= tol) {
            if (freezeRunStartMs == Long.MIN_VALUE) freezeRunStartMs = lastTsMs;   // the run began at the previous sample
            double spanS = (ts - freezeRunStartMs) / 1000.0;
            if (spanS >= p.freezeDwellS) {
                Map<String, Object> ev = new HashMap<>();
                ev.put("pv_value", s.pv);
                ev.put("freeze_dwell_s", p.freezeDwellS);
                ev.put("tolerance_eu", tol);
                advance(out, s.loopId, "G11", "FREEZE", freezeRunStartMs, ts, ev);
            }
        } else {
            if (open.containsKey("FREEZE")) close(out, "FREEZE", ts, "PV_MOVED");
            freezeRunStartMs = Long.MIN_VALUE;
        }

        // ── G10 limits ──
        double norm = p.normalizeOp(s.op);
        double tolPp = p.limitTolerancePp;
        String side = norm <= tolPp ? "LIMIT_LOW" : norm >= 100.0 - tolPp ? "LIMIT_HIGH" : null;
        if (side == null || !side.equals(limitSide)) {
            if (limitSide != null && open.containsKey(limitSide)) close(out, limitSide, ts, "LEFT_LIMIT");
            limitSide = side;
            limitRunStartMs = side != null ? ts : Long.MIN_VALUE;
        }
        if (side != null) {
            double dwellWarnS = p.limitDwellWarnS > 0 ? p.limitDwellWarnS : p.satLimitDwellSamplesWarn * gridS;
            double spanS = (ts - limitRunStartMs) / 1000.0;
            if (spanS >= dwellWarnS) {
                Map<String, Object> ev = new HashMap<>();
                ev.put("limit_source", p.opRangeDeclared ? "DECLARED_RANGE" : "FALLBACK_0_100");
                ev.put("limit_low_pp", tolPp);
                ev.put("limit_high_pp", 100.0 - tolPp);
                ev.put("op_normalized_last", norm);
                ev.put("dwell_warn_s", dwellWarnS);
                advance(out, s.loopId, "G10", side, limitRunStartMs, ts, ev);
            }
        }

        lastTsMs = ts;
        lastPv = s.pv;
        return out;
    }

    private void advance(List<ConditionEvent> out, String loopId, String gate, String kind,
                         long startMs, long ts, Map<String, Object> evidence) {
        ConditionEvent e = open.get(kind);
        if (e == null) {
            e = new ConditionEvent();
            e.loopId = loopId;
            e.gate = gate;
            e.kind = kind;
            e.startMs = startMs;
            e.lastMs = ts;
            e.durationS = (ts - startMs) / 1000.0;
            e.evidence.putAll(evidence);
            e.emittedAtMs = ts;
            e.state = "OPEN";
            open.put(kind, e);
            lastUpdateMs.put(kind, ts);
            out.add(e.copyAs("OPEN"));
            return;
        }
        e.lastMs = ts;
        e.durationS = (ts - e.startMs) / 1000.0;
        e.evidence.putAll(evidence);
        Long last = lastUpdateMs.get(kind);
        if (last == null || ts - last >= updateIntervalMs) {
            lastUpdateMs.put(kind, ts);
            e.emittedAtMs = ts;
            out.add(e.copyAs("UPDATE"));
        }
    }

    private void close(List<ConditionEvent> out, String kind, long endMs, String reason) {
        ConditionEvent e = open.remove(kind);
        lastUpdateMs.remove(kind);
        if (e == null) return;
        e.endMs = endMs;
        e.durationS = (endMs - e.startMs) / 1000.0;
        e.closeReason = reason;
        e.emittedAtMs = endMs;
        out.add(e.copyAs("CLOSED"));
    }
}
