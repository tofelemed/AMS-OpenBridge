package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Phase 2: AlarmStateExportJob
 * Subscribes to the active alarm state stream and emits DELTA changes (INSERT, UPDATE, REMOVE)
 * to flink.state.alarm.delta to be consumed by the frontend for real-time observability.
 */
public class AlarmStateExportJob {

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

        // Consume current-alarm-state as the source of truth for "active state updates" in Flink
        KafkaSource<String> stateSource = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics("current-alarm-state")
                .setGroupId("flink-state-export-job")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<String> stateUpdates = env.fromSource(stateSource, 
                WatermarkStrategy.noWatermarks(), "Current State Source");

        DataStream<String> deltaState = stateUpdates
                .keyBy(json -> extractId(json))
                .process(new StateDeltaFunction())
                .name("Delta State Computation")
                .uid("Delta State Computation");

        KafkaSink<String> sink = KafkaSink.<String>builder()
                .setBootstrapServers(brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("flink.state.alarm.delta")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        deltaState.sinkTo(sink).name("Delta State Sink");

        env.execute("AMS Alarm State Export Engine");
    }

    /**
     * STR-08 — this read "Id"/"id", but current-alarm-state records carry the identity as
     * "alarmId". Every record therefore fell through to the "unknown" fallback and the whole
     * stream keyed to a single partition, so the per-alarm delta state was meaningless (one
     * shared previousState for every alarm in the plant). "Id"/"id" are kept as fallbacks for
     * any legacy producer.
     */
    private static String extractId(String json) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(json);
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
        private transient ValueState<String> previousState;
        private transient ObjectMapper mapper;

        @Override
        public void open(Configuration parameters) throws Exception {
            previousState = getRuntimeContext().getState(new ValueStateDescriptor<>("previousAlarmState", String.class));
            mapper = new ObjectMapper();
        }

        @Override
        public void processElement(String currentJson, Context ctx, Collector<String> out) throws Exception {
            String prevJson = previousState.value();
            
            JsonNode current = mapper.readTree(currentJson);
            String id = ctx.getCurrentKey();
            
            // Check if this is a DELETE signal (e.g. condition no longer active and acknowledged)
            boolean isDelete = false;
            if (current.has("action") && "delete".equals(current.get("action").asText())) {
                isDelete = true;
            } else if (current.has("conditionActive") && !current.get("conditionActive").asBoolean() && 
                       current.has("acknowledged") && current.get("acknowledged").asBoolean()) {
                isDelete = true;
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
