package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * The reader of the registry's metadata-plane records - the canonical parameter-set envelope
 * ({@code {calcInstanceId, parameters:[{name, value}]}}), the legacy MOC envelope
 * ({@code payload.staticAttributes[{assetUuid, attrKey, value}]}) and the tombstone
 * ({@code {__tombstone:true, key}}) - into {@code key -> value} attribute entries: {@code name},
 * {@code <calcInstanceId>:name}, {@code attrKey}, {@code <assetUuid>:attrKey}. One reader for the
 * broadcast state of the streaming jobs and the lookup map of the bounded jobs. A record that does
 * not parse throws: the caller counts it (cplm_config_rejected), never swallows it.
 */
public final class CplmMetadataEnvelope {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CplmMetadataEnvelope() {
    }

    /** True when the record is a metadata-plane envelope this reader understands (not a gate-config bundle, not garbage). */
    public static boolean isEnvelope(JsonNode root) {
        return root != null && root.isObject()
                && (root.path("parameters").isArray() || root.has("staticAttributes") || root.has("payload") || root.path("__tombstone").asBoolean(false));
    }

    public static void applyUpdate(String value, BiConsumer<String, String> put, Consumer<String> removeKeyAndPrefixed) throws Exception {
        if (value == null || value.isBlank()) return;
        JsonNode root = MAPPER.readTree(value);
        applyUpdate(root, put, removeKeyAndPrefixed);
    }

    public static void applyUpdate(JsonNode root, BiConsumer<String, String> put, Consumer<String> removeKeyAndPrefixed) throws Exception {
        if (root == null || !root.isObject()) throw new IllegalArgumentException("a metadata update must be a JSON object");
        if (root.has("__tombstone") && root.path("__tombstone").asBoolean(false)) {
            String key = text(root, "key", null);
            if (key != null) removeKeyAndPrefixed.accept(key);
            return;
        }

        JsonNode parameters = root.path("parameters");
        if (parameters.isArray()) {
            String calcId = text(root, "calcInstanceId", text(root, "key", ""));
            for (JsonNode parameter : parameters) {
                String name = text(parameter, "name", "");
                if (name.isEmpty()) continue;
                String parameterValue = text(parameter, "value", "");
                put.accept(name, parameterValue);
                if (!calcId.isEmpty()) put.accept(calcId + ":" + name, parameterValue);
            }
        }

        JsonNode payload = root.has("payload") ? root.get("payload") : root;
        if (payload != null && payload.isTextual()) payload = MAPPER.readTree(payload.asText());
        if (payload != null && payload.path("staticAttributes").isArray()) {
            for (JsonNode attribute : payload.path("staticAttributes")) {
                String assetUuid = text(attribute, "assetUuid", null);
                String attrKey = text(attribute, "attrKey", null);
                if (assetUuid == null || attrKey == null) continue;
                JsonNode valueNode = attribute.get("value");
                String attributeValue = "";
                if (valueNode != null) {
                    attributeValue = valueNode.isObject() && valueNode.has("value")
                            ? valueNode.get("value").asText("")
                            : valueNode.asText("");
                }
                put.accept(assetUuid + ":" + attrKey, attributeValue);
                put.accept(attrKey, attributeValue);
            }
        }
    }

    static String text(JsonNode n, String field, String def) {
        return n != null && n.has(field) && !n.get(field).isNull() ? n.get(field).asText() : def;
    }
}
