package com.ams.flink.cplm.condition;

import com.ams.flink.cplm.identity.BuildIdentity;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One fast-path condition observation (v2.5 Task 1D.4, spec v6 R11/R08): a G10 limit dwell
 * or a G11 freeze, published on {@code traverse.cpa.clpm.condition.v1} as it evolves -
 * OPEN when the dwell is reached, UPDATE while it persists, CLOSED when it ends (with why).
 * Bounds are event time; nothing here is a verdict about a mechanism, it is retained
 * evidence that the long-window gates and fusion consume without waiting for a 12 h slice.
 */
public final class ConditionEvent implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String loopId;
    /** G10 | G11 */
    public String gate;
    /** LIMIT_LOW | LIMIT_HIGH | FREEZE */
    public String kind;
    /** OPEN | UPDATE | CLOSED */
    public String state;
    public long startMs;
    /** Last observed sample inside the condition. */
    public long lastMs;
    /** End of the condition (CLOSED only); 0 otherwise. */
    public long endMs;
    public double durationS;
    /** CLOSED only: PV_MOVED | LEFT_LIMIT | SOURCE_GAP. */
    public String closeReason = "";
    public Map<String, Object> evidence = new LinkedHashMap<>();
    public long emittedAtMs;

    public ConditionEvent() {
    }

    ConditionEvent copyAs(String newState) {
        ConditionEvent c = new ConditionEvent();
        c.loopId = loopId;
        c.gate = gate;
        c.kind = kind;
        c.state = newState;
        c.startMs = startMs;
        c.lastMs = lastMs;
        c.endMs = endMs;
        c.durationS = durationS;
        c.closeReason = closeReason;
        c.evidence = new LinkedHashMap<>(evidence);
        c.emittedAtMs = emittedAtMs;
        return c;
    }

    /** Parse a record written by {@link #toJson()}; null when it is not a condition record. */
    public static ConditionEvent fromJson(String json) {
        try {
            org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode n = MAPPER.readTree(json);
            if (n == null || !n.has("loop_id") || !"CPLM_CONDITION".equals(n.path("eventType").asText(""))) return null;
            ConditionEvent e = new ConditionEvent();
            e.loopId = n.get("loop_id").asText();
            e.gate = n.path("gate").asText("");
            e.kind = n.path("kind").asText("");
            e.state = n.path("state").asText("");
            e.startMs = n.path("start_ms").asLong(0);
            e.lastMs = n.path("last_ms").asLong(0);
            e.endMs = n.hasNonNull("end_ms") ? n.get("end_ms").asLong() : 0L;
            e.durationS = n.path("duration_s").asDouble(0);
            e.closeReason = n.path("close_reason").asText("");
            e.emittedAtMs = n.path("emitted_at_ms").asLong(0);
            org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode ev = n.get("evidence");
            if (ev != null && ev.isObject()) {
                java.util.Iterator<Map.Entry<String, org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode>> it = ev.fields();
                while (it.hasNext()) {
                    Map.Entry<String, org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode> f = it.next();
                    org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode v = f.getValue();
                    if (v.isNumber()) e.evidence.put(f.getKey(), v.asDouble());
                    else if (v.isBoolean()) e.evidence.put(f.getKey(), v.asBoolean());
                    else if (v.isNull()) e.evidence.put(f.getKey(), null);
                    else e.evidence.put(f.getKey(), v.asText());
                }
            }
            return e;
        } catch (Exception ex) {
            return null;
        }
    }

    public String toJson() {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("schemaVersion", 1);
        n.put("eventType", "CPLM_CONDITION");
        n.put("loop_id", loopId);
        n.put("gate", gate);
        n.put("kind", kind);
        n.put("state", state);
        n.put("start_ms", startMs);
        n.put("last_ms", lastMs);
        if (endMs > 0) n.put("end_ms", endMs); else n.putNull("end_ms");
        n.put("duration_s", durationS);
        n.put("close_reason", closeReason);
        ObjectNode ev = n.putObject("evidence");
        for (Map.Entry<String, Object> e : evidence.entrySet()) {
            Object v = e.getValue();
            if (v == null) ev.putNull(e.getKey());
            else if (v instanceof Number) ev.put(e.getKey(), ((Number) v).doubleValue());
            else if (v instanceof Boolean) ev.put(e.getKey(), (Boolean) v);
            else ev.put(e.getKey(), String.valueOf(v));
        }
        n.put("emitted_at_ms", emittedAtMs);
        BuildIdentity id = BuildIdentity.current();
        n.put("sourceCommit", id.sourceCommit);
        n.put("jarSha256", id.jarSha256);
        n.put("contractVersion", BuildIdentity.CONTRACT_VERSION);
        return n.toString();
    }
}
