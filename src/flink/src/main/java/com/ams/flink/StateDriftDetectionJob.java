package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.co.KeyedCoProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;

import java.time.Duration;

public class StateDriftDetectionJob {

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        PipelineConfig cfg = PipelineConfig.fromArgs(args);
        String brokers = cfg.brokers;

        // Source 1: Raw Events
        KafkaSource<String> rawEventsSource = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics("traverse.alarm.events.raw")
                .setGroupId("flink-drift-detector")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        // Source 2: Active State
        KafkaSource<String> activeStateSource = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics("traverse.alarm.state.active")
                .setGroupId("flink-drift-detector")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<String> rawEvents = env.fromSource(rawEventsSource, 
                WatermarkStrategy.forBoundedOutOfOrderness(Duration.ofSeconds(5)), "Raw Events");

        DataStream<String> activeState = env.fromSource(activeStateSource, 
                WatermarkStrategy.forBoundedOutOfOrderness(Duration.ofSeconds(5)), "Active State");

        // Simple Drift Detection Logic
        DataStream<String> driftAlerts = rawEvents
                .keyBy(json -> extractId(json))
                .connect(activeState.keyBy(json -> extractId(json)))
                .process(new DriftDetectorFunction());

        KafkaSink<String> sink = KafkaSink.<String>builder()
                .setBootstrapServers(brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("traverse.system.state.drift.alerts")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        driftAlerts.sinkTo(sink).name("Drift Alerts Sink");

        env.execute("AMS State Drift Detection Engine");
    }

    private static String extractId(String json) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(json);
            return AlarmJson.text(node, "Id", "id");
        } catch (Exception e) {
            return "unknown";
        }
    }

    public static class DriftDetectorFunction extends KeyedCoProcessFunction<String, String, String, String> {
        private transient ValueState<Boolean> eventSeen;
        private transient ValueState<Boolean> stateSeen;

        @Override
        public void open(Configuration parameters) throws Exception {
            eventSeen = getRuntimeContext().getState(new ValueStateDescriptor<>("eventSeen", Boolean.class));
            stateSeen = getRuntimeContext().getState(new ValueStateDescriptor<>("stateSeen", Boolean.class));
        }

        @Override
        public void processElement1(String rawEvent, Context ctx, Collector<String> out) throws Exception {
            eventSeen.update(true);
            // If an event is seen, we expect state to update soon. Register timer for 10 seconds.
            ctx.timerService().registerProcessingTimeTimer(ctx.timerService().currentProcessingTime() + 10000);
        }

        @Override
        public void processElement2(String activeState, Context ctx, Collector<String> out) throws Exception {
            stateSeen.update(true);
            // If state updates, we are good.
        }

        @Override
        public void onTimer(long timestamp, OnTimerContext ctx, Collector<String> out) throws Exception {
            Boolean hasEvent = eventSeen.value();
            Boolean hasState = stateSeen.value();

            if (Boolean.TRUE.equals(hasEvent) && hasState == null) {
                // Event arrived but no state update within 10s = DRIFT!
                String alert = String.format("{\"alarmId\":\"%s\",\"type\":\"DRIFT_MISSING_STATE\",\"timestamp\":%d}", 
                    ctx.getCurrentKey(), timestamp);
                out.collect(alert);
            }
            
            eventSeen.clear();
            stateSeen.clear();
        }
    }
}
