package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.health.LoopHealthContextRecord;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

/**
 * v2.5 Task 1H.5 (spec v6 §4.6/§4.7): the Instrumental health context a verdict was formed under,
 * per signal role - the G11 "health lanes". Carried verbatim on the gate result so the workbench
 * shows what Flink knew, and used by fusion in exactly two ways: a PV that is INELIGIBLE
 * (fault affecting the measurement) excludes the window; LIMITED / not configured are flagged,
 * never treated as OK. Absence of health is {@code configured=false}, which the UI renders as
 * NOT_CONFIGURED - never as a healthy instrument.
 */
public final class HealthLanes implements Serializable {
    private static final long serialVersionUID = 2L;

    /**
     * role -> latest context for that role (PV, SP, OP, VP, MODE). Public, mutable, no-arg
     * constructor: this class rides inside CplmGateResult between chained operators, and Flink's
     * chained copy rebuilds non-POJO values without running a constructor (a final unmodifiable
     * map came back null on the lab). Every reader below tolerates null.
     */
    public Map<String, LoopHealthContextRecord> byRole = new TreeMap<>();

    public HealthLanes() {}

    public static HealthLanes none() { return new HealthLanes(); }

    public static HealthLanes of(Map<String, LoopHealthContextRecord> byRole) {
        HealthLanes h = new HealthLanes();
        if (byRole != null) h.byRole.putAll(byRole);
        return h;
    }

    public Map<String, LoopHealthContextRecord> roles() {
        return byRole == null ? Collections.emptyMap() : byRole;
    }

    /** True when at least one role has a context record with a device bound (NOT_CONFIGURED records do not count). */
    public boolean configured() {
        for (LoopHealthContextRecord r : roles().values()) if (r != null && !r.isNotConfigured()) return true;
        return false;
    }

    public LoopHealthContextRecord pv() { return roles().get("PV"); }

    /** The measurement itself is under a fault affecting it: the window cannot be diagnosed. */
    public boolean pvIneligible() {
        LoopHealthContextRecord pv = pv();
        return pv != null && pv.isIneligible();
    }

    /** Any bound role is LIMITED (C/S, stale, unknown collection): findings carry a caveat. */
    public boolean anyLimited() {
        for (LoopHealthContextRecord r : roles().values()) if (r != null && r.isLimited()) return true;
        return false;
    }

    public String pvReason() {
        LoopHealthContextRecord pv = pv();
        return pv == null ? "" : pv.reason;
    }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("configured", configured());
        LoopHealthContextRecord pv = pv();
        n.put("pv_eligibility", pv == null ? "NOT_CONFIGURED" : pv.eligibility);
        ObjectNode roles = m.createObjectNode();
        for (Map.Entry<String, LoopHealthContextRecord> e : roles().entrySet()) {
            LoopHealthContextRecord r = e.getValue();
            if (r == null) continue;
            ObjectNode o = m.createObjectNode();
            o.put("device_id", r.deviceId);
            o.put("binding_id", r.bindingId);
            o.put("eligibility", r.eligibility);
            o.put("descriptive_eligibility", r.descriptiveEligibility);
            o.put("reason", r.reason);
            if (r.hasInterval) {
                o.put("from_ms", r.fromMs);
                if (r.toMs != null) o.put("to_ms", r.toMs); else o.putNull("to_ms");
                ArrayNode flags = m.createArrayNode();
                for (String f : r.activeFlags) flags.add(f);
                o.set("active_flags", flags);
                o.put("collection_state", r.collectionState);
                o.put("measurement_impact", r.measurementImpact);
                o.put("health_state_id", r.healthStateId);
                o.put("revision", r.revision);
            } else {
                o.putNull("from_ms");
            }
            roles.set(e.getKey(), o);
        }
        n.set("roles", roles);
        return n;
    }
}
