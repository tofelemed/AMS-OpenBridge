package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.RichMapFunction;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Flink job: current-alarm-state → live.alarms + live.metrics  (Report-by-Exception).
 *
 * Reads the compacted current-alarm-state topic.  For every incoming event it compares
 * the new state against the last published state (held in Flink ValueState keyed by alarmId).
 * Only changed fields are forwarded — this is the RBE filter that keeps MQTT payload small.
 *
 * Two output topics:
 *   live.alarms   — full alarm state envelope (for the HMI alarm list / faceplate)
 *   live.metrics  — lightweight numeric metrics (severity, count) for dashboard widgets
 *
 * Spec reference: §6 "Live-State Job", §8.2 "Kafka → MQTT bridge".
 */
public class LiveStateJob {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        // AT_LEAST_ONCE: downstream MQTT bridge is idempotent (alarmId + ts dedup)
        env.enableCheckpointing(30_000, CheckpointingMode.AT_LEAST_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(10_000);
        env.getCheckpointConfig().setCheckpointTimeout(60_000);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("current-alarm-state")
                .setGroupId("flink-ams-live-state")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        // Key by alarmId so RBE ValueState is per-alarm
        DataStream<String> currentState = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "current-alarm-state-source")
                .filter(s -> s != null && !s.isBlank())
                .name("live-state-ingest");

        // ── live.alarms ── full envelope, RBE filtered
        currentState
                .keyBy(LiveStateJob::extractAlarmId)
                .map(new RbeAlarmStateMap())
                .name("rbe-alarm-filter")
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(kafkaSink(cfg.brokers, "live.alarms"))
                .name("live-alarms-sink");

        // ── live.metrics ── numeric metrics only
        currentState
                .keyBy(LiveStateJob::extractAlarmId)
                .map(new RbeMetricsMap())
                .name("rbe-metrics-filter")
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(kafkaSink(cfg.brokers, "live.metrics"))
                .name("live-metrics-sink");

        env.execute("AMS - Live State RBE");
    }

    // ── RBE: full alarm state envelope ────────────────────────────────────

    /**
     * Emits a JSON envelope to live.alarms only when at least one of:
     *   state, severity, ackStatus, conditionActive, priority
     * has changed since the last published event for this alarmId.
     *
     * Adds a "rbeTs" field (epoch ms) so the MQTT bridge can set message timestamp.
     */
    public static class RbeAlarmStateMap extends RichMapFunction<String, String> {
        private static final long serialVersionUID = 1L;

        /** Last published state fingerprint: "<state>|<severity>|<ack>|<active>|<priority>" */
        private transient ValueState<String> lastFingerprint;

        @Override
        public void open(Configuration params) {
            lastFingerprint = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("live-alarm-fp", Types.STRING));
        }

        @Override
        public String map(String json) throws Exception {
            if (json == null || json.isBlank()) return null;

            JsonNode node;
            try {
                node = MAPPER.readTree(json);
            } catch (Exception e) {
                return null;
            }

            // ── extract fields ─────────────────────────────────────────
            String alarmId       = textOrEmpty(node, "alarmId");
            String state         = textOrEmpty(node, "state");
            int    severity      = node.has("severity") ? node.get("severity").asInt(0) : 0;
            boolean ack          = node.has("acknowledged") && node.get("acknowledged").asBoolean();
            boolean active       = !node.has("conditionActive") || node.get("conditionActive").asBoolean(true);
            String priority      = textOrEmpty(node, "priority");

            if (alarmId.isEmpty()) return null;

            // Derive state if not explicit
            if (state.isEmpty()) {
                if (!active)    state = "CLEARED";
                else if (ack)   state = "ACKNOWLEDGED";
                else            state = "ACTIVE";
            }

            String fp = state + "|" + severity + "|" + ack + "|" + active + "|" + priority;
            String prev = lastFingerprint.value();

            if (fp.equals(prev)) return null;   // no change — suppress
            lastFingerprint.update(fp);

            // ── build output envelope ──────────────────────────────────
            ObjectNode out = MAPPER.createObjectNode();
            out.put("alarmId",        alarmId);
            out.put("state",          state);
            out.put("severity",       severity);
            out.put("acknowledged",   ack);
            out.put("conditionActive",active);
            out.put("priority",       priority);
            out.put("sourceName",     textOrEmpty(node, "sourceName"));
            out.put("conditionName",  textOrEmpty(node, "conditionName"));
            out.put("message",        textOrEmpty(node, "message"));
            out.put("rbeTs",          System.currentTimeMillis());
            // Preserve original event time if present
            if (node.has("eventTimeEpochMs"))
                out.put("eventTimeEpochMs", node.get("eventTimeEpochMs").asLong());

            return MAPPER.writeValueAsString(out);
        }
    }

    // ── RBE: numeric metrics only ──────────────────────────────────────────

    /**
     * Emits a compact JSON to live.metrics only when severity or state changes.
     * Designed for dashboard sparklines and gauge widgets.
     *
     * Schema: { alarmId, severity, state, priority, conditionActive, rbeTs }
     */
    public static class RbeMetricsMap extends RichMapFunction<String, String> {
        private static final long serialVersionUID = 1L;

        /** "<severity>|<state>" */
        private transient ValueState<String> lastMetricFp;

        @Override
        public void open(Configuration params) {
            lastMetricFp = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("live-metric-fp", Types.STRING));
        }

        @Override
        public String map(String json) throws Exception {
            if (json == null || json.isBlank()) return null;

            JsonNode node;
            try {
                node = MAPPER.readTree(json);
            } catch (Exception e) {
                return null;
            }

            String alarmId  = textOrEmpty(node, "alarmId");
            if (alarmId.isEmpty()) return null;

            int    severity = node.has("severity") ? node.get("severity").asInt(0) : 0;
            boolean active  = !node.has("conditionActive") || node.get("conditionActive").asBoolean(true);
            boolean ack     = node.has("acknowledged") && node.get("acknowledged").asBoolean();
            String  state   = textOrEmpty(node, "state");
            if (state.isEmpty()) {
                if (!active)  state = "CLEARED";
                else if (ack) state = "ACKNOWLEDGED";
                else          state = "ACTIVE";
            }
            String priority = textOrEmpty(node, "priority");

            String fp = severity + "|" + state;
            String prev = lastMetricFp.value();

            if (fp.equals(prev)) return null;   // no change — suppress
            lastMetricFp.update(fp);

            ObjectNode out = MAPPER.createObjectNode();
            out.put("alarmId",        alarmId);
            out.put("severity",       severity);
            out.put("state",          state);
            out.put("priority",       priority);
            out.put("conditionActive",active);
            out.put("rbeTs",          System.currentTimeMillis());

            return MAPPER.writeValueAsString(out);
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private static String extractAlarmId(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            String id = textOrEmpty(node, "alarmId");
            return id.isEmpty() ? "unknown" : id;
        } catch (Exception e) {
            return "unknown";
        }
    }

    private static String textOrEmpty(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? "" : v.asText();
    }

    private static KafkaSink<String> kafkaSink(String brokers, String topic) {
        return KafkaSink.<String>builder()
                .setBootstrapServers(brokers)
                .setRecordSerializer(
                        KafkaRecordSerializationSchema.builder()
                                .setTopic(topic)
                                .setValueSerializationSchema(new SimpleStringSchema())
                                .build())
                .build();
    }
}
