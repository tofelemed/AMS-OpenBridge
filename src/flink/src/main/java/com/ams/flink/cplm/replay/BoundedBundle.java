package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.config.BundleProfileMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * v2.5 (3B.3 / 3C.1): the configuration a BOUNDED run evaluates under - a SHADOW run of a draft
 * bundle, or a reconstruction under the bundle the original run carried - passed by the control
 * plane as {@code --bundle-hash} and {@code --bundle-properties-b64} (the resolved properties,
 * base64 JSON) because a bounded job consumes no broadcast. Applied through BundleProfileMapper
 * and nothing else; the hash is stamped on every result so the run is attributable.
 */
public final class BoundedBundle implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public final String hash;
    public final String propertiesJson;

    public BoundedBundle(String hash, String propertiesJson) {
        this.hash = hash;
        this.propertiesJson = propertiesJson;
    }

    /** null when the run carries no bundle (the pack + registry attributes govern, hash = profile hash). */
    public static BoundedBundle fromArgs(String hash, String propertiesB64) {
        if (hash == null || hash.isEmpty() || propertiesB64 == null || propertiesB64.isEmpty()) return null;
        return new BoundedBundle(hash, new String(Base64.getDecoder().decode(propertiesB64), StandardCharsets.UTF_8));
    }

    /** Overlays the resolved properties on the profile and stamps the hash; an unknown or ill-typed property fails the run by name. */
    public CplmLoopDynamicsProfile apply(CplmLoopDynamicsProfile profile) {
        try {
            JsonNode props = MAPPER.readTree(propertiesJson);
            JsonNode g12 = MAPPER.createObjectNode();
            JsonNode profileValues = MAPPER.createObjectNode();
            java.util.Iterator<java.util.Map.Entry<String, JsonNode>> it = props.fields();
            while (it.hasNext()) {
                java.util.Map.Entry<String, JsonNode> e = it.next();
                if (BundleProfileMapper.responseProperties().contains(e.getKey())) ((org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode) g12).set(e.getKey(), e.getValue());
                else if (BundleProfileMapper.profileProperties().contains(e.getKey())) ((org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode) profileValues).set(e.getKey(), e.getValue());
            }
            BundleProfileMapper.apply(profile, profileValues);
            profile.bundleHash = hash;
            profile.bundleChangeClass = "POLICY";
            if (g12.size() > 0) {
                profile.bundleResponseValues = new java.util.LinkedHashMap<>();
                it = g12.fields();
                while (it.hasNext()) {
                    java.util.Map.Entry<String, JsonNode> e = it.next();
                    if (e.getValue().isNumber()) profile.bundleResponseValues.put(e.getKey(), e.getValue().asDouble());
                }
            }
            return profile;
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("--bundle-properties-b64 does not decode to JSON: " + e.getMessage(), e);
        }
    }
}
