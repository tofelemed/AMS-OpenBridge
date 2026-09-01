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
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import java.util.ArrayList;
import java.util.List;

/**
 * Stage 3 - Gate fusion job (Gates 12-15) with keyed temporal persistence
 * (calc v3.0.0).
 *
 * <p>Source: traverse.cpa.clpm.feature.long.v1 ONLY. Sink: traverse.cpa.clpm.gate.results.v1.
 *
 * <p>audit-jobs.md B-F1 (Phase H): the job previously ALSO consumed the whole
 * short-feature topic from earliest into a per-loop {@code shortByKind} MapState
 * that a fallback ladder read — but the long job unconditionally embeds
 * {@code alignedShort} on every slice, so the ladder never fired and the source
 * was a full topic's worth of network, CPU and checkpointed state for no output.
 * The aligned short slice on the long record is now the only short input; a
 * record without one (which no current producer emits) fuses as
 * insufficient-data, exactly as the old last-resort branch did.
 *
 * <p>The event-time watermark stage was removed with it (audit-jobs.md B-F3):
 * this operator registers no timers, so the assigners did nothing but add
 * overhead and a false impression of event-time ordering in the join.
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

        KafkaSource<String> longSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(cfg.longFeatureTopic)
                .setGroupId(cfg.consumerGroupId + "-long-in")
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<CplmLongDiagnosticsResult> parsedLongStream = env
                .fromSource(longSource, WatermarkStrategy.noWatermarks(), "cplm-fusion-long-source")
                .map(CplmLongDiagnosticsResult::fromJson)
                .filter(l -> l != null && l.loopId != null && !l.loopId.isEmpty())
                .name("cplm-fusion-long-parse")
                .uid("cplm-fusion-long-parse");

        DataStream<CplmLongDiagnosticsResult> longStream =
                CplmParameterSetBroadcastSupport.connectLongProfiles(parsedLongStream, env, cfg);

        DataStream<String> fused = longStream
                .keyBy(l -> l.loopId)
                .process(new GateFusionProcess())
                .name("cplm-gate-fusion-join")
                .uid("cplm-gate-fusion-join")
                .map(CplmGateResult::toJson)
                .name("cplm-gate-fusion-serialize")
                .uid("cplm-gate-fusion-serialize");

        // Keyed by loop_id (audit-jobs.md B-F6): CplmEventFrameService's
        // open/extend/close lifecycle is order-sensitive per (loop, window_kind);
        // unkeyed verdicts across 8 partitions could interleave and reopen a
        // frame a later verdict had closed.
        CplmKafkaSink.attachKeyed(fused, cfg, cfg.outputTopic, "cplm-gate-fusion-sink", "loop_id");
        env.execute(cfg.jobName);
    }

    static class GateFusionProcess extends KeyedProcessFunction<String, CplmLongDiagnosticsResult, CplmGateResult> {
        /** Per windowKind: recent selectedFamily history for persistence. */
        private transient MapState<String, List<String>> familyHistoryByKind;

        @Override
        public void open(org.apache.flink.configuration.Configuration parameters) {
            MapStateDescriptor<String, List<String>> histDesc = new MapStateDescriptor<>(
                    "family-history-by-kind",
                    TypeInformation.of(String.class),
                    TypeInformation.of(new TypeHint<List<String>>() {}));
            familyHistoryByKind = getRuntimeContext().getMapState(histDesc);
        }

        @Override
        public void processElement(CplmLongDiagnosticsResult longD, Context ctx, Collector<CplmGateResult> out) throws Exception {
            // Fusion fires on 12h/24h only; 4h slices are KPI-only (served by
            // /kpis?resolution=4h), never fusion inputs.
            if (longD.windowKind == null || (!"24h".equals(longD.windowKind) && !"12h".equals(longD.windowKind))) {
                return;
            }
            CplmShortFeatureResult shortF = longD.alignedShort;
            if (shortF == null) {
                // No current producer emits a long record without alignedShort;
                // if one ever does, fuse it as insufficient rather than dropping.
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
