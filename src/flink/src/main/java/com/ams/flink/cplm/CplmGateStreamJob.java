package com.ams.flink.cplm;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CPLM Unified Gate Engine — strict Event-Time Tumbling Windows.
 * Computes Gates 0–15 on a bounded collection of elements.
 */
public class CplmGateStreamJob {

    public static void main(String[] args) throws Exception {
        CplmJobConfig cfg = CplmJobConfig.fromArgs(args);
        cfg = new CplmJobConfig(cfg.brokers, "AMS - CPLM Unified Gate Engine",
                cfg.consumerGroupId, cfg.inputTopic, cfg.outputTopic,
                cfg.shortFeatureTopic, cfg.longFeatureTopic, 24, cfg.outOfOrdernessMinutes);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        env.enableCheckpointing(300_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(120_000);
        env.getCheckpointConfig().setCheckpointTimeout(600_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        DataStream<String> out = CplmIngestPipeline
                .build(env, cfg, "cplm-normalized-source")
                .keyBy(s -> s.loopId)
                .window(TumblingEventTimeWindows.of(Time.hours(24)))
                .process(new CplmGateWindowFunction())
                .name("cplm-gate-window")
                .map(CplmGateResult::toJson)
                .name("cplm-gate-serialize");

        KafkaSink<String> sink = KafkaSink.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic(cfg.outputTopic)
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        out.sinkTo(sink).name("cplm-gate-sink");
        env.execute(cfg.jobName);
    }

    static class CplmGateWindowFunction extends ProcessWindowFunction<CplmNormalizedSample, CplmGateResult, String, TimeWindow> {
        @Override
        public void process(String loopId, Context ctx, Iterable<CplmNormalizedSample> elements, Collector<CplmGateResult> out) {
            List<CplmNormalizedSample> batch = new ArrayList<>();
            for (CplmNormalizedSample s : elements) batch.add(s);
            out.collect(CplmGateEngine.compute(batch, ctx.window().getStart(), ctx.window().getEnd()));
        }
    }
}
