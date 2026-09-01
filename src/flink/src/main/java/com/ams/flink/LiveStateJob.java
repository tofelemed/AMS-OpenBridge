package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.RichMapFunction;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.kafka.clients.consumer.OffsetResetStrategy;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Flink job: traverse.alarm.current-alarm-state → traverse.alarm.live.alarms + traverse.alarm.live.alarm.metrics  (Report-by-Exception).
 *
 * Reads the compacted traverse.alarm.current-alarm-state topic.  For every incoming event it compares
 * the new state against the last published state (held in Flink ValueState keyed by alarmId).
 * Only changed fields are forwarded — this is the RBE filter that keeps MQTT payload small.
 *
 * Two output topics:
 *   traverse.alarm.live.alarms   — full alarm state envelope (for the HMI alarm list / faceplate)
 *   traverse.alarm.live.alarm.metrics — lightweight numeric metrics (severity, state) for dashboard widgets
 *
 * Spec reference: §6 "Live-State Job", §8.2 "Kafka → MQTT bridge".
 */
public class LiveStateJob {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * STR-12 — alarm-shaped numeric metrics. Deliberately NOT `traverse.live.metrics`: that topic
     * carries the process-value schema ({device, metric, value}) that sparkplug-edge-node's
     * metric branch parses, and mixing the two shapes meant these records were silently
     * discarded by the consumer.
     */
    private static final String ALARM_METRICS_TOPIC = "traverse.alarm.live.alarm.metrics";

    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        // AT_LEAST_ONCE: downstream MQTT bridge is idempotent (alarmId + ts dedup)
        env.enableCheckpointing(30_000, CheckpointingMode.AT_LEAST_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(10_000);
        env.getCheckpointConfig().setCheckpointTimeout(60_000);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("traverse.alarm.current-alarm-state")
                .setGroupId("traverse-alarm-flink-live-state")
                // audit-jobs.md A7: latest() on a COMPACTED topic meant a fresh
                // submit (no checkpoint — exactly the supervisor's cold-start path)
                // skipped the entire retained alarm state, so the HMI live list
                // stayed empty until each alarm next changed. Resume from committed
                // offsets; on a true first start replay the compacted state.
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        // Key by alarmId so RBE ValueState is per-alarm
        DataStream<String> currentState = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "current-alarm-state-source")
                .filter(s -> s != null && !s.isBlank())
                .name("live-state-ingest")
                .uid("live-state-ingest");

        // ── traverse.alarm.live.alarms ── full envelope, RBE filtered
        // Keyed by alarmId (PIPE-010): traverse.alarm.live.alarms has 4 partitions and the edge
        // node must see one alarm's UPSERT/CLEAR sequence in order.
        currentState
                .keyBy(LiveStateJob::extractAlarmId)
                .map(new RbeAlarmStateMap())
                .name("rbe-alarm-filter")
                .uid("rbe-alarm-filter")
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(KafkaSinks.keyedByJsonField(cfg.brokers, "traverse.alarm.live.alarms", "alarmId"))
                .name("live-alarms-sink")
                .uid("live-alarms-sink");

        // ── alarm numeric metrics ──
        // STR-12: this used to sink to `traverse.live.metrics`, which is ALSO the process-value
        // topic. The two payloads are incompatible: sparkplug-edge-node's metric branch
        // requires {device, metric, value} and RbeMetricsMap emits {alarmId, severity,
        // state, priority}. Every record produced here was therefore dropped by the edge
        // node as "missing device/metric" — a silently dead path whose data is in any
        // case already carried, in full, by live.alarms.
        //
        // Keeping the topics separate makes the schemas single-purpose. Note the new
        // topic has no consumer today: this sink is a candidate for removal, but that is
        // a product decision (see STR-08's schedule-or-retire list), not a silent drop.
        currentState
                .keyBy(LiveStateJob::extractAlarmId)
                .map(new RbeMetricsMap())
                .name("rbe-metrics-filter")
                .uid("rbe-metrics-filter")
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(KafkaSinks.keyedByJsonField(cfg.brokers, ALARM_METRICS_TOPIC, "alarmId"))
                .name("live-metrics-sink")
                .uid("live-metrics-sink");

