package com.ams.flink.cplm.contract;

import com.ams.flink.cplm.CplmNormalizedSample;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Samples-tuple codec (spec v6 R03/C02). The 1.0 top-level fields are parsed by
 * {@link CplmNormalizedSample#fromJson}; this class adds the schema-1.1 {@code roles{}}
 * block and synthesises a legacy-labelled block for 1.0 messages so every consumer can rely
 * on {@link CplmNormalizedSample#role(String)} regardless of the producer's generation.
 */
public final class TupleCodec {
    private static final String[] ROLES = {"pv", "sp", "op", "vp", "mode"};

    private TupleCodec() {
    }

    /** Parse a tuple of either schema. Never throws; invalid input yields {@code isValid=false}. */
    public static CplmNormalizedSample fromJson(String json) {
        return CplmNormalizedSample.fromJson(json);
    }

    /**
     * Called by {@link CplmNormalizedSample#fromJson} after the 1.0 fields are in place.
     * Reads {@code schema_version}, {@code binding_revision}, {@code grid_seconds} and
     * {@code roles}; when the block is absent the roles are synthesised from the 1.0 fields.
     */
    public static void applyRoles(JsonNode root, CplmNormalizedSample s) {
        s.schemaVersion = root.has("schema_version") ? root.get("schema_version").asText("1.0") : "1.0";
        s.bindingRevision = root.path("binding_revision").asLong(0L);
        s.gridSeconds = root.path("grid_seconds").asInt(0);
        JsonNode block = root.get("roles");
        Map<String, RoleObservation> roles = new LinkedHashMap<>();
        if (block != null && block.isObject()) {
            for (String role : ROLES) {
                JsonNode n = block.get(role);
                if (n == null || n.isNull() || !n.isObject()) continue;
                roles.put(role, parseRole(role, n));
            }
        } else {
            synthesiseLegacy(s, roles);
        }
        s.roles = roles;
    }

    private static RoleObservation parseRole(String role, JsonNode n) {
        RoleObservation o = new RoleObservation();
        o.role = role;
        JsonNode v = n.get("value");
        if (v != null && v.isNumber()) o.value = v.asDouble();
        else if (v != null && v.isTextual()) {
            if ("mode".equals(role)) o.stringValue = v.asText();
            else {
                try { o.value = Double.parseDouble(v.asText().trim()); }
                catch (NumberFormatException e) { o.stringValue = v.asText(); }
            }
        }
        o.modeNative = n.has("mode_native") && !n.get("mode_native").isNull() ? n.get("mode_native").asText() : null;
        o.sampleTsMs = n.path("sample_ts_ms").asLong(0L);
        o.verifiedTsMs = n.path("verified_ts_ms").asLong(o.sampleTsMs);
        o.qualityNative = n.path("quality_native").asText("");
        o.quality = n.path("quality").asText("UNKNOWN");
        o.unit = n.has("unit") && !n.get("unit").isNull() ? n.get("unit").asText() : null;
        o.held = n.path("held").asBoolean(false);
        o.ageMs = n.path("age_ms").asLong(0L);
        o.provenance = RoleObservation.SOURCE_ROLES_BLOCK;
        return o;
    }

    /** A 1.0 tuple has one timestamp and one quality: attribute them to every role, labelled. */
    private static void synthesiseLegacy(CplmNormalizedSample s, Map<String, RoleObservation> roles) {
        String q = s.isGoodQuality() ? "GOOD" : "BAD";
        roles.put("pv", legacy("pv", s.pv, null, s.eventTsMs, q));
        roles.put("sp", legacy("sp", s.sp, null, s.eventTsMs, q));
        roles.put("op", legacy("op", s.op, null, s.eventTsMs, q));
        if (s.vp != null) roles.put("vp", legacy("vp", s.vp, null, s.eventTsMs, q));
        if (s.mode != null && !"UNKNOWN".equals(s.mode)) roles.put("mode", legacy("mode", null, s.mode, s.eventTsMs, q));
    }

    private static RoleObservation legacy(String role, Double value, String str, long ts, String quality) {
        RoleObservation o = new RoleObservation();
        o.role = role;
        o.value = value;
        o.stringValue = str;
        o.sampleTsMs = ts;
        o.verifiedTsMs = ts;
        o.quality = quality;
        o.qualityNative = "";
        o.held = false;
        o.ageMs = 0L;
        o.provenance = RoleObservation.SOURCE_LEGACY_TUPLE;
        return o;
    }
}
