package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.iotdb.flink.IoTDBSink;
import org.apache.iotdb.flink.options.IoTDBSinkOptions;

/**
 * Flink job: raw-alarms → Apache IoTDB historian.
 *
 * Consumes every alarm event from raw-alarms, converts it to an
 * {@link IoTDBAlarmRow}, and writes via the flink-iotdb-connector (Tablet batches).
 *
 * IoTDB tree path: root.ams.site1.alarms.<sanitised_alarmId>
 * Measurements: severity, state, ack_status, condition_active, priority, source_name, condition_name
 *
 * Semantics:
 *  - At-least-once (sufficient: IoTDB (series, timestamp) writes are idempotent).
 *  - Checkpoints every 60 s so replays after restart produce no duplicate rows.
 *
 * Spec reference: §5 "Persistence job", §8.1 "Flink → IoTDB".
 */
public class IoTDBPersistenceJob {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    /** IoTDB namespace prefix — align with §7 tree model. */
    private static final String PATH_PREFIX = "root.ams.site1.alarms.";

    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        // At-least-once is safe: IoTDB (series, ts) is idempotent on replay
        env.enableCheckpointing(60_000, CheckpointingMode.AT_LEAST_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(20_000);
        env.getCheckpointConfig().setCheckpointTimeout(120_000);

        KafkaSource<String> rawSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("raw-alarms")
                .setGroupId("flink-ams-iotdb-persistence")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        DataStream<IoTDBAlarmRow> rows = env
                .fromSource(rawSource, WatermarkStrategy.noWatermarks(), "raw-alarms-iotdb")
                .map(IoTDBPersistenceJob::parseToRow)
                .filter(r -> r != null)
                .name("iotdb-parse-filter");

        rows.addSink(buildSink(cfg))
            .name("iotdb-alarm-sink");

        env.execute("AMS - IoTDB Alarm Persistence");
    }

    // ── Sink builder ───────────────────────────────────────────────────────

    private static IoTDBSink<IoTDBAlarmRow> buildSink(PipelineConfig cfg) {
        // IoTDBSinkOptions(host, port, user, password, timeseriesOptionList)
        // timeseriesOptionList = null when enable_auto_create_schema=true on the server
        IoTDBSinkOptions opts = new IoTDBSinkOptions(
                cfg.iotdbHost,
                cfg.iotdbPort,
                cfg.iotdbUser,
                cfg.iotdbPass,
                null   // server auto-creates schema; no pre-registration needed
        );

        IoTDBSink<IoTDBAlarmRow> sink = new IoTDBSink<>(opts, new AlarmIoTSerializationSchema());
        sink.withBatchSize(cfg.iotdbBatchSize);   // commit every N rows
        sink.withFlushIntervalMs(5_000);           // or every 5 s, whichever comes first
        return sink;
    }

    // ── JSON → IoTDBAlarmRow ───────────────────────────────────────────────

    /**
     * Converts a raw-alarms JSON string to an {@link IoTDBAlarmRow}.
     * Handles both HTTP feed format (alarmId + state fields) and OPC feed format.
     * Returns null on parse failure or if required fields are missing.
     */
    static IoTDBAlarmRow parseToRow(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);

            // ── Identity ──────────────────────────────────────────────────
            String source    = AlarmJson.text(node, "sourceName", "sourcePath");
            String condition = AlarmJson.text(node, "conditionName", "condition");
            if (source.isEmpty() || condition.isEmpty()) return null;

            String alarmId = AlarmJson.text(node, "alarmId", null);
            if (alarmId.isEmpty()) {
                String serverId = AlarmJson.text(node, "serverId", "opcServer");
                String subCond  = AlarmJson.text(node, "subConditionName", null);
                alarmId = AlarmKeys.stableAlarmId(
                        AlarmKeys.alarmKey(serverId, source, condition, subCond));
            }
            // Sanitise for IoTDB path: only alphanumerics, underscores and dashes
            String safePath = alarmId.replaceAll("[^a-zA-Z0-9_\\-]", "_");
            String devicePath = PATH_PREFIX + safePath;

            // ── Timestamp ─────────────────────────────────────────────────
            long ts = AlarmJson.field(node, "eventTimeEpochMs", "activeTimeEpochMs").asLong(0);
            if (ts <= 0) ts = System.currentTimeMillis();

            // ── Values ────────────────────────────────────────────────────
            boolean httpFeed = node.has("alarmId") && node.has("state");

            int severity;
            boolean conditionActive;
            if (httpFeed) {
                severity = priorityToSeverity(AlarmJson.text(node, "priority", null));
                String stateStr = AlarmJson.text(node, "state", "ACTIVE");
                conditionActive = !"CLEARED".equalsIgnoreCase(stateStr);
            } else {
                severity        = node.has("severity") ? node.get("severity").asInt(300) : 300;
                conditionActive = !node.has("conditionActive") || node.get("conditionActive").asBoolean(true);
            }

            boolean ackStatus = node.has("acknowledged") && node.get("acknowledged").asBoolean();

            // Derive state string
            String state;
            if (!conditionActive)       state = "CLEARED";
            else if (ackStatus)         state = "ACKNOWLEDGED";
            else                        state = "ACTIVE";

            // Priority from JSON or derived from severity
            String priority = AlarmJson.text(node, "priority", null);
            if (priority.isEmpty()) priority = severityToPriority(severity);

            return new IoTDBAlarmRow(
                    devicePath,
                    ts,
                    severity,
                    state,
                    ackStatus,
                    conditionActive,
                    priority,
                    source,
                    condition);

        } catch (Exception e) {
            return null;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static int priorityToSeverity(String priority) {
        if (priority == null) return 300;
        switch (priority.toUpperCase()) {
            case "CRITICAL":   return 950;
            case "HIGH":       return 700;
            case "MEDIUM":     return 400;
            case "LOW":        return 100;
            case "DIAGNOSTIC": return 50;
            default:           return 300;
        }
    }

    private static String severityToPriority(int severity) {
        if (severity >= 900) return "CRITICAL";
        if (severity >= 700) return "HIGH";
        if (severity >= 400) return "MEDIUM";
        if (severity >= 100) return "LOW";
        return "DIAGNOSTIC";
    }
}
