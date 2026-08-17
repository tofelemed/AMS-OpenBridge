package com.ams.flink;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.serialization.SerializationSchema;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;

import java.nio.charset.StandardCharsets;

/**
 * Shared KafkaSink builders for the AMS jobs.
 *
 * Compacted topics (cleanup.policy=compact) reject null-key records at the broker
 * (InvalidRecordException: "Compacted topic cannot accept message without key"), and the
 * rejection can be swallowed silently by the connector's async producer callback — the sink
 * shows in=N out=0 while checkpoints keep completing. Every sink that targets a compacted
 * topic MUST use one of the keyed builders here; see docs/alarm-history-flink-sink-stuck.md.
 *
 * Keying also pins all records for one key to one partition, which is what gives the
 * ams-api projection consumer per-alarm ordering.
 */
public final class KafkaSinks {

    private KafkaSinks() {
    }

    /** Value-only sink — only for cleanup.policy=delete topics, where null keys are legal. */
    public static KafkaSink<String> valueOnly(String brokers, String topic) {
        return build(brokers, topic, null);
    }

    /** Record key = a top-level string field of the JSON value (e.g. "alarmId"). */
    public static KafkaSink<String> keyedByJsonField(String brokers, String topic, String field) {
        return build(brokers, topic, new JsonFieldKey(field));
    }

    /** Record key = a fixed string, for single-entity snapshot topics. */
    public static KafkaSink<String> fixedKey(String brokers, String topic, String key) {
        return build(brokers, topic, new FixedKey(key));
    }

    private static KafkaSink<String> build(
            String brokers, String topic, SerializationSchema<String> keySchema) {
        var serializer = KafkaRecordSerializationSchema.<String>builder()
                .setTopic(topic)
                .setValueSerializationSchema(new SimpleStringSchema());
        if (keySchema != null) {
            serializer = serializer.setKeySerializationSchema(keySchema);
        }
        return KafkaSink.<String>builder()
                .setBootstrapServers(brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                // Explicit bounds so a producer that cannot land records fails the
                // checkpoint instead of buffering indefinitely.
                .setProperty("delivery.timeout.ms", "120000")
                .setProperty("request.timeout.ms", "30000")
                .setProperty("max.block.ms", "60000")
                .setRecordSerializer(serializer.build())
                .build();
    }

    private static final class JsonFieldKey implements SerializationSchema<String> {
        private static final ObjectMapper MAPPER = new ObjectMapper();
        private final String field;

        private JsonFieldKey(String field) {
            this.field = field;
        }

        @Override
        public byte[] serialize(String value) {
            String key = null;
            try {
                JsonNode node = MAPPER.readTree(value).get(field);
                if (node != null && !node.isNull()) {
                    key = node.asText();
                }
            } catch (Exception ignored) {
                // fall through to the value-derived fallback
            }
            if (key == null || key.isEmpty()) {
                key = value; // never emit a null key — compacted topics reject it
            }
            return key.getBytes(StandardCharsets.UTF_8);
        }
    }

    private static final class FixedKey implements SerializationSchema<String> {
        private final byte[] key;

        private FixedKey(String key) {
            this.key = key.getBytes(StandardCharsets.UTF_8);
        }

        @Override
        public byte[] serialize(String ignored) {
            return key;
        }
    }
}
