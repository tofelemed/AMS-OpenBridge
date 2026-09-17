package com.ams.flink.cplm;

import com.ams.flink.cplm.config.BundleBroadcastHandler;
import com.ams.flink.cplm.config.ConfigAck;
import com.ams.flink.cplm.config.ConfigRejections;
import com.ams.flink.cplm.config.EffectiveBundleSelector;
import com.ams.flink.cplm.config.GateConfigBundle;
import com.ams.flink.cplm.identity.BuildIdentity;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.BroadcastState;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ReadOnlyBroadcastState;
import org.apache.flink.api.common.typeinfo.BasicTypeInfo;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.runtime.state.FunctionInitializationContext;
import org.apache.flink.runtime.state.FunctionSnapshotContext;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.checkpoint.CheckpointedFunction;
import org.apache.flink.streaming.api.datastream.BroadcastStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.co.BroadcastProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * The control plane of every CPLM job, connected as ONE broadcast: the registry's metadata plane
 * (loop model, engineering range, evidence links, legacy profile attributes) and, since v2.5 (3C.1),
 * the governed configuration bundles on traverse.cpa.context.gate-config.v1. The broadcast state is
 * operator-owned and checkpointed - there is no static map - so a restore reproduces exactly the
 * attributes and bundles that were in force. PREPARE / APPLY acknowledgements leave through a side
 * output to the ACK topic. The resolved profile is attached to each sample / long result, so the
 * downstream window task depends on nothing JVM-local.
 */
public final class CplmParameterSetBroadcastSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    static final MapStateDescriptor<String, String> PROFILE_STATE =
            new MapStateDescriptor<>(
                    "cplm-governed-profile-state",
                    BasicTypeInfo.STRING_TYPE_INFO,
                    BasicTypeInfo.STRING_TYPE_INFO);
    /** The PREPARE / APPLY ACK and NACK records (ConfigAck) the broadcast function emits. */
    public static final OutputTag<String> ACKS = new OutputTag<String>("cplm-gate-config-acks") {
    };

    private CplmParameterSetBroadcastSupport() {
    }

    /** Env/system property spine.consume.canonical - default false. */
    public static boolean consumeCanonical() {
        String env = System.getenv("SPINE_CONSUME_CANONICAL");
        if (env != null && !env.isBlank()) {
            return Boolean.parseBoolean(env.trim());
        }
        return Boolean.parseBoolean(System.getProperty("spine.consume.canonical", "false"));
    }

    public static String parameterSetTopic() {
        return System.getenv().getOrDefault(
                "IIMP_CANONICAL_PARAM_TOPIC", "traverse.cpa.context.parameter-set.v1");
    }

    public static String legacyMetadataTopic() {
        return System.getenv().getOrDefault("IIMP_META_TOPIC", "traverse.cpa.ams.metadata.updates");
    }

    /**
     * Broadcast-connect the control plane before event-time windowing: the profile (pack + registry
     * attributes + the effective bundle at the sample's event time) rides on each sample. The ACK
     * side output is sunk to the ACK topic.
     */
    public static DataStream<CplmNormalizedSample> connectSampleProfiles(
            DataStream<CplmNormalizedSample> samples,
            StreamExecutionEnvironment env,
            CplmJobConfig cfg) {
        BroadcastStream<String> control = buildParameterUpdateStream(env, cfg).broadcast(PROFILE_STATE);
        SingleOutputStreamOperator<CplmNormalizedSample> stamped = samples.connect(control)
                .process(new SampleProfileBroadcastFn(cfg))
                .name("cplm-sample-profile-broadcast")
                .uid("cplm-sample-profile-broadcast");
        attachAckSink(stamped, cfg, "cplm-gate-config-ack-sink");
        return stamped;
    }

    /** The same control plane inside the fusion job; the profile is carried with the long feature to the keyed join. */
    public static DataStream<CplmLongDiagnosticsResult> connectLongProfiles(
            DataStream<CplmLongDiagnosticsResult> diagnostics,
            StreamExecutionEnvironment env,
            CplmJobConfig cfg) {
        BroadcastStream<String> control = buildParameterUpdateStream(env, cfg).broadcast(PROFILE_STATE);
        SingleOutputStreamOperator<CplmLongDiagnosticsResult> stamped = diagnostics.connect(control)
                .process(new LongProfileBroadcastFn(cfg))
                .name("cplm-fusion-profile-broadcast")
                .uid("cplm-fusion-profile-broadcast");
        attachAckSink(stamped, cfg, "cplm-fusion-gate-config-ack-sink");
        return stamped;
    }

    private static void attachAckSink(SingleOutputStreamOperator<?> op, CplmJobConfig cfg, String sinkName) {
        if (cfg.gateConfigAcksTopic == null || cfg.gateConfigAcksTopic.isEmpty()) return;
        CplmKafkaSink.attachKeyed(op.getSideOutput(ACKS), cfg, cfg.gateConfigAcksTopic, sinkName, "bundle_id");
    }

    static DataStream<String> buildParameterUpdateStream(
            StreamExecutionEnvironment env,
            CplmJobConfig cfg) {
        DataStream<String> updates = env.fromSource(
                source(cfg, legacyMetadataTopic(), cfg.consumerGroupId + "-profile-broadcast-legacy"),
                org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                "cplm-profile-broadcast-legacy-source");
        if (cfg.gateConfigTopic != null && !cfg.gateConfigTopic.isEmpty()) {
            updates = updates.union(env.fromSource(
                    source(cfg, cfg.gateConfigTopic, cfg.consumerGroupId + "-gate-config-broadcast"),
                    org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                    "cplm-gate-config-broadcast-source"));
        }
        if (!consumeCanonical()) return updates;
        return updates.union(env.fromSource(
                source(cfg, parameterSetTopic(), cfg.consumerGroupId + "-profile-broadcast-canonical"),
                org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                "cplm-profile-broadcast-canonical-source"));
    }

    private static KafkaSource<String> source(CplmJobConfig cfg, String topic, String group) {
        return KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(topic)
                .setGroupId(group)
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
    }

    /** A resolved profile and how long the selection holds (the next bundle effective time). */
    private static final class Cached {
        final CplmLoopDynamicsProfile profile;
        final long validUntilMs;

        Cached(CplmLoopDynamicsProfile profile, long validUntilMs) {
            this.profile = profile;
            this.validUntilMs = validUntilMs;
        }
    }

    private abstract static class ProfileBroadcastFn<T> extends BroadcastProcessFunction<T, String, T> implements CheckpointedFunction {
        private final String jobName;
        private final String keyArg;
        private final String site;
        private transient Map<String, Cached> resolvedCache;
        private transient Map<String, GateConfigBundle> parsedBundles;
        private transient ConfigAck.WorkerIdentity identity;
        private transient String hmacKey;
        private transient long restoredCheckpointId = -1;

        ProfileBroadcastFn(CplmJobConfig cfg) {
            this.jobName = cfg.jobName;
            this.keyArg = cfg.gateConfigKey;
            this.site = cfg.site;
        }

        @Override
        public void open(Configuration parameters) {
            hmacKey = keyArg != null && !keyArg.isEmpty() ? keyArg : CplmJobConfig.envKey();      // the TaskManager's env, when the arg is absent
        }

        @Override
        public void initializeState(FunctionInitializationContext context) {
            restoredCheckpointId = context.getRestoredCheckpointId().orElse(-1L);
        }

        @Override
        public void snapshotState(FunctionSnapshotContext context) {
        }

        /** The job, its subtask, the build and the topology generation (job id / parallelism / restored checkpoint) that answers. */
        ConfigAck.WorkerIdentity identity() {
            if (identity == null) {
                BuildIdentity build = BuildIdentity.current();
                String jobId = String.valueOf(getRuntimeContext().getJobId());
                String generation = jobId + "/p" + getRuntimeContext().getNumberOfParallelSubtasks() + "/cp" + restoredCheckpointId;
                identity = new ConfigAck.WorkerIdentity(jobName, getRuntimeContext().getIndexOfThisSubtask(), build.jarSha256, build.sourceCommit, generation);
            }
            return identity;
        }

        @Override
        public void processBroadcastElement(String value, Context ctx, Collector<T> out) throws Exception {
            BroadcastState<String, String> state = ctx.getBroadcastState(PROFILE_STATE);
            JsonNode root;
            try {
                root = MAPPER.readTree(value);
            } catch (Exception e) {
                ConfigRejections.count("PARSE_ERROR");
                System.out.println("CPLM_CONTROL_RECORD_REJECTED job=" + jobName + " reason=" + e.getMessage());
                return;
            }
            if (BundleBroadcastHandler.isBundleRecord(root)) {
                for (String ack : BundleBroadcastHandler.handle(value, state, identity(), hmacKey)) ctx.output(ACKS, ack);
            } else if (CplmMetadataEnvelope.isEnvelope(root)) {
                try {
                    CplmMetadataEnvelope.applyUpdate(root, (k, v) -> put(state, k, v), prefix -> removePrefixed(state, prefix));
                } catch (Exception e) {
                    ConfigRejections.count("PARSE_ERROR");
                    System.out.println("CPLM_METADATA_REJECTED job=" + jobName + " reason=" + e.getMessage());
                }
            }
            cache().clear();
            bundles().clear();
        }

        private static void put(BroadcastState<String, String> state, String k, String v) {
            try {
                state.put(k, v);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        private static void removePrefixed(BroadcastState<String, String> state, String key) {
            try {
                ArrayList<String> remove = new ArrayList<>();
                for (Map.Entry<String, String> entry : state.entries()) {
                    if (entry.getKey().equals(key) || entry.getKey().startsWith(key + ":")) remove.add(entry.getKey());
                }
                for (String item : remove) state.remove(item);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        /**
         * The profile in force for the loop at the decision time: pack + registry attributes, then the
         * effective bundle (LOOP > PROFILE > SITE, by effective time). Cached per loop until the next
         * bundle effective time, cleared on every control record.
         */
        CplmLoopDynamicsProfile resolve(String loopId, String loopType, String assetUuid, String sampleSite, long decisionTimeMs, ReadOnlyContext ctx) throws Exception {
            String key = String.valueOf(loopId) + "|" + String.valueOf(loopType) + "|" + String.valueOf(assetUuid) + "|" + String.valueOf(sampleSite);
            Cached cached = cache().get(key);
            if (cached != null && decisionTimeMs < cached.validUntilMs) return cached.profile;
            ReadOnlyBroadcastState<String, String> state = ctx.getBroadcastState(PROFILE_STATE);
            CplmDynamicsParameterSetSupport.Lookup lookup = CplmDynamicsParameterSetSupport.of(state);
            CplmLoopDynamicsProfile profile;
            try {
                profile = CplmDynamicsParameterSetSupport.resolve(loopId, loopType, assetUuid, lookup);
            } catch (IllegalArgumentException e) {
                ConfigRejections.count("PROFILE_ATTRIBUTE_REJECTED");
                System.out.println("CPLM_PROFILE_ATTRIBUTE_REJECTED loop=" + loopId + " reason=" + e.getMessage());
                profile = CplmDynamicsParameterSetSupport.resolveDefault(loopId, loopType, assetUuid);
            }
            String effectiveSite = sampleSite != null && !sampleSite.isEmpty() ? sampleSite : site;
            EffectiveBundleSelector.Selected sel = EffectiveBundleSelector.select(state, effectiveSite, loopId, profile.gateProfileId, decisionTimeMs, bundles());
            if (sel.bundle != null) EffectiveBundleSelector.apply(profile, sel);
            cache().put(key, new Cached(profile, sel.validUntilMs));
            return profile;
        }

        private Map<String, Cached> cache() {
            if (resolvedCache == null) resolvedCache = new HashMap<>();
            return resolvedCache;
        }

        private Map<String, GateConfigBundle> bundles() {
            if (parsedBundles == null) parsedBundles = new HashMap<>();
            return parsedBundles;
        }
    }

    static final class SampleProfileBroadcastFn extends ProfileBroadcastFn<CplmNormalizedSample> {
        SampleProfileBroadcastFn(CplmJobConfig cfg) {
            super(cfg);
        }

        @Override
        public void processElement(CplmNormalizedSample sample, ReadOnlyContext ctx,
                                   Collector<CplmNormalizedSample> out) throws Exception {
            sample.resolvedProfile = resolve(sample.loopId, sample.loopType, sample.assetUuid, sample.site, sample.eventTsMs, ctx);
            out.collect(sample);
        }
    }

    static final class LongProfileBroadcastFn extends ProfileBroadcastFn<CplmLongDiagnosticsResult> {
        LongProfileBroadcastFn(CplmJobConfig cfg) {
            super(cfg);
        }

        @Override
        public void processElement(CplmLongDiagnosticsResult diagnostic, ReadOnlyContext ctx,
                                   Collector<CplmLongDiagnosticsResult> out) throws Exception {
            // the fused row shares the long tier's bundle: the same decision time (the window end) selects the same bundle
            diagnostic.resolvedProfile = resolve(diagnostic.loopId, diagnostic.loopType, diagnostic.assetUuid, diagnostic.site, diagnostic.windowEndMs, ctx);
            applyLoopEvidence(diagnostic, ctx.getBroadcastState(PROFILE_STATE));
            out.collect(diagnostic);
        }
    }

    /**
     * Attribute key carrying per-loop registry evidence (peer/upstream links and approved step
     * tests), stored under {@code <loopId>:cplm.loop.evidence} by the envelope reader.
     */
    public static final String ATTR_LOOP_EVIDENCE = "cplm.loop.evidence";

    /** Stamps HAS_PEER_LINKS / HAS_STEP_TEST onto a long-diagnostics record from broadcast state, before the fusion join reads those flags. */
    static void applyLoopEvidence(CplmLongDiagnosticsResult diagnostic,
                                  ReadOnlyBroadcastState<String, String> state) throws Exception {
        if (diagnostic == null || diagnostic.loopId == null || state == null) return;
        String json = state.get(diagnostic.loopId + ":" + ATTR_LOOP_EVIDENCE);
        if (json == null || json.isBlank()) return;

        JsonNode evidence;
        try {
            evidence = MAPPER.readTree(json);
        } catch (Exception ex) {
            ConfigRejections.count("LOOP_EVIDENCE_PARSE_ERROR");
            return;
        }
        if (diagnostic.observabilityFlags == null) {
            diagnostic.observabilityFlags = new java.util.ArrayList<>();
        }
        if (evidence.path("hasPeerLinks").asBoolean(false)) {
            if (!diagnostic.observabilityFlags.contains("HAS_PEER_LINKS")) {
                diagnostic.observabilityFlags.add("HAS_PEER_LINKS");
            }
            // The engine re-adds NO_UPSTREAM_LINKS itself when peers are absent; strip the stale negative so the two never coexist.
            diagnostic.observabilityFlags.remove("NO_UPSTREAM_LINKS");
        }
        if (evidence.path("hasStepTest").asBoolean(false)) {
            if (!diagnostic.observabilityFlags.contains("HAS_STEP_TEST")) {
                diagnostic.observabilityFlags.add("HAS_STEP_TEST");
            }
            diagnostic.observabilityFlags.remove("NO_STEP_TEST");
        }
    }

    /** Test seam: applies one metadata-plane update to a broadcast state exactly as the function does. */
    static void applyUpdateToState(String value, BroadcastState<String, String> state) throws Exception {
        CplmMetadataEnvelope.applyUpdate(value, (k, v) -> ProfileBroadcastFn.put(state, k, v), prefix -> ProfileBroadcastFn.removePrefixed(state, prefix));
    }
}
