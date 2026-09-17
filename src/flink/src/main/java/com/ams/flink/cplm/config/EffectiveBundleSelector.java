package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.apache.flink.api.common.state.ReadOnlyBroadcastState;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * v2.5 Task 3C.1 (spec v6 §5.4-5.6; NR-052, NR-053): exactly one bundle governs a loop at a decision
 * time - the loop's own (LOOP scope) over its gate profile's (PROFILE) over the site's (SITE), and
 * within a scope the newest whose effective-from event time has been reached. A window decides at
 * its end time, so a window ending before a bundle's effective time keeps the previous bundle and
 * one ending after uses the new one; nothing is ever mixed inside one result. Restoring the same
 * broadcast state selects the same hash.
 */
public final class EffectiveBundleSelector {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EffectiveBundleSelector() {}

    public static final class Selected {
        public final GateConfigBundle bundle;
        public final int epoch;
        public final long effectiveFromMs;
        public final String changeClass;
        /** The next effective-from among the candidate scopes after the decision time (Long.MAX_VALUE when none): the selection holds until then. */
        public final long validUntilMs;

        Selected(GateConfigBundle bundle, int epoch, long effectiveFromMs, String changeClass, long validUntilMs) {
            this.bundle = bundle;
            this.epoch = epoch;
            this.effectiveFromMs = effectiveFromMs;
            this.changeClass = changeClass;
            this.validUntilMs = validUntilMs;
        }
    }

    /** The governing bundle ({@code bundle == null} when no active bundle covers the loop yet: the class pack governs, hash = profile hash). */
    public static Selected select(ReadOnlyBroadcastState<String, String> state, String site, String loopId, String gateProfileId, long decisionTimeMs,
                                  Map<String, GateConfigBundle> parsed) throws Exception {
        String[] scopes = {
                GateConfigBundle.scopeKey("LOOP", site, loopId),
                GateConfigBundle.scopeKey("PROFILE", site, gateProfileId),
                GateConfigBundle.scopeKey("SITE", site, null),
        };
        long validUntil = Long.MAX_VALUE;
        Selected chosen = null;
        for (String scope : scopes) {
            String json = state.get(BundleBroadcastHandler.KEY_ACTIVE + scope);
            if (json == null) continue;
            JsonNode best = null;
            for (JsonNode e : MAPPER.readTree(json)) {
                long eff = e.path("effective_from_ms").asLong(0L);
                if (eff > decisionTimeMs) { validUntil = Math.min(validUntil, eff); continue; }
                if (best == null || eff >= best.path("effective_from_ms").asLong(0L)) best = e;
            }
            if (best != null && chosen == null) {
                String hash = best.path("hash").asText("");
                GateConfigBundle b = parsed.get(hash);
                if (b == null) {
                    String bundleJson = state.get(BundleBroadcastHandler.KEY_PREPARED + hash);
                    if (bundleJson == null) continue;                              // applied but its content is gone: not selectable
                    b = GateConfigBundle.parse(bundleJson);
                    parsed.put(hash, b);
                }
                chosen = new Selected(b, best.path("epoch").asInt(0), best.path("effective_from_ms").asLong(0L), best.path("change_class").asText("POLICY"), Long.MAX_VALUE);
            }
        }
        return chosen == null ? new Selected(null, 0, 0L, null, validUntil) : new Selected(chosen.bundle, chosen.epoch, chosen.effectiveFromMs, chosen.changeClass, validUntil);
    }

    /**
     * Overlays the bundle on the class pack: the SITE, PROFILE and LOOP layer contents in order
     * (RESET_TO_INHERITED leaves the lower value), applied only through BundleProfileMapper; the
     * G12 values are kept for the response job; the bundle identity is stamped on the profile.
     */
    public static void apply(CplmLoopDynamicsProfile p, Selected s) {
        if (p == null || s == null || s.bundle == null) return;
        ObjectNode g12 = MAPPER.createObjectNode();
        for (JsonNode content : s.bundle.layerContents("SITE", "PROFILE", "LOOP")) {
            ObjectNode profileValues = MAPPER.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> it = content.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                JsonNode v = e.getValue();
                if (v == null || v.isNull() || (v.isTextual() && GateConfigBundle.RESET_TO_INHERITED.equals(v.asText()))) continue;
                if (BundleProfileMapper.responseProperties().contains(e.getKey())) g12.set(e.getKey(), v);
                else if (BundleProfileMapper.profileProperties().contains(e.getKey())) profileValues.set(e.getKey(), v);
                // else: in the catalogue but unsupported in this build - stated in the CAPABILITY record, not applied
            }
            BundleProfileMapper.apply(p, profileValues);
        }
        p.bundleHash = s.bundle.hash;
        p.bundleEpoch = s.epoch;
        p.bundleEffectiveFromMs = s.effectiveFromMs;
        p.bundleChangeClass = s.changeClass;
        p.bundleResponseValues = g12.size() == 0 ? null : new LinkedHashMap<>();
        if (p.bundleResponseValues != null) {
            Iterator<Map.Entry<String, JsonNode>> it = g12.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (e.getValue().isNumber()) p.bundleResponseValues.put(e.getKey(), e.getValue().asDouble());
            }
        }
    }
}
