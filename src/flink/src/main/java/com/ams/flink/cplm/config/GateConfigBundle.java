package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 3C.1 (spec v6 §5.3-5.6): one immutable configuration bundle as the control plane
 * publishes it on traverse.cpa.context.gate-config.v1 (cplm-api BundleEnvelope) - identity, scope,
 * change class, effective time, the layers (FACTORY / SITE / PROFILE / LOOP / REGIME contents) and
 * the resolved block. {@link #validate(String)} is what a worker checks locally before it ACKs a
 * PREPARE: catalogue identity, content hash, scope this build can select, every property known,
 * typed and in bounds, the execution plan within the compiled capacity.
 */
public final class GateConfigBundle {
    public static final String RESET_TO_INHERITED = "RESET_TO_INHERITED";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public final String bundleId;
    public final int version;
    public final String hash;
    public final String site;
    public final String scopeKind;          // SITE | PROFILE | LOOP | REGIME
    public final String profileId;          // PROFILE scope reference (the gate profile id)
    public final String loopId;             // LOOP / REGIME scope reference
    public final String regimeId;
    public final String changeClass;        // POLICY | STATE_BOUNDARY | DEPLOYMENT
    public final String catalogueHash;
    public final long effectiveFromMs;      // event time from which the bundle governs (0 = immediately)
    public final JsonNode bundle;           // the whole bundle document (what the signature covers)

    private GateConfigBundle(JsonNode bundle, long effectiveFromMs) {
        this.bundle = bundle;
        this.bundleId = bundle.path("bundle_id").asText("");
        this.version = bundle.path("version").asInt(0);
        this.hash = bundle.path("hash").asText("");
        JsonNode scope = bundle.path("scope");
        this.site = scope.path("site").asText("");
        this.scopeKind = scope.path("kind").asText("");
        this.profileId = text(scope, "profile_id");
        this.loopId = text(scope, "loop_id");
        this.regimeId = text(scope, "regime_id");
        this.changeClass = bundle.path("change_class").asText("POLICY");
        this.catalogueHash = bundle.path("requires").path("catalogue_hash").asText("");
        this.effectiveFromMs = effectiveFromMs;
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    /** From the control-plane message ({@code record_kind: GATE_CONFIG_BUNDLE}) or a bare bundle document. */
    public static GateConfigBundle parse(JsonNode messageOrBundle) {
        JsonNode b = messageOrBundle.has("bundle") ? messageOrBundle.get("bundle") : messageOrBundle;
        if (!b.isObject() || !b.has("hash") || !b.has("scope") || !b.has("layers") || !b.has("resolved")) {
            throw new IllegalArgumentException("a bundle needs hash, scope, layers and resolved");
        }
        long eff = messageOrBundle.path("effective_from_ms").isNumber() ? messageOrBundle.path("effective_from_ms").asLong() : 0L;
        if (eff == 0L && b.path("effective_from").isTextual()) {
            try { eff = java.time.OffsetDateTime.parse(b.path("effective_from").asText()).toInstant().toEpochMilli(); }
            catch (Exception ignored) { eff = 0L; }
        }
        return new GateConfigBundle(b, eff);
    }

    public static GateConfigBundle parse(String json) throws java.io.IOException {
        return parse(MAPPER.readTree(json));
    }

    /** "LOOP:site/loop", "PROFILE:site/profile", "SITE:site" - the key the selector matches on. */
    public String scopeKey() {
        return scopeKey(scopeKind, site, "LOOP".equals(scopeKind) || "REGIME".equals(scopeKind) ? loopId : profileId);
    }

    public static String scopeKey(String kind, String site, String ref) {
        if ("SITE".equals(kind)) return "SITE:" + site;
        return kind + ":" + site + "/" + ref;
    }

    public JsonNode resolvedProperties() {
        return bundle.path("resolved").path("properties");
    }

    public JsonNode executionPlan() {
        return bundle.path("resolved").path("execution_plan");
    }

    /** The contents of the layers of the given kinds, in bundle order (ordinal), for overlaying the class pack. */
    public List<JsonNode> layerContents(String... kinds) {
        List<String> wanted = Arrays.asList(kinds);
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode l : bundle.path("layers")) {
            if (wanted.contains(l.path("kind").asText("")) && l.path("content").isObject()) out.add(l.path("content"));
        }
        return out;
    }

    /** The content hash the control plane computed: SHA-256 over canonical {layers, resolved}. */
    public String recomputedHash() {
        ObjectNode input = MAPPER.createObjectNode();
        input.set("layers", bundle.path("layers"));
        input.set("resolved", bundle.path("resolved"));
        return CanonicalJson.sha256(input);
    }

    /**
     * Every reason this build must NACK the bundle on PREPARE; empty = acceptable. Properties the
     * build declares unsupported (unsupported-in-build.json) are accepted and simply not applied -
     * that is stated in the CAPABILITY record, not hidden here.
     */
    public List<String> validate(String jobName) {
        List<String> reasons = new ArrayList<>();
        PropertyCatalogue cat = PropertyCatalogue.current();
        if (!cat.catalogueHash().equals(catalogueHash)) {
            reasons.add("CATALOGUE_MISMATCH: bundle validated against catalogue " + head(catalogueHash) + ", this build carries " + head(cat.catalogueHash()));
        }
        if (hash.isEmpty() || !hash.equals(recomputedHash())) reasons.add("HASH_MISMATCH: the bundle content does not hash to " + head(hash));
        if ("REGIME".equals(scopeKind)) reasons.add("DEPLOYMENT_REQUIRED: REGIME-scoped bundles need a regime selector this build does not have");
        else if (!"SITE".equals(scopeKind) && !"PROFILE".equals(scopeKind) && !"LOOP".equals(scopeKind)) reasons.add("INVALID: scope kind '" + scopeKind + "'");
        if (site.isEmpty()) reasons.add("INVALID: scope.site is empty");
        if ("DEPLOYMENT".equals(changeClass)) reasons.add("DEPLOYMENT_REQUIRED: a DEPLOYMENT-class change ships in a build, never in a bundle");
        JsonNode props = resolvedProperties();
        if (!props.isObject()) reasons.add("INVALID: resolved.properties must be an object");
        else {
            Iterator<Map.Entry<String, JsonNode>> it = props.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String r = checkProperty(cat, e.getKey(), e.getValue());
                if (r != null) reasons.add(r);
            }
            JsonNode pMax = props.get("G5.period_max_s"), cyc = props.get("G5.min_complete_cycles");
            if (pMax != null && pMax.isNumber() && cyc != null && cyc.isNumber()) {
                String cap = ExecutionPlanCapacity.periodCapacity(pMax.asDouble(), cyc.asInt());
                if (!cap.isEmpty()) reasons.add("DEPLOYMENT_REQUIRED: " + cap);
            }
        }
        for (JsonNode l : bundle.path("layers")) {
            Iterator<Map.Entry<String, JsonNode>> it = l.path("content").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (cat.find(e.getKey()) == null) reasons.add("UNKNOWN_PROPERTY: '" + e.getKey() + "' in the " + l.path("kind").asText("?") + " layer is not in the catalogue");
            }
        }
        JsonNode plan = executionPlan();
        if (plan.isObject()) reasons.addAll(ExecutionPlanCapacity.validate(plan));
        else reasons.add("INVALID: resolved.execution_plan must be an object");
        return reasons;
    }

    /** Type / bounds / enum check of one resolved value against the catalogue; null when acceptable. */
    static String checkProperty(PropertyCatalogue cat, String property, JsonNode v) {
        PropertyCatalogue.Entry e = cat.find(property);
        if (e == null) return "UNKNOWN_PROPERTY: '" + property + "' is not in the catalogue";
        if (v == null || v.isNull()) return null;                                       // NO_VALUE, stated by the control plane
        if (v.isTextual() && RESET_TO_INHERITED.equals(v.asText())) return "INVALID: '" + property + "' resolved to RESET_TO_INHERITED";
        switch (e.type) {
            case "number":
            case "integer": {
                if (!v.isNumber()) return "TYPE: '" + property + "' must be a " + e.type + ", got " + v.getNodeType();
                double d = v.asDouble();
                if (!Double.isFinite(d)) return "INVALID: '" + property + "' is not finite";
                if ("integer".equals(e.type) && !v.isIntegralNumber() && d != Math.rint(d)) return "TYPE: '" + property + "' must be an integer";
                if (e.minimum() != null && d < e.minimum()) return "OUT_OF_BOUNDS: '" + property + "' = " + d + " below " + e.minimum();
                if (e.maximum() != null && d > e.maximum()) return "OUT_OF_BOUNDS: '" + property + "' = " + d + " above " + e.maximum();
                return null;
            }
            case "boolean": return v.isBoolean() ? null : "TYPE: '" + property + "' must be a boolean";
            case "enum": {
                if (!v.isTextual()) return "TYPE: '" + property + "' must be one of " + e.enumValues();
                return e.enumValues().isEmpty() || e.enumValues().contains(v.asText()) ? null : "ENUM: '" + property + "' = '" + v.asText() + "' is not one of " + e.enumValues();
            }
            case "string_array": {
                if (!v.isArray()) return "TYPE: '" + property + "' must be an array";
                if (e.minItems() != null && v.size() < e.minItems()) return "OUT_OF_BOUNDS: '" + property + "' needs at least " + e.minItems() + " items";
                if (e.maxItems() != null && v.size() > e.maxItems()) return "OUT_OF_BOUNDS: '" + property + "' allows at most " + e.maxItems() + " items";
                for (JsonNode i : v) if (!i.isTextual()) return "TYPE: '" + property + "' items must be strings";
                return null;
            }
            default: return v.isTextual() ? null : "TYPE: '" + property + "' must be text";
        }
    }

    private static String head(String h) {
        return h == null ? "?" : h.substring(0, Math.min(12, h.length()));
    }
}