        env.execute("AMS - Live State RBE");
    }

    // ── RBE: full alarm state envelope ────────────────────────────────────

    /**
     * Emits a JSON envelope to traverse.alarm.live.alarms only when at least one of:
     *   state, severity, ackStatus, conditionActive, priority
     * has changed since the last published event for this alarmId.
     *
     * Adds a "rbeTs" field (epoch ms) so the MQTT bridge can set message timestamp.
     */
    public static class RbeAlarmStateMap extends RichMapFunction<String, String> {
        private static final long serialVersionUID = 1L;

        /** Last published state fingerprint: "<state>|<severity>|<ack>|<active>|<priority>" */
        private transient ValueState<String> lastFingerprint;
        /** Last full UPSERT input for this alarm — the merge base for partial events. */
        private transient ValueState<String> lastInput;

        @Override
        public void open(Configuration params) {
            ValueStateDescriptor<String> fpDesc = new ValueStateDescriptor<>("live-alarm-fp", Types.STRING);
            ValueStateDescriptor<String> inDesc = new ValueStateDescriptor<>("live-alarm-last-input", Types.STRING);
            // audit-jobs.md A8: no TTL meant one RocksDB entry per alarm key forever.
            // DELETE clears eagerly below; the TTL is the backstop for alarms that
            // never send a delete (e.g. decommissioned points).
            fpDesc.enableTimeToLive(STATE_TTL);
            inDesc.enableTimeToLive(STATE_TTL);
            lastFingerprint = getRuntimeContext().getState(fpDesc);
            lastInput = getRuntimeContext().getState(inDesc);
        }

        @Override
        public String map(String json) throws Exception {
            if (json == null || json.isBlank()) return null;

            JsonNode raw;
            try {
                raw = MAPPER.readTree(json);
            } catch (Exception e) {
                return null;
            }

            // audit-jobs.md A1: ACK_STATE_UPDATE and ALARM_STATE_DELETE are PARTIAL
            // records — the ack stub hardcodes severity=100/priority=LOW and omits
            // conditionActive, the delete carries no severity/priority/message at
            // all. Taking their fields verbatim downgraded a CRITICAL alarm to LOW
            // on the HMI the moment an operator acknowledged it. Merge them onto
            // the last full state instead.
            String eventType = textOrEmpty(raw, "eventType");
            boolean isAck = "ACK_STATE_UPDATE".equals(eventType);
            boolean isDelete = "ALARM_STATE_DELETE".equals(eventType);
            JsonNode node = (isAck || isDelete) ? mergeOntoLast(raw, lastInput, isAck, isDelete) : raw;

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

            if (isDelete) {
                // Alarm removed: clear state so a recurrence re-emits (first-
                // observation-always-emits) instead of RBE-suppressing against
                // the dead entry.
                lastFingerprint.clear();
                lastInput.clear();
            } else {
                lastFingerprint.update(fp);
                lastInput.update(MAPPER.writeValueAsString(node));
            }

            return MAPPER.writeValueAsString(out);
        }
    }

    // ── RBE: numeric metrics only ──────────────────────────────────────────

    /**
     * Emits a compact JSON to traverse.alarm.live.alarm.metrics only when severity
     * or state changes (STR-12 moved it off traverse.live.metrics — the class
     * header explains why). Designed for dashboard sparklines and gauge widgets.
     *
     * Schema: { alarmId, severity, state, priority, conditionActive, rbeTs }
     */
    public static class RbeMetricsMap extends RichMapFunction<String, String> {
        private static final long serialVersionUID = 1L;

        /** "<severity>|<state>" */
        private transient ValueState<String> lastMetricFp;
        /** Merge base for partial ACK/DELETE records — see RbeAlarmStateMap. */
        private transient ValueState<String> lastInput;

        @Override
        public void open(Configuration params) {
            ValueStateDescriptor<String> fpDesc = new ValueStateDescriptor<>("live-metric-fp", Types.STRING);
            ValueStateDescriptor<String> inDesc = new ValueStateDescriptor<>("live-metric-last-input", Types.STRING);
            fpDesc.enableTimeToLive(STATE_TTL);
            inDesc.enableTimeToLive(STATE_TTL);
            lastMetricFp = getRuntimeContext().getState(fpDesc);
            lastInput = getRuntimeContext().getState(inDesc);
        }

        @Override
        public String map(String json) throws Exception {
            if (json == null || json.isBlank()) return null;

            JsonNode raw;
            try {
                raw = MAPPER.readTree(json);
            } catch (Exception e) {
                return null;
            }

            String eventType = textOrEmpty(raw, "eventType");
            boolean isAck = "ACK_STATE_UPDATE".equals(eventType);
            boolean isDelete = "ALARM_STATE_DELETE".equals(eventType);
            JsonNode node = (isAck || isDelete) ? mergeOntoLast(raw, lastInput, isAck, isDelete) : raw;

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

            ObjectNode out = MAPPER.createObjectNode();
            out.put("alarmId",        alarmId);
            out.put("severity",       severity);
            out.put("state",          state);
            out.put("priority",       priority);
            out.put("conditionActive",active);
            out.put("rbeTs",          System.currentTimeMillis());

            if (isDelete) {
                lastMetricFp.clear();
                lastInput.clear();
            } else {
                lastMetricFp.update(fp);
                lastInput.update(MAPPER.writeValueAsString(node));
            }

            return MAPPER.writeValueAsString(out);
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────

    /** 7-day backstop TTL on per-alarm RBE state (audit-jobs.md A8). */
    private static final StateTtlConfig STATE_TTL = StateTtlConfig
            .newBuilder(Time.days(7))
            .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
            .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
            .build();

    /**
     * Overlay a PARTIAL record (ack stub / delete marker) onto the last full
     * upsert for the alarm: acknowledged and conditionActive come from the
     * partial event; severity, priority, message and names keep their last real
     * values. Cold start (no stored input) falls back to the partial record
     * itself — still wrong-ish, but only until the alarm's next real state event,
     * and strictly better than always taking the stub.
     */
    private static JsonNode mergeOntoLast(JsonNode partial, ValueState<String> lastInput,
                                          boolean isAck, boolean isDelete) throws Exception {
        String prevJson = lastInput.value();
        if (prevJson == null) return partial;
        ObjectNode merged = (ObjectNode) MAPPER.readTree(prevJson);
        if (partial.has("acknowledged")) merged.put("acknowledged", partial.get("acknowledged").asBoolean());
        else if (isAck) merged.put("acknowledged", true);
        if (partial.has("conditionActive")) merged.put("conditionActive", partial.get("conditionActive").asBoolean(false));
        else if (isDelete) merged.put("conditionActive", false);
        if (partial.has("eventTimeEpochMs")) merged.put("eventTimeEpochMs", partial.get("eventTimeEpochMs").asLong());
        merged.remove("state"); // re-derive from the merged ack/active pair
        return merged;
    }

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

}
