package com.ams.flink.cplm.condition;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.Map;

/**
 * The fast-path conditions open for a loop as of a fusion decision (v2.5 Task 1D.5, R11).
 * A summary, not the events: fusion needs "is a limit / freeze condition open right now,
 * since when, for how long" - the events themselves are retained by cplm-api.
 */
public final class OpenConditions implements Serializable {
    private static final long serialVersionUID = 1L;

    public boolean hasOpenLimit;
    /** LIMIT_LOW | LIMIT_HIGH | "" */
    public String limitKind = "";
    public double limitDurationS;
    public long limitSinceMs;
    public boolean hasOpenFreeze;
    public double freezeDurationS;
    public long freezeSinceMs;
    /** Newest observation across the open conditions (0 when none). */
    public long asOfMs;

    public OpenConditions() {
    }

    public static OpenConditions none() {
        return new OpenConditions();
    }

    /** Summarise the open-condition map kept by the fusion job (kind -> latest event). */
    public static OpenConditions of(Map<String, ConditionEvent> open) {
        OpenConditions o = new OpenConditions();
        if (open == null) return o;
        for (ConditionEvent e : open.values()) {
            if (e == null || "CLOSED".equals(e.state)) continue;
            if (e.kind != null && e.kind.startsWith("LIMIT")) {
                if (!o.hasOpenLimit || e.durationS > o.limitDurationS) {
                    o.hasOpenLimit = true;
                    o.limitKind = e.kind;
                    o.limitDurationS = e.durationS;
                    o.limitSinceMs = e.startMs;
                }
            } else if ("FREEZE".equals(e.kind)) {
                o.hasOpenFreeze = true;
                o.freezeDurationS = e.durationS;
                o.freezeSinceMs = e.startMs;
            }
            o.asOfMs = Math.max(o.asOfMs, e.lastMs);
        }
        return o;
    }

    public boolean any() {
        return hasOpenLimit || hasOpenFreeze;
    }

    public ObjectNode toJson(ObjectMapper mapper) {
        ObjectNode n = mapper.createObjectNode();
        n.put("has_open_limit", hasOpenLimit);
        n.put("limit_kind", limitKind);
        n.put("limit_duration_s", limitDurationS);
        n.put("limit_since_ms", limitSinceMs);
        n.put("has_open_freeze", hasOpenFreeze);
        n.put("freeze_duration_s", freezeDurationS);
        n.put("freeze_since_ms", freezeSinceMs);
        n.put("as_of_ms", asOfMs);
        return n;
    }
}
