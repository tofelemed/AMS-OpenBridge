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

/**
 * Flink job: raw-alarms → Apache IoTDB historian.
 *
 * Consumes every alarm event from raw-alarms, converts it to an
 * {@link IoTDBAlarmRow}, and writes via {@link FailLoudIoTDBSink} (checkpoint-
 * integrated batches; a failed write fails the checkpoint instead of dropping).
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

    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(IoTDBPersistenceJob.class);

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
                // committed-with-earliest-fallback: fresh submits continue where the
                // group left off instead of replaying the whole topic (prod item 4).
                .setStartingOffsets(OffsetsInitializer.committedOffsets(
                        org.apache.kafka.clients.consumer.OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        DataStream<IoTDBAlarmRow> rows = env
                .fromSource(rawSource, WatermarkStrategy.noWatermarks(), "raw-alarms-iotdb")
                .map(IoTDBPersistenceJob::parseToRow)
                .filter(r -> r != null)
                .name("iotdb-parse-filter")
                .uid("iotdb-parse-filter");

        // PIPE-014: FailLoudIoTDBSink replaces the upstream IoTDBSink, whose
        // background flush swallowed write errors while checkpoints completed —
        // committed offsets then pointed past records that only existed in a heap
        // buffer. This sink flushes inside snapshotState() and THROWS on failure.
        rows.addSink(new FailLoudIoTDBSink(
                        cfg.iotdbHost, cfg.iotdbPort, cfg.iotdbUser, cfg.iotdbPass,
                        cfg.iotdbBatchSize))
            .name("iotdb-alarm-sink")
            .uid("iotdb-alarm-sink");

        env.execute("AMS - IoTDB Alarm Persistence");
    }

    // ── Sanitisation collision guard (DATA-07) ─────────────────────────────
    // Distinct alarm ids can collapse to one IoTDB path segment (FIC-101 and
    // FIC.101 both become FIC_101) — their histories would silently interleave.
    // Bounded map of sanitised → first-seen original; a DIFFERENT original
    // arriving for the same sanitised value logs a warning so the collision is
    // visible instead of silent. Renaming stored series is a migration decision
    // (docs/alarm-identity-contract.md), not something this job does unilaterally.
    private static final java.util.concurrent.ConcurrentHashMap<String, String> SANITISED_TO_ORIGINAL =
            new java.util.concurrent.ConcurrentHashMap<>();
    private static final int COLLISION_GUARD_MAX_ENTRIES = 50_000;

    static void warnOnSanitisationCollision(String original, String sanitised) {
        if (SANITISED_TO_ORIGINAL.size() >= COLLISION_GUARD_MAX_ENTRIES
                && !SANITISED_TO_ORIGINAL.containsKey(sanitised)) {
            return; // guard full — stop tracking new ids rather than growing unbounded
        }
        String firstSeen = SANITISED_TO_ORIGINAL.putIfAbsent(sanitised, original);
        if (firstSeen != null && !firstSeen.equals(original)) {
            LOG.warn("IoTDB path collision: alarm ids '{}' and '{}' both sanitise to '{}' — "
                    + "their historian series interleave under one device path",
                    firstSeen, original, sanitised);
        }
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
            // Sanitise for IoTDB path: alphanumerics and underscores only (no hyphens/dots).
            // THE canonical alarm-identity rule (docs/alarm-identity-contract.md): every
            // consumer (binding-resolver /resolve/alarm, the browser fallback) derives the
            // same [^A-Za-z0-9_] -> '_' over the Kafka alarmId. Do not change one without
            // the others — stored IoTDB series are addressed by this exact rule.
            String safePath = alarmId.replaceAll("[^a-zA-Z0-9_]", "_");
            warnOnSanitisationCollision(alarmId, safePath);
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
            // PIPE-007: CRITICAL must normalize to 900, matching
            // PipelineOperators.priorityToSeverity — the historian and the
            // Postgres projection must agree on one value for the same alarm.
            // (950 also collided with the flood-band constant.)
            case "CRITICAL":   return 900;
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
