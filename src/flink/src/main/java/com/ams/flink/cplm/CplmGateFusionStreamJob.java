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

import com.ams.flink.cplm.condition.ConditionEvent;
import com.ams.flink.cplm.condition.OpenConditions;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.fusion.FusionSideInput;
import com.ams.flink.cplm.fusion.HealthLanes;
import com.ams.flink.cplm.health.LoopHealthContextRecord;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
        cfg = cfg.forJob("AMS - CPLM Gate Fusion Engine", "-fusion", null);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(180_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(60_000);
        env.getCheckpointConfig().setCheckpointTimeout(300_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);
        build(env, cfg, args);
        env.execute(cfg.jobName);
    }

    /** The job graph without execution (a test inspects its operators). */
    public static void build(StreamExecutionEnvironment env, CplmJobConfig cfg, String[] args) {
        // v2.5 (Task 1D.5): the fast-path condition topic joins the long slices; which long
        // window kinds fuse is configurable (4h is opt-in: every fused kind adds ~33k gate
        // rows/day at plant size to a table with no retention yet).
        final String conditionTopic = argOr(args, "condition-topic", CplmTopics.CONDITION_EVENTS);
        // v2.5 (Task 1H.5): the Instrumental health contexts (compacted, one record per loop/role).
        final String healthContextTopic = argOr(args, "health-context-topic", CplmTopics.INSTRUMENT_HEALTH_CONTEXT);
        final Set<String> fuseKinds = new HashSet<>(Arrays.asList(argOr(args, "fuse-window-kinds", "12h,24h").split(",")));

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

        KafkaSource<String> conditionSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(conditionTopic)
                .setGroupId(cfg.consumerGroupId + "-conditions-in")
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.LATEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        DataStream<ConditionEvent> conditionStream = env
                .fromSource(conditionSource, WatermarkStrategy.noWatermarks(), "cplm-fusion-condition-source")
                .map(ConditionEvent::fromJson)
                .filter(c -> c != null && c.loopId != null && !c.loopId.isEmpty())
                .name("cplm-fusion-condition-parse")
                .uid("cplm-fusion-condition-parse");

        // v2.5 (Task 1H.5): the health contexts join the same keyed side input as the conditions.
        // The topic is compacted and small, so every start reads it from the beginning to rebuild
        // the per-loop/role picture instead of depending on a committed offset.
        KafkaSource<String> healthSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(healthContextTopic)
                .setGroupId(cfg.consumerGroupId + "-health-in")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        DataStream<FusionSideInput> healthStream = env
                .fromSource(healthSource, WatermarkStrategy.noWatermarks(), "cplm-fusion-health-source")
                .map(LoopHealthContextRecord::fromJson)
                .filter(h -> h != null)
                .map(h -> FusionSideInput.of(h))
                .name("cplm-fusion-health-parse")
                .uid("cplm-fusion-health-parse");
        DataStream<FusionSideInput> sideInputs = conditionStream
                .map(c -> FusionSideInput.of(c))
                .name("cplm-fusion-condition-wrap")
                .uid("cplm-fusion-condition-wrap")
                .union(healthStream);

        org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator<CplmGateResult> joined = longStream
                .keyBy(l -> l.loopId)
                .connect(sideInputs.keyBy(s -> s.loopId()))
                .process(new GateFusionProcess(fuseKinds, com.ams.flink.cplm.evidence.EvidencePolicy.fromArgs(args)))
                .name("cplm-gate-fusion-join")
                .uid("cplm-gate-fusion-join");
        DataStream<String> fused = joined
                .map(CplmGateResult::toJson)
                .name("cplm-gate-fusion-serialize")
                .uid("cplm-gate-fusion-serialize");
        // v2.5 (2C.1c): the fused verdict's evidence (G11 lanes, G13 capability, G14/G15 records) on a side output
        String evidenceTopic = argOr(args, "evidence-topic", com.ams.flink.cplm.contract.CplmTopics.GATE_EVIDENCE);
        CplmKafkaSink.attachKeyed(joined.getSideOutput(GateFusionProcess.EVIDENCE), cfg, evidenceTopic, "cplm-fusion-evidence-sink",
                com.ams.flink.cplm.evidence.EvidenceKafkaRecords.KEY_FIELD);

        // Keyed by loop_id (audit-jobs.md B-F6): CplmEventFrameService's
        // open/extend/close lifecycle is order-sensitive per (loop, window_kind);
        // unkeyed verdicts across 8 partitions could interleave and reopen a
        // frame a later verdict had closed.
        CplmKafkaSink.attachKeyed(fused, cfg, cfg.outputTopic, "cplm-gate-fusion-sink", "loop_id");
        // v2.5 (3A.2): announce what this job can be configured with (readable property ids, catalogue hash,
        // compiled capacity) on the gate-config ACK topic at every start - capability from the RUNNING job
        com.ams.flink.cplm.config.CapabilityRecord.announce(env, cfg, cfg.jobName, args);
    }

    static class GateFusionProcess extends KeyedCoProcessFunction<String, CplmLongDiagnosticsResult, FusionSideInput, CplmGateResult> {
        /** v2.5 (2C.1c): evidence records (EvidenceKafkaRecords JSON) leave through this side output. */
        static final org.apache.flink.util.OutputTag<String> EVIDENCE = new org.apache.flink.util.OutputTag<String>("cplm-fusion-evidence") {
        };
        private static final org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper EVIDENCE_MAPPER =
                new org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper();
        private final Set<String> fuseKinds;
        private final com.ams.flink.cplm.evidence.EvidencePolicy policy;
        /** Per windowKind: recent selectedFamily history for persistence. */
        private transient MapState<String, List<String>> familyHistoryByKind;
        /** v2.5 R11: the fast-path conditions currently open for this loop (kind -> latest event). */
        private transient MapState<String, ConditionEvent> openConditions;
        /** v2.5 R15: the latest Instrumental health context per signal role for this loop. */
        private transient MapState<String, LoopHealthContextRecord> healthByRole;

        GateFusionProcess() {
            this(new HashSet<>(Arrays.asList("12h", "24h")));
        }

        GateFusionProcess(Set<String> fuseKinds) {
            this(fuseKinds, new com.ams.flink.cplm.evidence.EvidencePolicy(com.ams.flink.cplm.evidence.EvidencePolicy.Mode.EPISODES));
        }

        GateFusionProcess(Set<String> fuseKinds, com.ams.flink.cplm.evidence.EvidencePolicy policy) {
            this.fuseKinds = fuseKinds;
            this.policy = policy;
        }

        @Override
        public void open(org.apache.flink.configuration.Configuration parameters) {
            MapStateDescriptor<String, List<String>> histDesc = new MapStateDescriptor<>(
                    "family-history-by-kind",
                    TypeInformation.of(String.class),
                    TypeInformation.of(new TypeHint<List<String>>() {}));
            familyHistoryByKind = getRuntimeContext().getMapState(histDesc);
            openConditions = getRuntimeContext().getMapState(new MapStateDescriptor<>(
                    "open-conditions", TypeInformation.of(String.class), TypeInformation.of(ConditionEvent.class)));
            healthByRole = getRuntimeContext().getMapState(new MapStateDescriptor<>(
                    "health-by-role", TypeInformation.of(String.class), TypeInformation.of(LoopHealthContextRecord.class)));
        }

        @Override
        public void processElement2(FusionSideInput s, Context ctx, Collector<CplmGateResult> out) throws Exception {
            if (s == null) return;
            if (s.health != null) {
                // v2.5 1H.5: newest context per role wins (the compacted topic keeps only that per key anyway).
                if (s.health.role != null && !s.health.role.isEmpty()) healthByRole.put(s.health.role, s.health);
                return;
            }
            ConditionEvent c = s.condition;
            if (c == null || c.kind == null) return;
            if ("CLOSED".equals(c.state)) openConditions.remove(c.kind);
            else openConditions.put(c.kind, c);
        }

        @Override
        public void processElement1(CplmLongDiagnosticsResult longD, Context ctx, Collector<CplmGateResult> out) throws Exception {
            // Fusion fires on the configured long kinds (default 12h/24h; 4h opt-in).
            if (longD.windowKind == null || !fuseKinds.contains(longD.windowKind)) {
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
                    : CplmDynamicsParameterSetSupport.resolveDefault(
                            longD.loopId, loopType, assetUuid);

            boolean hasStep = longD.observabilityFlags != null
                    && !longD.observabilityFlags.contains("NO_STEP_TEST")
                    && longD.observabilityFlags.contains("HAS_STEP_TEST");
            boolean hasPeer = longD.observabilityFlags != null
                    && longD.observabilityFlags.contains("HAS_PEER_LINKS");

            Map<String, ConditionEvent> open = new HashMap<>();
            for (Map.Entry<String, ConditionEvent> e : openConditions.entries()) open.put(e.getKey(), e.getValue());
            Map<String, LoopHealthContextRecord> health = new HashMap<>();
            for (Map.Entry<String, LoopHealthContextRecord> e : healthByRole.entries()) health.put(e.getKey(), e.getValue());
            CplmGateResult fused = CplmGateFusionEngine.fuse(shortF, longD, hasStep, hasPeer, profile,
                    OpenConditions.of(open), HealthLanes.of(health));
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

            if (policy.emit(fused)) {
                long nowMs = System.currentTimeMillis();
                for (com.ams.flink.cplm.evidence.EvidenceArtifact a : com.ams.flink.cplm.evidence.FusionArtifacts.artifacts(fused)) {
                    for (String record : com.ams.flink.cplm.evidence.EvidenceKafkaRecords.records(a, EVIDENCE_MAPPER, nowMs)) ctx.output(EVIDENCE, record);
                }
            }
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

    private static String argOr(String[] args, String key, String def) {
        for (int i = 0; i < args.length - 1; i++) {
            String a = args[i].startsWith("--") ? args[i].substring(2) : args[i];
            if (a.equals(key)) return args[i + 1];
        }
        return def;
    }
}
