package com.ams.flink;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;

/** Parses alarm DTO JSON from both PascalCase (legacy) and camelCase (API producer) payloads. */
final class AlarmJson {
    private AlarmJson() {}

    static JsonNode field(JsonNode node, String pascal, String camel) {
        JsonNode value = node.get(pascal);
        if (value == null || value.isNull()) {
            value = node.get(camel);
        }
        return value;
    }

    static String text(JsonNode node, String pascal, String camel) {
        JsonNode value = field(node, pascal, camel);
        return value == null || value.isNull() ? "" : value.asText();
    }

    static int integer(JsonNode node, String pascal, String camel) {
        JsonNode value = field(node, pascal, camel);
        return value == null || value.isNull() ? 0 : value.asInt();
    }

    static boolean bool(JsonNode node, String pascal, String camel) {
        JsonNode value = field(node, pascal, camel);
        return value != null && !value.isNull() && value.asBoolean();
    }
}
