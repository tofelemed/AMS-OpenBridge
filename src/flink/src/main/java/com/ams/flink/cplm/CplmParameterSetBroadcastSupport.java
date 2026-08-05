package com.ams.flink.cplm;

import org.apache.flink.api.common.state.BroadcastState;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ReadOnlyBroadcastState;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.typeinfo.BasicTypeInfo;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.BroadcastStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.co.BroadcastProcessFunction;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Map;

/**
 * P0.4 — hydrate CplmDynamicsParameterSetSupport from the spine.
 * When spine.consume.canonical=true: consume context.parameter-set.v1 (canonical Broadcast).
 * Always also consume ams.metadata.updates for staticAttributes (legacy Broadcast path) so
 * Gate 2 SLA can compare canonical vs legacy apply latency in the same session.
 */
public final class CplmParameterSetBroadcastSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final MapStateDescriptor<String, String> PROFILE_STATE =
            new MapStateDescriptor<>(
                    "cplm-governed-profile-state",
                    BasicTypeInfo.STRING_TYPE_INFO,
                    BasicTypeInfo.STRING_TYPE_INFO);

    private CplmParameterSetBroadcastSupport() {
    }

    /** Env/system property spine.consume.canonical — default false. */
    public static boolean consumeCanonical() {
        String env = System.getenv("SPINE_CONSUME_CANONICAL");
        if (env != null && !env.isBlank()) {
            return Boolean.parseBoolean(env.trim());
        }
        return Boolean.parseBoolean(System.getProperty("spine.consume.canonical", "false"));
    }

    public static String parameterSetTopic() {
        return System.getenv().getOrDefault(
                "IIMP_CANONICAL_PARAM_TOPIC", "context.parameter-set.v1");
    }

    public static String legacyMetadataTopic() {
        return System.getenv().getOrDefault("IIMP_META_TOPIC", "ams.metadata.updates");
    }

    public static void wireParameterSetHydration(StreamExecutionEnvironment env, CplmJobConfig cfg) {
        // Legacy path — always on so soak/SLA is not flag-only
        KafkaSource<String> legacy = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(legacyMetadataTopic())
                .setGroupId(cfg.consumerGroupId + "-parameter-legacy")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        env.fromSource(legacy, org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                        "cplm-parameter-legacy-source")
                .process(new LegacyParameterHydrateFn())
                .setParallelism(1)
                .name("cplm-parameter-legacy-hydrate");

        if (!consumeCanonical()) {
            return;
        }
        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(parameterSetTopic())
                .setGroupId(cfg.consumerGroupId + "-parameter-set")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        env.fromSource(source, org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                        "cplm-parameter-set-source")
                .process(new ParameterSetHydrateFn())
                .setParallelism(1)
                .name("cplm-parameter-set-hydrate");
    }

    /**
     * Broadcast-connect governed profiles before event-time windowing. The
     * parsed profile is cached per loop and attached to each sample, so the
     * downstream window task does not rely on TaskManager-local static state.
     */
    public static DataStream<CplmNormalizedSample> connectSampleProfiles(
            DataStream<CplmNormalizedSample> samples,
            StreamExecutionEnvironment env,
            CplmJobConfig cfg) {
        BroadcastStream<String> profiles = buildParameterUpdateStream(env, cfg).broadcast(PROFILE_STATE);
        return samples.connect(profiles)
                .process(new SampleProfileBroadcastFn())
                .name("cplm-sample-profile-broadcast");
    }

    /**
     * Resolve the same governed profile inside the fusion job and carry it with
     * the long feature to the keyed join.
     */
    public static DataStream<CplmLongDiagnosticsResult> connectLongProfiles(
            DataStream<CplmLongDiagnosticsResult> diagnostics,
            StreamExecutionEnvironment env,
            CplmJobConfig cfg) {
        BroadcastStream<String> profiles = buildParameterUpdateStream(env, cfg).broadcast(PROFILE_STATE);
        return diagnostics.connect(profiles)
                .process(new LongProfileBroadcastFn())
                .name("cplm-fusion-profile-broadcast");
    }

    private static DataStream<String> buildParameterUpdateStream(
            StreamExecutionEnvironment env,
            CplmJobConfig cfg) {
        KafkaSource<String> legacy = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(legacyMetadataTopic())
                .setGroupId(cfg.consumerGroupId + "-profile-broadcast-legacy")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        DataStream<String> updates = env.fromSource(
                legacy,
                org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                "cplm-profile-broadcast-legacy-source");
        if (!consumeCanonical()) return updates;

        KafkaSource<String> canonical = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(parameterSetTopic())
                .setGroupId(cfg.consumerGroupId + "-profile-broadcast-canonical")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        return updates.union(env.fromSource(
                canonical,
                org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                "cplm-profile-broadcast-canonical-source"));
    }

    private abstract static class ProfileBroadcastFn<T> extends BroadcastProcessFunction<T, String, T> {
        private transient Map<String, CplmLoopDynamicsProfile> resolvedCache;
        private transient boolean restored;

        @Override
        public void processBroadcastElement(String value, Context ctx, Collector<T> out) throws Exception {
            applyUpdateToState(value, ctx.getBroadcastState(PROFILE_STATE));
            applyBroadcastPayload(value, "canonical-parameter");
            applyLegacyMetadataEnvelope(value);
            cache().clear();
            restored = true;
        }

        CplmLoopDynamicsProfile resolve(
                String loopId,
                String loopType,
                String assetUuid,
                ReadOnlyContext ctx) throws Exception {
            if (!restored) {
                ReadOnlyBroadcastState<String, String> state = ctx.getBroadcastState(PROFILE_STATE);
                for (Map.Entry<String, String> entry : state.immutableEntries()) {
                    CplmDynamicsParameterSetSupport.putRaw(entry.getKey(), entry.getValue());
                }
                restored = true;
            }
            String key = String.valueOf(loopId) + "|" + String.valueOf(loopType) + "|" + String.valueOf(assetUuid);
            CplmLoopDynamicsProfile cached = cache().get(key);
            if (cached == null) {
                cached = CplmDynamicsParameterSetSupport.resolveFromSpine(loopId, loopType, assetUuid);
                cache().put(key, cached);
            }
            return cached;
        }

        private Map<String, CplmLoopDynamicsProfile> cache() {
            if (resolvedCache == null) resolvedCache = new HashMap<>();
            return resolvedCache;
        }
    }

    static final class SampleProfileBroadcastFn extends ProfileBroadcastFn<CplmNormalizedSample> {
        @Override
        public void processElement(CplmNormalizedSample sample, ReadOnlyContext ctx,
                                   Collector<CplmNormalizedSample> out) throws Exception {
            sample.resolvedProfile = resolve(sample.loopId, sample.loopType, sample.assetUuid, ctx);
            out.collect(sample);
        }
    }

    static final class LongProfileBroadcastFn extends ProfileBroadcastFn<CplmLongDiagnosticsResult> {
        @Override
        public void processElement(CplmLongDiagnosticsResult diagnostic, ReadOnlyContext ctx,
                                   Collector<CplmLongDiagnosticsResult> out) throws Exception {
            diagnostic.resolvedProfile = resolve(
                    diagnostic.loopId, diagnostic.loopType, diagnostic.assetUuid, ctx);
            out.collect(diagnostic);
        }
    }

    static void applyUpdateToState(String value, BroadcastState<String, String> state) throws Exception {
        if (value == null || value.isBlank()) return;
        JsonNode root = MAPPER.readTree(value);
        if (root.has("__tombstone") && root.path("__tombstone").asBoolean(false)) {
            String key = text(root, "key", null);
            if (key != null) {
                java.util.ArrayList<String> remove = new java.util.ArrayList<>();
                for (Map.Entry<String, String> entry : state.entries()) {
                    if (entry.getKey().equals(key) || entry.getKey().startsWith(key + ":")) {
                        remove.add(entry.getKey());
                    }
                }
                for (String item : remove) state.remove(item);
            }
            return;
        }

        JsonNode parameters = root.path("parameters");
        if (parameters.isArray()) {
            String calcId = text(root, "calcInstanceId", text(root, "key", ""));
            for (JsonNode parameter : parameters) {
                String name = text(parameter, "name", "");
                if (name.isEmpty()) continue;
                String parameterValue = text(parameter, "value", "");
                state.put(name, parameterValue);
                if (!calcId.isEmpty()) state.put(calcId + ":" + name, parameterValue);
            }
        }

        JsonNode payload = root.has("payload") ? root.get("payload") : root;
        if (payload != null && payload.isTextual()) payload = MAPPER.readTree(payload.asText());
        if (payload != null && payload.path("staticAttributes").isArray()) {
            for (JsonNode attribute : payload.path("staticAttributes")) {
                String assetUuid = text(attribute, "assetUuid", null);
                String attrKey = text(attribute, "attrKey", null);
                if (assetUuid == null || attrKey == null) continue;
                JsonNode valueNode = attribute.get("value");
                String attributeValue = "";
                if (valueNode != null) {
                    attributeValue = valueNode.isObject() && valueNode.has("value")
                            ? valueNode.get("value").asText("")
                            : valueNode.asText("");
                }
                state.put(assetUuid + ":" + attrKey, attributeValue);
                state.put(attrKey, attributeValue);
            }
        }
    }

    public static void applyBroadcastPayload(String value) {
        applyBroadcastPayload(value, "canonical-parameter");
    }

    public static void applyBroadcastPayload(String value, String mode) {
        if (value == null || value.isBlank()) {
            return;
        }
        try {
            JsonNode root = MAPPER.readTree(value);
            if (root.has("__tombstone") && root.get("__tombstone").asBoolean(false)) {
                String key = text(root, "key", null);
                CplmDynamicsParameterSetSupport.applyParameterSetJson(key, null);
                System.out.println("SPINE_BS_APPLIED mode=tombstone key=" + key
                        + " tsMs=" + System.currentTimeMillis()
                        + " canonical=" + consumeCanonical());
                return;
            }
            String key = text(root, "calcInstanceId", text(root, "key", null));
            CplmDynamicsParameterSetSupport.applyParameterSetJson(key, value);
            System.out.println("SPINE_BS_APPLIED mode=" + mode + " key=" + key
                    + " tsMs=" + System.currentTimeMillis()
                    + " canonical=" + consumeCanonical());
        } catch (Exception ignored) {
        }
    }

    /** Extract staticAttributes from legacy ams.metadata.updates MOC envelopes. */
    public static void applyLegacyMetadataEnvelope(String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        try {
            JsonNode root = MAPPER.readTree(value);
            JsonNode payload = root.has("payload") ? root.get("payload") : root;
            if (payload == null || payload.isNull()) {
                return;
            }
            // payload may be a JSON string
            if (payload.isTextual()) {
                payload = MAPPER.readTree(payload.asText());
            }
            if (!payload.has("staticAttributes") || !payload.get("staticAttributes").isArray()) {
                return;
            }
            for (JsonNode a : payload.get("staticAttributes")) {
                String assetUuid = text(a, "assetUuid", null);
                String attrKey = text(a, "attrKey", null);
                if (assetUuid == null || attrKey == null) {
                    continue;
                }
                String val = "";
                if (a.has("value")) {
                    JsonNode vNode = a.get("value");
                    if (vNode.isObject() && vNode.has("value")) {
                        val = vNode.get("value").asText("");
                    } else {
                        val = vNode.asText("");
                    }
                }
                String key = assetUuid + ":" + attrKey;
                CplmDynamicsParameterSetSupport.putRaw(key, val);
                CplmDynamicsParameterSetSupport.putRaw(attrKey, val);
                System.out.println("SPINE_BS_APPLIED mode=legacy-parameter key=" + key
                        + " tsMs=" + System.currentTimeMillis()
                        + " canonical=" + consumeCanonical());
            }
        } catch (Exception ignored) {
        }
    }

    private static String text(JsonNode n, String field, String def) {
        return n != null && n.has(field) && !n.get(field).isNull() ? n.get(field).asText() : def;
    }

    static final class ParameterSetHydrateFn extends ProcessFunction<String, String> {
        @Override
        public void processElement(String value, Context ctx, Collector<String> out) {
            applyBroadcastPayload(value, "canonical-parameter");
        }
    }

    static final class LegacyParameterHydrateFn extends ProcessFunction<String, String> {
        @Override
        public void processElement(String value, Context ctx, Collector<String> out) {
            applyLegacyMetadataEnvelope(value);
        }
    }
}
