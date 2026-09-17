package com.ams.flink.cplm.config;

import org.apache.flink.api.common.state.BroadcastState;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 3C.1 (spec v6 §5.6, R17; NR-052): the bundle half of the profile broadcast function.
 * Operates on the operator-owned, checkpointed broadcast state - no static map - so a restore from
 * a savepoint reproduces exactly the bundles that were prepared and active.
 *
 * <ul>
 *   <li>PREPARE: the signature must verify with the worker's key (else NACK UNSIGNED); the bundle
 *       is validated locally ({@link GateConfigBundle#validate}) and stored under
 *       {@code gate-config:prepared:<hash>} - ACK, or NACK naming every reason.</li>
 *   <li>APPLY: only a prepared hash can be applied (else NACK NOT_PREPARED); a STATE_BOUNDARY bundle
 *       allocates a new epoch; the bundle joins the scope's active list with its effective-from
 *       event time - {@link EffectiveBundleSelector} picks by that time, so results are never mixed.</li>
 *   <li>A record that does not parse is a NACK PARSE_ERROR (and a counter), never a silent skip.</li>
 * </ul>
 */
public final class BundleBroadcastHandler {
    public static final String RECORD_KIND = "GATE_CONFIG_BUNDLE";
    public static final String KEY_PREPARED = "gate-config:prepared:";
    public static final String KEY_ACTIVE = "gate-config:active:";
    public static final String KEY_EPOCH = "gate-config:epoch";
    static final int ACTIVE_HISTORY = 4;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private BundleBroadcastHandler() {}

    public static boolean isBundleRecord(JsonNode root) {
        return root != null && root.isObject() && RECORD_KIND.equals(root.path("record_kind").asText(""));
    }

    /**
     * Handles one control-plane message; returns the ACK / NACK records to emit (one, or none for a
     * record that is not a bundle at all).
     */
    public static List<String> handle(String json, BroadcastState<String, String> state, ConfigAck.WorkerIdentity id, String hmacKey) throws Exception {
        List<String> out = new ArrayList<>();
        JsonNode root;
        try {
            root = MAPPER.readTree(json);
        } catch (Exception e) {
            ConfigRejections.count("PARSE_ERROR");
            out.add(ConfigAck.nack(id, "", "", "PREPARE", "", "PARSE_ERROR: " + e.getMessage()));
            return out;
        }
        if (!isBundleRecord(root)) return out;
        String phase = root.path("phase").asText("PREPARE");
        String deploymentId = root.path("deployment_id").asText("");
        String bundleId = root.path("bundle_id").asText("");
        String hash = root.path("hash").asText("");
        GateConfigBundle b;
        try {
            b = GateConfigBundle.parse(root);
        } catch (Exception e) {
            ConfigRejections.count("PARSE_ERROR");
            out.add(ConfigAck.nack(id, deploymentId, bundleId, phase, hash, "PARSE_ERROR: " + e.getMessage()));
            return out;
        }
        String unsigned = verify(root, hmacKey);
        if (unsigned != null) {
            ConfigRejections.count("UNSIGNED");
            out.add(ConfigAck.nack(id, deploymentId, bundleId, phase, b.hash, unsigned));
            return out;
        }
        if ("PREPARE".equals(phase)) {
            List<String> reasons = b.validate(id.jobName);
            if (!reasons.isEmpty()) {
                ConfigRejections.count("REJECTED");
                out.add(ConfigAck.nack(id, deploymentId, bundleId, phase, b.hash, String.join("; ", reasons)));
                return out;
            }
            state.put(KEY_PREPARED + b.hash, root.get("bundle").toString());
            out.add(ConfigAck.ack(id, deploymentId, bundleId, phase, b.hash));
            return out;
        }
        if ("APPLY".equals(phase)) {
            if (!state.contains(KEY_PREPARED + b.hash)) {
                ConfigRejections.count("NOT_PREPARED");
                out.add(ConfigAck.nack(id, deploymentId, bundleId, phase, b.hash, "NOT_PREPARED: no PREPARE of " + b.hash.substring(0, Math.min(12, b.hash.length())) + " was acknowledged by this worker"));
                return out;
            }
            int epoch = currentEpoch(state);
            if ("STATE_BOUNDARY".equals(b.changeClass)) {
                epoch += 1;
                state.put(KEY_EPOCH, Integer.toString(epoch));
            }
            String key = KEY_ACTIVE + b.scopeKey();
            ArrayNode list = state.contains(key) ? (ArrayNode) MAPPER.readTree(state.get(key)) : MAPPER.createArrayNode();
            ArrayNode next = MAPPER.createArrayNode();
            for (JsonNode e : list) if (!b.hash.equals(e.path("hash").asText(""))) next.add(e);
            ObjectNode entry = next.addObject();
            entry.put("hash", b.hash);
            entry.put("bundle_id", b.bundleId);
            entry.put("effective_from_ms", b.effectiveFromMs);
            entry.put("epoch", epoch);
            entry.put("change_class", b.changeClass);
            entry.put("deployment_id", deploymentId);
            while (next.size() > ACTIVE_HISTORY) next.remove(0);
            state.put(key, next.toString());
            out.add(ConfigAck.ack(id, deploymentId, bundleId, phase, b.hash));
            return out;
        }
        ConfigRejections.count("UNKNOWN_PHASE");
        out.add(ConfigAck.nack(id, deploymentId, bundleId, phase, b.hash, "UNKNOWN_PHASE: " + phase));
        return out;
    }

    /** null when the signature verifies; else the NACK reason. A worker without a key cannot attribute any bundle. */
    static String verify(JsonNode message, String hmacKey) {
        if (hmacKey == null || hmacKey.isEmpty()) return "UNSIGNED: this worker has no gate-config key configured (CPLM_GATE_CONFIG_KEY)";
        String sig = message.path("signature").asText("");
        if (sig.isEmpty()) return "UNSIGNED: the message carries no signature";
        String expected = CanonicalJson.signature(message.get("bundle"), hmacKey);
        return expected.equalsIgnoreCase(sig) ? null : "UNSIGNED: the signature does not verify with this worker's key";
    }

    public static int currentEpoch(BroadcastState<String, String> state) throws Exception {
        String e = state.get(KEY_EPOCH);
        return e == null ? 0 : Integer.parseInt(e);
    }
}
