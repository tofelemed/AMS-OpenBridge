package com.ams.flink.cplm;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.MapState;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeHint;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.kafka.clients.consumer.OffsetResetStrategy;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.co.KeyedCoProcessFunction;
import org.apache.flink.util.Collector;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Stage 3 - Gate fusion job: join of short + long feature streams (Gates 12-15)
 * with keyed temporal persistence (calc v3.0.0).
 * Sources: clpm.feature.short.v1 + clpm.feature.long.v1. Sink: clpm.gate.results.v1
 */
public class CplmGateFusionStreamJob {

    public static void main(String[] args) throws Exception {
        CplmJobConfig cfg = CplmJobConfig.fromArgs(args);
        cfg = new CplmJobConfig(cfg.brokers, "AMS - CPLM Gate Fusion Engine",
                cfg.consumerGroupId + "-fusion", cfg.inputTopic, cfg.outputTopic,
                cfg.shortFeatureTopic, cfg.longFeatureTopic, cfg.windowHours, cfg.outOfOrdernessMinutes);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(180_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(60_000);
        env.getCheckpointConfig().setCheckpointTimeout(300_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        KafkaSource<String> shortSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(cfg.shortFeatureTopic)
                .setGroupId(cfg.consumerGroupId + "-short-in")
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        KafkaSource<String> longSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(cfg.longFeatureTopic)
                .setGroupId(cfg.consumerGroupId + "-long-in")
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        WatermarkStrategy<CplmShortFeatureResult> shortWm = WatermarkStrategy
                .<CplmShortFeatureResult>forBoundedOutOfOrderness(Duration.ofMinutes(2))
                .withIdleness(Duration.ofMinutes(1))
                .withTimestampAssigner((e, ts) -> e.windowEndMs);

        WatermarkStrategy<CplmLongDiagnosticsResult> longWm = WatermarkStrategy
                .<CplmLongDiagnosticsResult>forBoundedOutOfOrderness(Duration.ofMinutes(2))
                .withIdleness(Duration.ofMinutes(1))
                .withTimestampAssigner((e, ts) -> e.windowEndMs);

        DataStream<CplmShortFeatureResult> shortStream = env
                .fromSource(shortSource, WatermarkStrategy.noWatermarks(), "cplm-fusion-short-source")
                .map(CplmShortFeatureResult::fromJson)
                .filter(s -> s != null && s.loopId != null && !s.loopId.isEmpty())
                .name("cplm-fusion-short-parse")
                .assignTimestampsAndWatermarks(shortWm)
                .name("cplm-fusion-short-watermarks");

        DataStream<CplmLongDiagnosticsResult> parsedLongStream = env
                .fromSource(longSource, WatermarkStrategy.noWatermarks(), "cplm-fusion-long-source")
                .map(CplmLongDiagnosticsResult::fromJson)
                .filter(l -> l != null && l.loopId != null && !l.loopId.isEmpty())
                .name("cplm-fusion-long-parse");

        DataStream<CplmLongDiagnosticsResult> longStream =
                CplmParameterSetBroadcastSupport.connectLongProfiles(parsedLongStream, env, cfg)
                .assignTimestampsAndWatermarks(longWm)
                .name("cplm-fusion-long-watermarks");

        DataStream<String> fused = shortStream
                .keyBy(s -> s.loopId)
                .connect(longStream.keyBy(l -> l.loopId))
                .process(new GateFusionCoProcess())
                .name("cplm-gate-fusion-join")
                .map(CplmGateResult::toJson)
                .name("cplm-gate-fusion-serialize");

        CplmKafkaSink.attach(fused, cfg, cfg.outputTopic, "cplm-gate-fusion-sink");
        env.execute(cfg.jobName);
    }

    static class GateFusionCoProcess extends KeyedCoProcessFunction<String, CplmShortFeatureResult, CplmLongDiagnosticsResult, CplmGateResult> {
        private transient MapState<String, CplmShortFeatureResult> shortByKind;
        /** Per windowKind: recent selectedFamily history for persistence. */
        private transient MapState<String, List<String>> familyHistoryByKind;

        @Override
        public void open(org.apache.flink.configuration.Configuration parameters) {
            MapStateDescriptor<String, CplmShortFeatureResult> desc = new MapStateDescriptor<>(
                    "short-features-by-kind",
                    TypeInformation.of(String.class),
                    TypeInformation.of(new TypeHint<CplmShortFeatureResult>() {}));
            shortByKind = getRuntimeContext().getMapState(desc);

            MapStateDescriptor<String, List<String>> histDesc = new MapStateDescriptor<>(
                    "family-history-by-kind",
                    TypeInformation.of(String.class),
                    TypeInformation.of(new TypeHint<List<String>>() {}));
            familyHistoryByKind = getRuntimeContext().getMapState(histDesc);
        }

        @Override
        public void processElement1(CplmShortFeatureResult shortF, Context ctx, Collector<CplmGateResult> out) throws Exception {
            if (shortF.windowKind != null) {
                shortByKind.put(shortF.windowKind, shortF);
            }
        }

        @Override
        public void processElement2(CplmLongDiagnosticsResult longD, Context ctx, Collector<CplmGateResult> out) throws Exception {
            if (longD.windowKind == null || (!"24h".equals(longD.windowKind) && !"12h".equals(longD.windowKind))) {
                return;
            }
            CplmShortFeatureResult shortF = longD.alignedShort;
            if (shortF == null) shortF = shortByKind.get("60m");
            if (shortF == null) shortF = shortByKind.get("15m");
            if (shortF == null) shortF = shortByKind.get("5m");
            if (shortF == null) shortF = shortByKind.get("1m");
            if (shortF == null) {
                shortF = new CplmShortFeatureResult();
                shortF.loopId = longD.loopId;
                shortF.assetUuid = longD.assetUuid;
                shortF.loopType = longD.loopType;
                shortF.windowKind = longD.windowKind;
                shortF.windowStartMs = longD.windowStartMs;
                shortF.windowEndMs = longD.windowEndMs;
                shortF.sufficientData = false;
            }

            String loopType = firstNonEmpty(longD.loopType, shortF.loopType);
            String assetUuid = firstNonEmpty(longD.assetUuid, shortF.assetUuid);
            CplmLoopDynamicsProfile profile = longD.resolvedProfile != null
                    ? longD.resolvedProfile
                    : CplmDynamicsParameterSetSupport.resolveFromSpine(
                            longD.loopId, loopType, assetUuid);

            boolean hasStep = longD.observabilityFlags != null
                    && !longD.observabilityFlags.contains("NO_STEP_TEST")
                    && longD.observabilityFlags.contains("HAS_STEP_TEST");
            boolean hasPeer = longD.observabilityFlags != null
                    && longD.observabilityFlags.contains("HAS_PEER_LINKS");

            CplmGateResult fused = CplmGateFusionEngine.fuse(shortF, longD, hasStep, hasPeer, profile);
            String elevatedFamily = elevatedFamilyForHistory(fused);

            List<String> prior = familyHistoryByKind.get(longD.windowKind);
            if (prior == null) prior = new ArrayList<>();
            CplmGateFusionEngine.applyPersistence(fused, prior, profile);

            List<String> next = new ArrayList<>(prior);
            // Store the pre-persistence classification. applyPersistence may cap
            // confidence to 0.54; using the capped value here would prevent a new
            // family from ever accumulating its second agreeing window.
            next.add(elevatedFamily);
            int keep = Math.max(3, profile.persistenceWindows);
            while (next.size() > keep) next.remove(0);
            familyHistoryByKind.put(longD.windowKind, next);

            out.collect(fused);
        }

        static String elevatedFamilyForHistory(CplmGateResult result) {
            if (result == null
                    || result.selectedFamily == null
                    || "NONE".equalsIgnoreCase(result.selectedFamily)) {
                return "NONE";
            }
            return "SUSPECTED".equalsIgnoreCase(result.gate15Status)
                    || "CONFIRMED".equalsIgnoreCase(result.gate15Status)
                    ? result.selectedFamily
                    : "NONE";
        }

        private static String firstNonEmpty(String a, String b) {
            if (a != null && !a.trim().isEmpty()) return a;
            if (b != null && !b.trim().isEmpty()) return b;
            return null;
        }
    }
}
