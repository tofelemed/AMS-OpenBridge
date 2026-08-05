package com.ams.flink.cplm;

import org.apache.flink.api.common.RuntimeExecutionMode;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.java.utils.ParameterTool;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Isolated, bounded historical replay for CSV/PI archive imports.
 *
 * <p>The input topic belongs to one replay and is bounded at the offsets that
 * exist when the job starts. This deliberately avoids injecting old event time
 * into the continuously running CPLM jobs. Formula evaluation delegates to the
 * same native {@link CplmGateFusionEngine} used by production.</p>
 */
public final class CplmHistoricalReplayJob {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long EVALUATION_PERIOD_MS = 5_000L;

    private CplmHistoricalReplayJob() {
    }

    public static void main(String[] args) throws Exception {
        ParameterTool params = ParameterTool.fromArgs(args);
        String brokers = params.get("brokers",
                System.getenv().getOrDefault("KAFKA_BROKERS", "kafka:9092"));
        String inputTopic = params.getRequired("input-topic");
        String outputTopic = params.get("output-topic", "clpm.gate.results.v1");
        String loopId = params.getRequired("loop-id");
        String replayId = params.getRequired("replay-id");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setRuntimeMode(RuntimeExecutionMode.BATCH);
        env.setParallelism(1);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics(inputTopic)
                .setGroupId("ams-cplm-historical-" + replayId)
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setBounded(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        WatermarkStrategy<CplmNormalizedSample> watermarks = WatermarkStrategy
                .<CplmNormalizedSample>forBoundedOutOfOrderness(Duration.ZERO)
                .withTimestampAssigner((sample, ignored) -> sample.eventTsMs);

        DataStream<String> results = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "cplm-historical-replay-source")
                .map(CplmNormalizedSample::fromJson)
                .filter(sample -> sample != null
                        && sample.isValid
                        && loopId.equalsIgnoreCase(sample.loopId))
                .assignTimestampsAndWatermarks(watermarks)
                .keyBy(sample -> sample.loopId)
                .window(TumblingEventTimeWindows.of(Time.hours(24)))
                .process(new HistoricalWindowFunction(replayId))
                .name("cplm-historical-native-formula")
                .map(result -> withReplayLineage(result, replayId, inputTopic))
                .name("cplm-historical-lineage");

        results.sinkTo(KafkaSink.<String>builder()
                        .setBootstrapServers(brokers)
                        .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                                .setTopic(outputTopic)
                                .setValueSerializationSchema(new SimpleStringSchema())
                                .build())
                        .build())
                .name("cplm-historical-gate-sink")
                .setParallelism(1);

        env.execute("AMS - CPLM Historical Replay [" + replayId + "]");
    }

    static CplmGateResult computeWindow(
            List<CplmNormalizedSample> samples,
            long windowStart,
            long windowEnd) {
        List<CplmNormalizedSample> evaluationSamples = materializeEvaluationSamples(
                samples, windowStart, windowEnd, EVALUATION_PERIOD_MS);
        CplmNormalizedSample first = evaluationSamples.isEmpty()
                ? null : evaluationSamples.get(0);
        CplmLoopDynamicsProfile profile = CplmDynamicsParameterSetSupport.resolveFromSpine(
                first == null ? null : first.loopId,
                first == null ? null : first.loopType,
                first == null ? null : first.assetUuid);
        return CplmGateFusionEngine.fuseFromSamples(
                evaluationSamples, windowStart, windowEnd, "24h", false, false, profile);
    }

    /**
     * Materialize exception/compression events onto the design's 5-second
     * evaluation timeline. Source events remain untouched in Kafka/IoTDB; this
     * state-hold view exists only at the native formula boundary.
     */
    static List<CplmNormalizedSample> materializeEvaluationSamples(
            List<CplmNormalizedSample> sourceSamples,
            long windowStart,
            long windowEnd,
            long periodMs) {
        if (sourceSamples == null || sourceSamples.isEmpty() || periodMs <= 0) {
            return new ArrayList<>();
        }

        List<CplmNormalizedSample> ordered = new ArrayList<>(sourceSamples);
        ordered.sort(Comparator.comparingLong(sample -> sample.eventTsMs));
        long firstTs = Math.max(windowStart, ordered.get(0).eventTsMs);
        long lastTs = Math.min(windowEnd - 1, ordered.get(ordered.size() - 1).eventTsMs);
        long firstGridTs = Math.floorDiv(firstTs + periodMs - 1, periodMs) * periodMs;
        long endExclusive = Math.min(windowEnd, lastTs + 1);
        if (firstGridTs >= endExclusive) return new ArrayList<>();

        List<CplmNormalizedSample> materialized = new ArrayList<>(
                (int) Math.min(Integer.MAX_VALUE,
                        Math.max(0L, (endExclusive - firstGridTs + periodMs - 1) / periodMs)));
        int cursor = 0;
        CplmNormalizedSample held = ordered.get(0);
        for (long timestamp = firstGridTs; timestamp < endExclusive; timestamp += periodMs) {
            while (cursor + 1 < ordered.size()
                    && ordered.get(cursor + 1).eventTsMs <= timestamp) {
                held = ordered.get(++cursor);
            }
            if (held.eventTsMs <= timestamp) {
                materialized.add(copyAtTimestamp(held, timestamp));
            }
        }
        return materialized;
    }

    private static CplmNormalizedSample copyAtTimestamp(
            CplmNormalizedSample source,
            long timestamp) {
        CplmNormalizedSample copy = new CplmNormalizedSample();
        copy.loopId = source.loopId;
        copy.eventTsMs = timestamp;
        copy.pv = source.pv;
        copy.sp = source.sp;
        copy.op = source.op;
        copy.vp = source.vp;
        copy.mode = source.mode;
        copy.quality = source.quality;
        copy.isValid = source.isValid;
        copy.loopType = source.loopType;
        copy.assetUuid = source.assetUuid;
        copy.dynamicClassOverride = source.dynamicClassOverride;
        copy.resolvedProfile = source.resolvedProfile;
        return copy;
    }

    private static String withReplayLineage(
            CplmGateResult result,
            String replayId,
            String inputTopic) throws Exception {
        ObjectNode root = (ObjectNode) MAPPER.readTree(result.toJson());
        root.put("replay_id", replayId);
        root.put("calculation_source", "flink-historical-replay");
        root.put("replay_input_topic", inputTopic);
        return MAPPER.writeValueAsString(root);
    }

    static final class HistoricalWindowFunction extends ProcessWindowFunction<
            CplmNormalizedSample, CplmGateResult, String, TimeWindow> {
        private final String replayId;

        HistoricalWindowFunction(String replayId) {
            this.replayId = replayId;
        }

        @Override
        public void process(
                String loopId,
                Context context,
                Iterable<CplmNormalizedSample> elements,
                Collector<CplmGateResult> out) {
            List<CplmNormalizedSample> samples = new ArrayList<>();
            for (CplmNormalizedSample sample : elements) {
                if (sample != null
                        && sample.eventTsMs >= context.window().getStart()
                        && sample.eventTsMs < context.window().getEnd()) {
                    samples.add(sample);
                }
            }
            if (!samples.isEmpty()) {
                out.collect(computeWindow(
                        samples, context.window().getStart(), context.window().getEnd()));
            }
        }

        @Override
        public String toString() {
            return "HistoricalWindowFunction{" + replayId + '}';
        }
    }
}
