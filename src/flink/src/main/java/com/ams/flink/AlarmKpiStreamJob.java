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
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.streaming.api.functions.windowing.ProcessAllWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.time.Duration;

public class AlarmKpiStreamJob {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        env.enableCheckpointing(60_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(10_000);
        env.getCheckpointConfig().setCheckpointTimeout(300_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        // Consume Lifecycle Events to detect ACTIVE and CLEARED transitions
        KafkaSource<String> lifecycleSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("lifecycle-events")
                .setGroupId("flink-ams-alarm-kpi")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        WatermarkStrategy<String> watermarkStrategy = WatermarkStrategy
                .<String>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((json, timestamp) -> {
                    try {
                        JsonNode root = MAPPER.readTree(json);
                        return root.has("timestampEpochMs") ? root.get("timestampEpochMs").asLong() : System.currentTimeMillis();
                    } catch (Exception e) {
                        return System.currentTimeMillis();
                    }
                });

        DataStream<String> lifecycleStream = env
                .fromSource(lifecycleSource, WatermarkStrategy.noWatermarks(), "lifecycle-source")
                .assignTimestampsAndWatermarks(watermarkStrategy)
                .name("lifecycle-kpi-ingest")
                .uid("lifecycle-kpi-ingest");

        // 1. Alarm Rate & Flood Detection (10 min sliding window, sliding every 1 min)
        DataStream<AlarmKpiResult> alarmRates = lifecycleStream
                .filter(json -> {
                    try {
                        JsonNode node = MAPPER.readTree(json);
                        return "ACTIVE".equalsIgnoreCase(node.get("lifecycleState").asText());
                    } catch (Exception e) { return false; }
                })
                .windowAll(SlidingEventTimeWindows.of(Time.minutes(10), Time.minutes(1)))
                .process(new AlarmRateProcessWindowFunction())
                .name("alarm-rate-10m")
                .uid("alarm-rate-10m");

        KafkaSink<String> ratesSink = KafkaSink.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("kpi-alarm-rates")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        alarmRates.map(AlarmKpiResult::toJson).sinkTo(ratesSink).name("rates-sink");

        // 2. Standing Alarms Snapshot (Tracking Active vs Cleared)
        DataStream<AlarmKpiResult> standingSnapshot = lifecycleStream
                .keyBy(json -> "GLOBAL") // Simple global counter for lab purposes
                .process(new StandingAlarmTracker())
                .name("standing-alarm-tracker")
                .uid("standing-alarm-tracker");

        KafkaSink<String> standingSink = KafkaSink.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("kpi-standing-snapshots")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        standingSnapshot.map(AlarmKpiResult::toJson).sinkTo(standingSink).name("standing-sink");

        env.execute("AMS - Alarm KPI Engine");
    }

    public static class AlarmRateProcessWindowFunction extends ProcessAllWindowFunction<String, AlarmKpiResult, TimeWindow> {
        @Override
        public void process(Context context, Iterable<String> elements, Collector<AlarmKpiResult> out) {
            int count = 0;
            for (String ignored : elements) {
                count++;
            }

            AlarmKpiResult result = new AlarmKpiResult();
            result.kpiType = "ALARM_RATE";
            result.windowStartMs = context.window().getStart();
            result.windowEndMs = context.window().getEnd();
            result.alarmCount = count;

            if (count > 50) {
                result.floodStatus = "SEVERE_FLOOD";
            } else if (count > 20) {
                result.floodStatus = "MAJOR_FLOOD";
            } else if (count > 10) {
                result.floodStatus = "MINOR_FLOOD";
            } else {
                result.floodStatus = "NORMAL";
            }

            out.collect(result);
        }
    }

    public static class StandingAlarmTracker extends KeyedProcessFunction<String, String, AlarmKpiResult> {
        private ValueState<Integer> standingCount;

        @Override
        public void open(Configuration parameters) {
            standingCount = getRuntimeContext().getState(new ValueStateDescriptor<>("standingCount", Integer.class));
        }

        @Override
        public void processElement(String json, Context ctx, Collector<AlarmKpiResult> out) throws Exception {
            Integer current = standingCount.value();
            if (current == null) current = 0;

            JsonNode node = MAPPER.readTree(json);
            String state = node.get("lifecycleState").asText("");

            if ("ACTIVE".equalsIgnoreCase(state)) {
                current++;
            } else if ("CLEARED".equalsIgnoreCase(state)) {
                current = Math.max(0, current - 1);
            }

            standingCount.update(current);

            AlarmKpiResult result = new AlarmKpiResult();
            result.kpiType = "STANDING_ALARM_SNAPSHOT";
            result.windowStartMs = ctx.timestamp();
            result.windowEndMs = ctx.timestamp();
            result.standingCount = current;
            result.oldestStandingDurationMs = 0; // Requires complex state map to track oldest, simplified for demo

            out.collect(result);
        }
    }
}
