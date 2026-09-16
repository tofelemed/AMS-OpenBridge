package com.ams.flink.cplm.health;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 1H.4: the effective-dated device bindings of one loop, as cplm-api broadcasts them
 * on traverse.cpa.ams.metadata.updates under the attribute {@code cplm.loop.binding}
 * ({@code {"calcInstanceId": loopId, "parameters": [{"name": "cplm.loop.binding", "value": "{...}"}]}}).
 * History resolves the device installed at a given time; no binding = NOT_CONFIGURED.
 */
public final class LoopBindings implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String ATTRIBUTE = "cplm.loop.binding";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final class Binding implements Serializable {
        private static final long serialVersionUID = 1L;
        public String bindingId = "";
        public String signalRole = "";
        public String deviceId = "";
        public String installationId;
        public String sourceId = "";
        public long validFromMs;
        public Long validToMs;

        public boolean coversAt(long atMs) {
            return validFromMs <= atMs && (validToMs == null || atMs < validToMs);
        }
    }

    public String loopId = "";
    public List<Binding> bindings = new ArrayList<>();

    /** Returns the loop id and bindings when the envelope carries the binding attribute, else null. */
    public static LoopBindings fromMetadataEnvelope(String json) {
        try {
            JsonNode root = MAPPER.readTree(json);
            String loopId = root.path("calcInstanceId").asText(null);
            if (loopId == null || !root.path("parameters").isArray()) return null;
            for (JsonNode p : root.path("parameters")) {
                if (!ATTRIBUTE.equals(p.path("name").asText())) continue;
                JsonNode value = MAPPER.readTree(p.path("value").asText("{}"));
                LoopBindings lb = new LoopBindings();
                lb.loopId = loopId;
                for (JsonNode b : value.path("bindings")) {
                    Binding x = new Binding();
                    x.bindingId = b.path("binding_id").asText("");
                    x.signalRole = b.path("signal_role").asText("").toUpperCase();
                    x.deviceId = b.path("device_id").asText("");
                    x.installationId = b.path("installation_id").asText(null);
                    x.sourceId = b.path("source_id").asText("");
                    x.validFromMs = b.path("valid_from_ms").asLong(0);
                    x.validToMs = b.path("valid_to_ms").isNull() || b.path("valid_to_ms").isMissingNode() ? null : b.path("valid_to_ms").asLong();
                    lb.bindings.add(x);
                }
                return lb;
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    public String toJson() {
        try {
            return MAPPER.writeValueAsString(MAPPER.valueToTree(this));
        } catch (Exception e) {
            return "{}";
        }
    }

    public static LoopBindings fromStateJson(String json) {
        try {
            return MAPPER.treeToValue(MAPPER.readTree(json), LoopBindings.class);
        } catch (Exception e) {
            return null;
        }
    }

    /** The (loop, role, binding) triples that name this device at {@code atMs}. */
    public List<Binding> bindingsForDevice(String deviceId, long atMs) {
        List<Binding> out = new ArrayList<>();
        for (Binding b : bindings) if (b.deviceId.equals(deviceId) && b.coversAt(atMs)) out.add(b);
        return out;
    }
}
