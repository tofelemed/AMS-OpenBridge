package com.ams.flink.cplm.health;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * v2.5 Task 1H.4 (spec v6 §4.5): the per-device state machine. Pure and serialisable so the
 * Flink operator can keep one per device in keyed state.
 *
 * <ul>
 *   <li>A COMPLETE snapshot of the current (or a newer) epoch opens an interval at its observed
 *       time and closes the previous one with NEWER_STATE. An incomplete state never clears:
 *       flags are retained, impact becomes UNKNOWN (NR-037).</li>
 *   <li>A snapshot whose verification is older than the freshness policy opens as STALE, not as a
 *       fresh clear (NR-038). {@link #onTimer} closes a VERIFIED interval with FRESHNESS_EXPIRED
 *       once {@code max(3 x scan interval, site minimum)} has passed since verification.</li>
 *   <li>An older epoch, or an older/equal sequence within the epoch, never overwrites newer state;
 *       an event of a newer epoch is ignored until that epoch's complete snapshot arrives (NR-040).</li>
 *   <li>A LATE_CORRECTION with an earlier supported onset produces a REVISION interval and leaves
 *       the live state untouched (NR-045).</li>
 *   <li>Source OFFLINE closes the interval with SOURCE_OFFLINE and opens an OFFLINE one keeping the
 *       last observed status; a new snapshot reopens.</li>
 * </ul>
 */
public final class DeviceStateMachine implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final class Transition implements Serializable {
        private static final long serialVersionUID = 1L;
        /** OPEN | CLOSE | REVISION */
        public final String kind;
        public final HealthInterval interval;

        Transition(String kind, HealthInterval interval) {
            this.kind = kind;
            this.interval = interval;
        }
    }

    private final long siteMinFreshnessMs;
    private HealthInterval current;
    private long epoch = Long.MIN_VALUE;
    private long lastSeq = -1;
    private double scanIntervalS = 30;
    private int revisions = 1;

    public DeviceStateMachine(long siteMinFreshnessMs) {
        this.siteMinFreshnessMs = Math.max(1000, siteMinFreshnessMs);
    }

    public HealthInterval current() {
        return current;
    }

    public long freshnessWindowMs() {
        return Math.max((long) (3 * scanIntervalS * 1000), siteMinFreshnessMs);
    }

    public List<Transition> apply(HealthObservation o, long nowMs) {
        if (o == null || o.isAvailability()) return Collections.emptyList();
        boolean snapshot = "STATE_SNAPSHOT".equals(o.messageKind);
        // epoch / sequence discipline (NR-040)
        if (o.producerEpoch < epoch) return Collections.emptyList();
        if (o.producerEpoch > epoch) {
            if (!snapshot || !o.stateComplete) return Collections.emptyList();   // needs the epoch's complete snapshot first
            epoch = o.producerEpoch;
            lastSeq = -1;
        } else if (o.sequence <= lastSeq) {
            return Collections.emptyList();
        }
        lastSeq = o.sequence;
        if (o.scanIntervalS > 0) scanIntervalS = o.scanIntervalS;

        if ("LATE_CORRECTION".equals(o.changeKind) && current != null && o.observedAtMs > 0 && o.observedAtMs < current.fromMs) {
            HealthInterval rev = build(o, nowMs);
            rev.fromMs = o.observedAtMs;
            rev.toMs = current.fromMs;
            rev.boundaryKind = "NEWER_STATE";
            rev.revision = ++revisions;
            return Collections.singletonList(new Transition("REVISION", rev));
        }

        HealthInterval next = build(o, nowMs);
        if (!o.stateComplete && current != null) {
            // an incomplete state cannot clear anything: keep what was known, admit the impact is unknown
            next.activeFlags = new ArrayList<>(current.activeFlags);
            next.affectedVariableIds = new ArrayList<>(current.affectedVariableIds);
            next.diagnosticIds = new ArrayList<>(current.diagnosticIds);
            next.measurementImpact = "UNKNOWN";
            next.healthStateId = current.healthStateId.equals(HealthInterval.NO_ACTIVE_DIAGNOSTIC) ? "INCOMPLETE" : current.healthStateId;
        }
        if (current != null && sameState(current, next)) {
            // The same state observed again (a heartbeat snapshot, an event restating the post-state):
            // the interval continues - refresh its verification, never open a new one (NR-036/045).
            current.verifiedAtMs = Math.max(current.verifiedAtMs, next.verifiedAtMs);
            current.nativeStatus = next.nativeStatus;
            current.producerEpoch = next.producerEpoch;
            current.stateComplete = next.stateComplete;
            return Collections.emptyList();
        }
        List<Transition> out = new ArrayList<>(2);
        if (current != null) {
            HealthInterval closed = current.copy();
            closed.toMs = Math.max(next.fromMs, closed.fromMs);
            closed.boundaryKind = "NEWER_STATE";
            out.add(new Transition("CLOSE", closed));
        }
        current = next;
        out.add(new Transition("OPEN", next.copy()));
        return out;
    }

    /** The eligibility-relevant state: flags, collection, impact, health-state id, diagnostics, affected variables. */
    static boolean sameState(HealthInterval a, HealthInterval b) {
        return a.activeFlags.equals(b.activeFlags)
                && a.collectionState.equals(b.collectionState)
                && a.measurementImpact.equals(b.measurementImpact)
                && a.healthStateId.equals(b.healthStateId)
                && a.diagnosticIds.equals(b.diagnosticIds)
                && a.affectedVariableIds.equals(b.affectedVariableIds);
    }

    /** Freshness policy tick: a VERIFIED interval whose verification aged out becomes STALE. */
    public List<Transition> onTimer(long nowMs) {
        if (current == null || !"VERIFIED".equals(current.collectionState)) return Collections.emptyList();
        if (nowMs - current.verifiedAtMs <= freshnessWindowMs()) return Collections.emptyList();
        long boundary = current.verifiedAtMs + freshnessWindowMs();
        return boundaryTo("FRESHNESS_EXPIRED", "STALE", Math.max(boundary, current.fromMs));
    }

    /** The source went OFFLINE: the last observed status is retained, its collection state is not. */
    public List<Transition> sourceOffline(long atMs) {
        if (current == null || "OFFLINE".equals(current.collectionState)) return Collections.emptyList();
        return boundaryTo("SOURCE_OFFLINE", "OFFLINE", Math.max(atMs, current.fromMs));
    }

    private List<Transition> boundaryTo(String boundaryKind, String newCollection, long atMs) {
        HealthInterval closed = current.copy();
        closed.toMs = atMs;
        closed.boundaryKind = boundaryKind;
        HealthInterval next = current.copy();
        next.fromMs = atMs;
        next.toMs = null;
        next.boundaryKind = "OPEN";
        next.collectionState = newCollection;
        next.measurementImpact = "UNKNOWN";
        if (HealthInterval.NO_ACTIVE_DIAGNOSTIC.equals(next.healthStateId)) next.healthStateId = "LAST_KNOWN_" + newCollection;
        current = next;
        List<Transition> out = new ArrayList<>(2);
        out.add(new Transition("CLOSE", closed));
        out.add(new Transition("OPEN", next.copy()));
        return out;
    }

    private HealthInterval build(HealthObservation o, long nowMs) {
        HealthInterval i = new HealthInterval();
        i.tenantId = o.tenantId;
        i.site = o.site;
        i.deviceId = o.deviceId;
        i.fromMs = o.observedAtMs > 0 ? o.observedAtMs : (o.verifiedAtMs > 0 ? o.verifiedAtMs : nowMs);
        i.toMs = null;
        i.boundaryKind = "OPEN";
        i.activeFlags = new ArrayList<>(new LinkedHashSet<>(o.activeFlags));
        i.nativeStatus = o.nativeStatus;
        i.measurementImpact = o.measurementImpact == null ? "UNKNOWN" : o.measurementImpact;
        i.stateComplete = o.stateComplete;
        i.verifiedAtMs = o.verifiedAtMs;
        i.producerEpoch = o.producerEpoch;
        i.fromObservationId = o.observationId;
        Set<String> affected = new LinkedHashSet<>();
        for (HealthObservation.Diagnostic d : o.diagnostics) {
            i.diagnosticIds.add(d.diagnosticId);
            affected.addAll(d.affectedVariableIds);
        }
        i.affectedVariableIds = new ArrayList<>(affected);
        // freshness at apply time: a snapshot verified long before it was applied is stale, not a clear (NR-038)
        boolean verifiedFresh = o.verifiedAtMs > 0 && nowMs - o.verifiedAtMs <= freshnessWindowMs();
        String collection = o.collectionState == null ? "UNKNOWN" : o.collectionState;
        if ("VERIFIED".equals(collection) && !verifiedFresh) collection = "STALE";
        if (o.verifiedAtMs <= 0) collection = "UNKNOWN";
        i.collectionState = collection;
        if (i.activeFlags.isEmpty() && o.stateComplete && "VERIFIED".equals(collection)) {
            i.healthStateId = HealthInterval.NO_ACTIVE_DIAGNOSTIC;
        } else if (i.activeFlags.isEmpty()) {
            i.healthStateId = "EMPTY_" + collection;
        } else {
            i.healthStateId = String.join("+", i.activeFlags) + "/" + String.join(",", i.diagnosticIds);
        }
        return i;
    }
}
