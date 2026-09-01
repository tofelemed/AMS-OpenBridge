package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.kafka.clients.consumer.OffsetResetStrategy;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * AlarmStateExportJob — subscribes to traverse.alarm.current-alarm-state and emits
 * DELTA changes (INSERT, UPDATE, REMOVE) to traverse.alarm.flink.state.alarm.delta,
 * consumed by ams-api's AlarmStateDeltaConsumerService → ObservabilityHub.
 *
 * Delta semantics (audit-jobs.md A2 fix): the real delete signal is the state
 * machine's eventType=ALARM_STATE_DELETE (emitted for ANY clear, acknowledged or
 * not). The old heuristic (`conditionActive==false && acknowledged==true`) never
 * matched an unacknowledged clear, so those alarms were exported as UPDATE forever
 * and their keyed state never cleared. `action=="delete"` is kept as a legacy
 * fallback only.
 */
public class AlarmStateExportJob {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        PipelineConfig cfg = PipelineConfig.fromArgs(args);
        String brokers = cfg.brokers;

        // STR-08: this job had NO checkpointing at all, so its keyed delta state was never
        // snapshotted and source offsets were never committed through a checkpoint — a
        // restart silently replayed or skipped state transitions. AT_LEAST_ONCE is enough:
        // the downstream consumer applies deltas by alarm id and is idempotent.
        env.enableCheckpointing(30_000, CheckpointingMode.AT_LEAST_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(10_000);
        env.getCheckpointConfig().setCheckpointTimeout(60_000);

        // audit-jobs.md A7: latest() on the compacted state topic skipped the whole
        // retained alarm state on a cold submit. Committed offsets, earliest fallback.
        KafkaSource<String> stateSource = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics("traverse.alarm.current-alarm-state")
                .setGroupId("flink-state-export-job")
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<String> stateUpdates = env.fromSource(stateSource,
                WatermarkStrategy.noWatermarks(), "Current State Source");

        DataStream<String> deltaState = stateUpdates
                .keyBy(json -> extractId(json))
                .process(new StateDeltaFunction())
                .name("Delta State Computation")
                .uid("Delta State Computation");

        // audit-jobs.md A6: the stream is keyed by alarmId but the sink was unkeyed,
        // so per-alarm delta ordering was lost across the topic's 4 partitions.
        deltaState
                .sinkTo(KafkaSinks.keyedByJsonField(brokers, "traverse.alarm.flink.state.alarm.delta", "correlation_id"))
                .name("Delta State Sink")
                .uid("Delta State Sink");

        env.execute("AMS Alarm State Export Engine");
    }

    /**
     * STR-08 — this read "Id"/"id", but traverse.alarm.current-alarm-state records carry the identity as
     * "alarmId". Every record therefore fell through to the "unknown" fallback and the whole
     * stream keyed to a single partition, so the per-alarm delta state was meaningless (one
     * shared previousState for every alarm in the plant). "Id"/"id" are kept as fallbacks for
     * any legacy producer.
     */
    private static String extractId(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            String id = AlarmJson.text(node, "alarmId", "AlarmId");
            if (id == null || id.isEmpty()) {
                id = AlarmJson.text(node, "Id", "id");
            }
            return (id == null || id.isEmpty()) ? "unknown" : id;
        } catch (Exception e) {
            return "unknown";
        }
    }

    public static class StateDeltaFunction extends KeyedProcessFunction<String, String, String> {
        /** 7-day backstop TTL (audit-jobs.md A8); REMOVE clears eagerly. */
        private static final StateTtlConfig STATE_TTL = StateTtlConfig
                .newBuilder(Time.days(7))
                .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
                .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
                .build();

        private transient ValueState<String> previousState;
        private transient ObjectMapper mapper;

        @Override
        public void open(Configuration parameters) throws Exception {
            ValueStateDescriptor<String> desc = new ValueStateDescriptor<>("previousAlarmState", String.class);
            desc.enableTimeToLive(STATE_TTL);
            previousState = getRuntimeContext().getState(desc);
            mapper = new ObjectMapper();
        }

        @Override
        public void processElement(String currentJson, Context ctx, Collector<String> out) throws Exception {
            // audit-jobs.md A12: an unguarded readTree here restart-looped the job
            // on one malformed record. Skip it instead — the delta stream is an
            // observability feed, not the system of record.
            JsonNode current;
            try {
                current = mapper.readTree(currentJson);
            } catch (Exception e) {
                return;
            }
            String prevJson = previousState.value();
            String id = ctx.getCurrentKey();

            String eventType = current.has("eventType") ? current.get("eventType").asText("") : "";
            boolean isDelete = "ALARM_STATE_DELETE".equals(eventType)
                    || (current.has("action") && "delete".equals(current.get("action").asText()));

            // audit-jobs.md A1: the ACK stub is a PARTIAL record (severity=100,
            // priority=LOW hardcoded, conditionActive omitted). Exporting it as
            // current_state repainted the alarm in the delta feed. Merge the ack
            // onto the previous full state instead.
            if ("ACK_STATE_UPDATE".equals(eventType) && prevJson != null) {
                ObjectNode merged = (ObjectNode) mapper.readTree(prevJson);
                merged.put("acknowledged",
                        !current.has("acknowledged") || current.get("acknowledged").asBoolean(true));
                if (current.has("ackLifecycleState"))
                    merged.set("ackLifecycleState", current.get("ackLifecycleState"));
                current = merged;
                currentJson = mapper.writeValueAsString(merged);
            }

            ObjectNode deltaNode = mapper.createObjectNode();
            deltaNode.put("correlation_id", id);
            deltaNode.put("timestamp", System.currentTimeMillis());

            if (prevJson == null) {
                if (!isDelete) {
                    deltaNode.put("change_type", "INSERT");
                    deltaNode.set("current_state", current);
                    previousState.update(currentJson);
                    out.collect(mapper.writeValueAsString(deltaNode));
                }
            } else {
                if (isDelete) {
                    deltaNode.put("change_type", "REMOVE");
                    deltaNode.set("previous_state", mapper.readTree(prevJson));
                    previousState.clear();
                    out.collect(mapper.writeValueAsString(deltaNode));
                } else {
                    if (!prevJson.equals(currentJson)) {
                        deltaNode.put("change_type", "UPDATE");
                        deltaNode.set("previous_state", mapper.readTree(prevJson));
                        deltaNode.set("current_state", current);
                        previousState.update(currentJson);
                        out.collect(mapper.writeValueAsString(deltaNode));
                    }
                }
            }
        }
    }
}
