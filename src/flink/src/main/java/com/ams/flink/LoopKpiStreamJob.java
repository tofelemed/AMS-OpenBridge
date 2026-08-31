package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class LoopKpiStreamJob {
    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // Independent checkpoints for the analytical job
        env.enableCheckpointing(180_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(60_000);
        env.getCheckpointConfig().setCheckpointTimeout(300_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        KafkaSource<String> rawLoopSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("traverse.cpa.loop-raw-data")
                .setGroupId("traverse-cpa-flink-loop-kpi")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        WatermarkStrategy<RawLoopData> watermarkStrategy = WatermarkStrategy
                .<RawLoopData>forBoundedOutOfOrderness(Duration.ofSeconds(10))
                .withTimestampAssigner((event, timestamp) -> event.timestampEpochMs);

        DataStream<RawLoopData> rawStream = env
                .fromSource(rawLoopSource, WatermarkStrategy.noWatermarks(), "loop-raw-data-source")
                .map(RawLoopData::fromJson)
                .filter(d -> d != null && d.isValid)
                .assignTimestampsAndWatermarks(watermarkStrategy)
                .name("loop-data-validation")
                .uid("loop-data-validation");

        DataStream<String> kpiStream = rawStream
                .keyBy(d -> d.tagId)
                .window(TumblingEventTimeWindows.of(Time.minutes(5)))
                .process(new LoopKpiWindowFunction())
                .name("loop-kpi-5m-window")
                .uid("loop-kpi-5m-window")
                .map(LoopKpiResult::toJson)
                .name("loop-kpi-serialization")
                .uid("loop-kpi-serialization");

        KafkaSink<String> kpiSink = KafkaSink.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("traverse.cpa.loop-kpis-5m")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        kpiStream.sinkTo(kpiSink).name("loop-kpi-sink");

        env.execute("AMS - Loop KPI Engine");
    }

    public static class LoopKpiWindowFunction extends ProcessWindowFunction<RawLoopData, LoopKpiResult, String, TimeWindow> {
        @Override
        public void process(String tagId, Context context, Iterable<RawLoopData> elements, Collector<LoopKpiResult> out) {
            double iae = 0.0;
            double ise = 0.0;
            int count = 0;
            Map<String, Integer> modeCounts = new HashMap<>();

            for (RawLoopData d : elements) {
                double error = d.sp - d.pv;
                iae += Math.abs(error);
                ise += (error * error);
                modeCounts.put(d.mode, modeCounts.getOrDefault(d.mode, 0) + 1);
                count++;
            }

            String dominantMode = "UNKNOWN";
            int maxModeCount = -1;
            for (Map.Entry<String, Integer> entry : modeCounts.entrySet()) {
                if (entry.getValue() > maxModeCount) {
                    maxModeCount = entry.getValue();
                    dominantMode = entry.getKey();
                }
            }

            LoopKpiResult result = new LoopKpiResult();
            result.tagId = tagId;
            result.windowStartMs = context.window().getStart();
            result.windowEndMs = context.window().getEnd();
            result.iae = iae;
            result.ise = ise;
            result.sampleCount = count;
            result.dominantMode = dominantMode;

            out.collect(result);
        }
    }
}
