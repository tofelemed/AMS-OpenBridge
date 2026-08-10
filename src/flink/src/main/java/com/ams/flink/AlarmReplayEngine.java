package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.api.java.utils.ParameterTool;

/**
 * Isolated Replay Orchestration Engine for AMS.
 * Runs independently, seeking Kafka to a specific timestamp, filtering for a specific correlation ID,
 * and applying the standard alarm lifecycle state machine.
 */
public class AlarmReplayEngine {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        ParameterTool params = ParameterTool.fromArgs(args);
        String brokers = params.get("brokers", System.getenv().getOrDefault("KAFKA_BROKERS", "kafka:9092"));
        String correlationId = params.getRequired("correlationId");
        long startTimestamp = params.getLong("startTimestamp");
        String replayId = params.getRequired("replayId");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // Use isolated checkpointing and consumer group to prevent live interference
        env.enableCheckpointing(30_000, CheckpointingMode.EXACTLY_ONCE);
        
        KafkaSource<String> rawSource = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics("alarm.events.raw")
                .setGroupId("ams-replay-cg-" + replayId)
                .setStartingOffsets(OffsetsInitializer.timestamp(startTimestamp))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        SingleOutputStreamOperator<RawOpcAlarmEvent> filteredAndValidated = env
                .fromSource(rawSource, WatermarkStrategy.noWatermarks(), "raw-alarms-source")
                .setParallelism(1)
                .map(new PipelineOperators.ValidationMap())
                .name("validation")
                .uid("validation")
                .setParallelism(1)
                .filter(e -> e != null && correlationId.equals(e.getAlarmKey()))
                .name("correlation-filter")
                .uid("correlation-filter");

        // Exact same logic as live production pipeline
        SingleOutputStreamOperator<RawOpcAlarmEvent> deduped = filteredAndValidated
                .keyBy(RawOpcAlarmEvent::getAlarmKey)
                .filter(new PipelineOperators.DedupFilter())
                .name("deduplication")
                .uid("deduplication")
                .setParallelism(1);

        SingleOutputStreamOperator<RawOpcAlarmEvent> normalized = deduped
                .map(new PipelineOperators.EnrichmentMap())
                .name("normalization")
                .uid("normalization")
                .setParallelism(1)
                .filter(e -> e != null);

        SingleOutputStreamOperator<RawOpcAlarmEvent> soeOrdered = normalized
                .map(new PipelineOperators.SoeOrderMap())
                .name("soe-ordering")
                .uid("soe-ordering")
                .setParallelism(1);

        SingleOutputStreamOperator<RawOpcAlarmEvent> lifecycleStream = soeOrdered
                .keyBy(RawOpcAlarmEvent::getAlarmKey)
                .map(new PipelineOperators.LifecycleMap())
                .name("lifecycle-engine")
                .uid("lifecycle-engine")
                .setParallelism(1);

        // Convert state outputs into a delta/replay format
        lifecycleStream.map(e -> {
            ObjectNode root = MAPPER.createObjectNode();
            root.put("replay_id", replayId);
            root.put("correlation_id", e.getAlarmKey());
            root.put("timestamp", System.currentTimeMillis());
            
            // For replay, every transition is technically an "UPDATE" or "INSERT" for the visualization timeline
            root.put("change_type", e.conditionActive ? "UPDATE" : "REMOVE");
            
            String currentStateJson = e.conditionActive 
                ? PipelineOperators.toCurrentAlarmStateJson(e, e.acknowledged) 
                : PipelineOperators.toDeleteAlarmStateJson(e);
                
            root.set("current_state", MAPPER.readTree(currentStateJson));
            return root.toString();
        })
        .name("replay-delta-formatter")
        .uid("replay-delta-formatter")
        .setParallelism(1)
        .sinkTo(
            KafkaSink.<String>builder()
                .setBootstrapServers(brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("flink.state.alarm.replay")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build()
                )
                .build()
        )
        .name("replay-sink")
        .uid("replay-sink")
        .setParallelism(1);

        env.execute("AMS Alarm Replay Engine [" + replayId + "]");
    }
}
