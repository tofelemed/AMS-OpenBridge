package com.ams.flink.cplm.health;

import com.ams.flink.cplm.identity.BuildIdentity;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * v2.5 Task 1H.4: the records CplmInstrumentContextJob publishes on
 * traverse.cpa.context.instrument-health.v1 (compacted by {@code context_key}):
 * <ul>
 *   <li>DEVICE_INTERVAL - one device status interval (open, closed or a revision); key
 *       {@code device:<tenant>|<site>|<device>:<from_ms>:<revision>}, so every interval survives compaction.</li>
 *   <li>LOOP_CONTEXT - the eligibility of one loop signal under the device bound to it as of the
 *       interval; key {@code loop:<loop_id>:<role>}, so the latest context per signal survives.</li>
 * </ul>
 */
public final class LoopHealthContext {
    public static final String KEY_FIELD = "context_key";
    public static final String DEVICE_INTERVAL = "DEVICE_INTERVAL";
    public static final String LOOP_CONTEXT = "LOOP_CONTEXT";

    private LoopHealthContext() {
    }

    public static String deviceInterval(ObjectMapper m, HealthInterval i, String transitionKind, long emittedAtMs) {
        ObjectNode n = m.createObjectNode();
        n.put("record_kind", DEVICE_INTERVAL);
        n.put(KEY_FIELD, "device:" + i.tenantId + "|" + i.site + "|" + i.deviceId + ":" + i.fromMs + ":" + i.revision);
        n.put("transition", transitionKind);
        n.set("interval", i.toJson(m));
        stamp(n, emittedAtMs);
        return n.toString();
    }

    public static String loopContext(ObjectMapper m, String loopId, String role, String bindingId, HealthInterval i,
                                     HealthEligibilityPolicy.Result r, String transitionKind, long emittedAtMs) {
        ObjectNode n = m.createObjectNode();
        n.put("record_kind", LOOP_CONTEXT);
        n.put(KEY_FIELD, "loop:" + loopId + ":" + role);
        n.put("loop_id", loopId);
        n.put("role", role);
        n.put("signal_id", loopId + "." + role);
        n.put("binding_id", bindingId == null ? "" : bindingId);
        n.put("device_id", i.deviceId);
        n.put("transition", transitionKind);
        n.put("eligibility", r.eligibility);
        n.put("descriptive_eligibility", r.descriptive);
        n.put("reason", r.reason);
        n.set("interval", i.toJson(m));
        stamp(n, emittedAtMs);
        return n.toString();
    }

    /** The absence of a binding is a fact worth publishing: NOT_CONFIGURED, never manufactured health. */
    public static String notConfigured(ObjectMapper m, String loopId, String role, long emittedAtMs) {
        ObjectNode n = m.createObjectNode();
        n.put("record_kind", LOOP_CONTEXT);
        n.put(KEY_FIELD, "loop:" + loopId + ":" + role);
        n.put("loop_id", loopId);
        n.put("role", role);
        n.put("signal_id", loopId + "." + role);
        n.put("binding_id", "");
        n.put("device_id", "");
        n.put("transition", "BINDING");
        HealthEligibilityPolicy.Result r = HealthEligibilityPolicy.notConfigured();
        n.put("eligibility", r.eligibility);
        n.put("descriptive_eligibility", r.descriptive);
        n.put("reason", r.reason);
        n.putNull("interval");
        stamp(n, emittedAtMs);
        return n.toString();
    }

    private static void stamp(ObjectNode n, long emittedAtMs) {
        BuildIdentity id = BuildIdentity.current();
        n.put("emitted_at_ms", emittedAtMs);
        n.put("sourceCommit", id.sourceCommit);
        n.put("jarSha256", id.jarSha256);
        n.put("contractVersion", BuildIdentity.CONTRACT_VERSION);
    }
}
