package com.ams.flink.cplm.health;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 1H.5: one LOOP_CONTEXT record of {@code traverse.cpa.context.instrument-health.v1}
 * as read by a consumer (the fusion job). The writer is {@link LoopHealthContext}; this is the
 * parsed mirror image - the eligibility Flink decided for one loop signal under the device bound
 * to it, plus the device interval it rests on (null when the role is NOT_CONFIGURED).
 * Flink POJO (public fields, no-arg constructor) so it can live in keyed state.
 */
public final class LoopHealthContextRecord implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String loopId = "";
    public String role = "";
    public String deviceId = "";
    public String bindingId = "";
    public String eligibility = "UNKNOWN";
    public String descriptiveEligibility = "UNKNOWN";
    public String reason = "";
    public boolean hasInterval;
    public long fromMs;
    /** null = open. */
    public Long toMs;
    public List<String> activeFlags = new ArrayList<>();
    public String collectionState = "UNKNOWN";
    public String measurementImpact = "UNKNOWN";
    public String healthStateId = "";
    public int revision;
    public long emittedAtMs;

    public LoopHealthContextRecord() {}

    /** Parses a context-topic record; returns null for anything that is not a LOOP_CONTEXT for a loop. */
    public static LoopHealthContextRecord fromJson(String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            JsonNode n = MAPPER.readTree(json);
            if (n == null || !n.isObject()) return null;
            if (!LoopHealthContext.LOOP_CONTEXT.equals(n.path("record_kind").asText(""))) return null;
            LoopHealthContextRecord r = new LoopHealthContextRecord();
            r.loopId = n.path("loop_id").asText("");
            r.role = n.path("role").asText("");
            if (r.loopId.isEmpty() || r.role.isEmpty()) return null;
            r.deviceId = n.path("device_id").asText("");
            r.bindingId = n.path("binding_id").asText("");
            r.eligibility = n.path("eligibility").asText("UNKNOWN");
            r.descriptiveEligibility = n.path("descriptive_eligibility").asText("UNKNOWN");
            r.reason = n.path("reason").asText("");
            r.emittedAtMs = n.path("emitted_at_ms").asLong(0L);
            JsonNode i = n.get("interval");
            if (i != null && i.isObject()) {
                r.hasInterval = true;
                r.fromMs = i.path("from_ms").asLong(0L);
                JsonNode to = i.get("to_ms");
                r.toMs = to != null && to.isNumber() ? to.asLong() : null;
                JsonNode flags = i.get("active_flags");
                if (flags != null && flags.isArray()) for (JsonNode f : flags) r.activeFlags.add(f.asText());
                r.collectionState = i.path("collection_state").asText("UNKNOWN");
                r.measurementImpact = i.path("measurement_impact").asText("UNKNOWN");
                r.healthStateId = i.path("health_state_id").asText("");
                r.revision = i.path("revision").asInt(0);
            }
            return r;
        } catch (Exception e) {
            return null;
        }
    }

    public boolean isIneligible() { return "INELIGIBLE".equals(eligibility); }
    public boolean isLimited() { return "LIMITED".equals(eligibility); }
    public boolean isNotConfigured() { return "NOT_CONFIGURED".equals(eligibility); }
}
