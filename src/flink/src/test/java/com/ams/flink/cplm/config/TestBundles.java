package com.ams.flink.cplm.config;

import org.apache.flink.api.common.state.BroadcastState;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Bundles built and signed exactly as cplm-api's ConfigStore / BundleEnvelope build them (3B.2 / 3B.3). */
final class TestBundles {
    static final ObjectMapper M = new ObjectMapper();
    static final String KEY = "test-key";
    static final ConfigAck.WorkerIdentity SHORT = new ConfigAck.WorkerIdentity(PropertyReaders.SHORT, 0, "jar-A", "abc", "job-1/p1/cp0");

    private TestBundles() {}

    /** One layer: {kind, ref, ordinal, content, content_hash}. */
    static ObjectNode layer(String kind, String ref, int ordinal, ObjectNode content) {
        ObjectNode l = M.createObjectNode();
        l.put("kind", kind);
        if (ref == null) l.putNull("ref"); else l.put("ref", ref);
        l.put("ordinal", ordinal);
        l.set("content", content);
        l.put("content_hash", CanonicalJson.sha256(content));
        return l;
    }

    static ObjectNode content(Object... kv) {
        ObjectNode c = M.createObjectNode();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object v = kv[i + 1];
            if (v instanceof Double) c.put((String) kv[i], (Double) v);
            else if (v instanceof Integer) c.put((String) kv[i], (Integer) v);
            else if (v instanceof Long) c.put((String) kv[i], (Long) v);
            else if (v instanceof Boolean) c.put((String) kv[i], (Boolean) v);
            else if (v == null) c.putNull((String) kv[i]);
            else c.put((String) kv[i], String.valueOf(v));
        }
        return c;
    }

    /** The factory layer of the build (catalogue starting values) - what the control plane puts first. */
    static ObjectNode factoryContent() {
        return (ObjectNode) FactoryLayer.export(M).get("factory");
    }

    static ObjectNode profileContent(String gateProfileId) {
        JsonNode p = FactoryLayer.export(M).get("profiles").get(gateProfileId);
        return p == null ? M.createObjectNode() : (ObjectNode) p;
    }

    /** Resolves the layers like EffectiveConfigResolver: later layers override, RESET_TO_INHERITED removes the override. */
    static ObjectNode resolve(List<ObjectNode> layers) {
        Map<String, JsonNode> props = new LinkedHashMap<>();
        for (ObjectNode l : layers) {
            Iterator<Map.Entry<String, JsonNode>> it = l.get("content").fields();
            Map<String, JsonNode> layerValues = new HashMap<>();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (e.getValue().isTextual() && GateConfigBundle.RESET_TO_INHERITED.equals(e.getValue().asText())) continue;
                layerValues.put(e.getKey(), e.getValue());
            }
            props.putAll(layerValues);
        }
        ObjectNode out = M.createObjectNode();
        for (Map.Entry<String, JsonNode> e : props.entrySet()) out.set(e.getKey(), e.getValue());
        return out;
    }

    /** A complete bundle document for the scope, hashed like ConfigStore.Resolve (sha256 of canonical {layers, resolved}). */
    static ObjectNode bundle(String site, String scopeKind, String scopeRef, String profileId, String changeClass, List<ObjectNode> layers, String catalogueHash) {
        ObjectNode b = M.createObjectNode();
        b.put("bundle_id", UUID.nameUUIDFromBytes((scopeKind + scopeRef + layers.toString()).getBytes()).toString());
        b.put("version", 1);
        ObjectNode scope = b.putObject("scope");
        scope.put("tenant", "default");
        scope.put("site", site);
        scope.put("kind", scopeKind);
        if ("PROFILE".equals(scopeKind)) scope.put("profile_id", scopeRef); else scope.putNull("profile_id");
        if ("LOOP".equals(scopeKind) || "REGIME".equals(scopeKind)) scope.put("loop_id", scopeRef); else scope.putNull("loop_id");
        if ("REGIME".equals(scopeKind)) scope.put("regime_id", scopeRef); else scope.putNull("regime_id");
        b.putArray("parent_hashes");
        ObjectNode req = b.putObject("requires");
        req.put("catalogue_hash", catalogueHash);
        req.put("schema_version", "1.0.0");
        req.putObject("method_versions");
        req.putNull("build_capability");
        b.put("change_class", changeClass);
        b.putNull("effective_from");
        b.putArray("approvals");
        b.putObject("constraints");
        ArrayNode ls = b.putArray("layers");
        for (ObjectNode l : layers) ls.add(l);
        ObjectNode resolved = b.putObject("resolved");
        resolved.set("properties", resolve(layers));
        resolved.putObject("sources");
        resolved.set("execution_plan", installedPlan());
        ObjectNode hashInput = M.createObjectNode();
        hashInput.set("layers", ls);
        hashInput.set("resolved", resolved);
        b.put("hash", CanonicalJson.sha256(hashInput));
        return b;
    }

    /** The compiled plan as the control plane's execution-plan.installed.json states it. */
    static ObjectNode installedPlan() {
        ObjectNode declared = ExecutionPlanCapacity.declare(M);
        ObjectNode plan = M.createObjectNode();
        plan.put("plan_version", "1.0.0");
        plan.put("scheduler_mode", "FIXED_COMPILED");
        plan.set("horizons", declared.get("horizons"));
        ArrayNode assignments = plan.putArray("assignments");
        Iterator<Map.Entry<String, JsonNode>> it = declared.get("assignments").fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            ObjectNode a = assignments.addObject();
            a.put("gate", e.getKey());
            a.put("horizon_id", e.getValue().path("horizon_id").asText());
            a.put("trigger", e.getValue().path("trigger").asText());
        }
        return plan;
    }

    /** The standard layers for a scope: FACTORY, SITE (empty), PROFILE (the pack export), LOOP (given). */
    static List<ObjectNode> layers(String site, String scopeKind, String gateProfileId, ObjectNode siteContent, ObjectNode profileOverride, ObjectNode loopContent) {
        List<ObjectNode> ls = new ArrayList<>();
        ls.add(layer("FACTORY", null, 0, factoryContent()));
        ls.add(layer("SITE", site, 1, siteContent == null ? M.createObjectNode() : siteContent));
        if (!"SITE".equals(scopeKind)) {
            ObjectNode profile = profileContent(gateProfileId);
            if (profileOverride != null) profile.setAll(profileOverride);
            ls.add(layer("PROFILE", gateProfileId, 2, profile));
        }
        if ("LOOP".equals(scopeKind) || "REGIME".equals(scopeKind)) ls.add(layer("LOOP", null, 3, loopContent == null ? M.createObjectNode() : loopContent));
        return ls;
    }

    /** The control-plane message: PREPARE / APPLY with the HMAC signature over the canonical bundle. */
    static String message(ObjectNode bundle, String phase, String deploymentId, long effectiveFromMs, String key) {
        ObjectNode m = M.createObjectNode();
        m.put("record_kind", "GATE_CONFIG_BUNDLE");
        m.put("phase", phase);
        m.put("deployment_id", deploymentId);
        m.put("bundle_id", bundle.path("bundle_id").asText());
        m.put("hash", bundle.path("hash").asText());
        m.put("effective_from_ms", effectiveFromMs);
        m.putNull("topology_generation");
        m.set("bundle", bundle);
        m.put("signature", CanonicalJson.signature(bundle, key));
        m.put("emitted_at_ms", 1L);
        return m.toString();
    }

    /** An in-memory broadcast state (the checkpointed map the operator owns). */
    static final class MapBroadcastState implements BroadcastState<String, String> {
        final Map<String, String> map = new LinkedHashMap<>();

        @Override public void put(String key, String value) { map.put(key, value); }
        @Override public void putAll(Map<String, String> m) { map.putAll(m); }
        @Override public void remove(String key) { map.remove(key); }
        @Override public Iterator<Map.Entry<String, String>> iterator() { return map.entrySet().iterator(); }
        @Override public Iterable<Map.Entry<String, String>> entries() { return map.entrySet(); }
        @Override public void clear() { map.clear(); }
        @Override public String get(String key) { return map.get(key); }
        @Override public boolean contains(String key) { return map.containsKey(key); }
        @Override public Iterable<Map.Entry<String, String>> immutableEntries() { return new LinkedHashMap<>(map).entrySet(); }
    }
}
