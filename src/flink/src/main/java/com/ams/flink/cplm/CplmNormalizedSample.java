package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;

/**
 * Normalized control-loop sample — supports both legacy traverse.cpa.loop-raw-data ({@code tagId,timestamp})
 * and CPLM reference format ({@code loop_id,event_ts_ms,quality,vp}).
 */
public final class CplmNormalizedSample implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String loopId;
    public long eventTsMs;
    public double pv;
    public double sp;
    public double op;
    public Double vp;
    public String mode = "UNKNOWN";
    public String quality = "GOOD";
    public boolean isValid = true;
    /** Optional registry loop type (FLOW/PRESSURE/LEVEL/TEMPERATURE or class id). */
    public String loopType;
    /** Optional asset UUID for spine override lookup. */
    public String assetUuid;
    /** Optional dynamic-class override (FAST_SELF_REG / INTEGRATING / …). */
    public String dynamicClassOverride;
    /**
     * Profile resolved by the broadcast-connected ingest operator. It travels
     * with the sample so downstream windows do not depend on JVM-local state.
     */
    public CplmLoopDynamicsProfile resolvedProfile;

    public CplmNormalizedSample() {
    }

    public static CplmNormalizedSample fromJson(String json) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        try {
            JsonNode root = MAPPER.readTree(json);
            if (root.has("loop_id")) {
                s.loopId = cleanId(root.get("loop_id").asText());
            } else if (root.has("tagId")) {
                s.loopId = cleanId(root.get("tagId").asText());
            } else {
                s.isValid = false;
                return s;
            }

            if (root.has("event_ts_ms")) {
                s.eventTsMs = root.get("event_ts_ms").asLong();
            } else if (root.has("timestamp")) {
                s.eventTsMs = root.get("timestamp").asLong();
            } else {
                s.isValid = false;
                return s;
            }

            // P1-12: a missing or non-numeric required signal is NOT zero.
            // asDouble(0.0) also swallows JSON null and unparseable strings, so
            // a bridge that stopped publishing OP produced op=0 with isValid
            // still true -> effort_ratio 0, travel 0 -> "G4 PASS, actuator
            // healthy" for a valve nobody was receiving data from.
            if (!isNumeric(root, "pv") || !isNumeric(root, "sp") || !isNumeric(root, "op")) {
                s.isValid = false;
                return s;
            }
            s.pv = root.get("pv").asDouble();
            s.sp = root.get("sp").asDouble();
            s.op = root.get("op").asDouble();
            if (root.has("vp") && !root.get("vp").isNull()) {
                s.vp = root.get("vp").asDouble();
            }
            s.mode = root.has("mode") ? root.get("mode").asText("UNKNOWN") : "UNKNOWN";
            if (root.has("quality")) {
                s.quality = root.get("quality").asText("GOOD");
            } else if (root.has("is_good_quality")) {
                s.quality = root.get("is_good_quality").asBoolean(true) ? "GOOD" : "BAD";
            }
            if (root.has("isValid") && !root.get("isValid").asBoolean(true)) {
                s.isValid = false;
            }
            if (root.has("loop_type")) s.loopType = root.get("loop_type").asText(null);
            else if (root.has("loopType")) s.loopType = root.get("loopType").asText(null);
            if (root.has("asset_uuid")) s.assetUuid = root.get("asset_uuid").asText(null);
            else if (root.has("assetUuid")) s.assetUuid = root.get("assetUuid").asText(null);
            if (root.has("dynamic_class")) s.dynamicClassOverride = root.get("dynamic_class").asText(null);
            else if (root.has("dynamicClass")) s.dynamicClassOverride = root.get("dynamicClass").asText(null);
        } catch (Exception e) {
            s.isValid = false;
        }
        return s;
    }

    /**
     * P2-20 - the engine accepted only the exact string "GOOD"; the standard
     * OPC-UA vocabulary ("Good_NonSpecific", "GoodNonSpecific"), the numeric
     * OPC form (192/64/0) and NE107 states all counted as bad, so a healthy
     * OPC-fed loop read bad_quality_pct = 1.0 and (post-P1-11) failed G0.
     * Good = anything starting with "good" or an OPC numeric >= 192.
     * UNCERTAIN deliberately counts as not-good: the engine has no partial
     * weighting, and treating uncertain data as trustworthy is the worse error.
     */
    public boolean isGoodQuality() {
        if (quality == null) return true;              // absent field: legacy producers
        String q = quality.trim();
        if (q.isEmpty()) return true;
        char c = q.charAt(0);
        if (c == 'g' || c == 'G') return true;          // GOOD, Good_NonSpecific, ...
        if (Character.isDigit(c)) {
            try { return Integer.parseInt(q) >= 192; }  // OPC numeric
            catch (NumberFormatException e) { return false; }
        }
        return false;
    }

    /**
     * P1-7 - normalize the mode vocabulary HERE rather than in each producer.
     * The previous test was mode.contains("AUTO"), which is false for the
     * strings real systems actually emit: PI/Honeywell exports say "AUT", and
     * a cascade slave says "CAS"/"CASCADE". Both scored auto_pct = 0, which
     * excluded every window as EXCLUDED_MODE - indistinguishable on screen
     * from an operator leaving the loop in manual.
     *
     * Auto = the loop is under closed-loop control, whatever the DCS calls it.
     * A cascade / remote-setpoint slave qualifies: its setpoint comes from a
     * master, but the algorithm is controlling. Manual, initialization-manual
     * and remote-output do not.
     */
    private static final java.util.Set<String> AUTO_MODE_TOKENS = java.util.Set.of(
            "AUTO", "AUT", "A", "AUTOMATIC", "NORMAL", "NORM",
            "CAS", "CASC", "CASCADE", "RSP", "DDC", "SUP", "SUPERVISORY");

    private static final java.util.Set<String> MANUAL_MODE_TOKENS = java.util.Set.of(
            "MAN", "MANUAL", "M", "IMAN", "ROUT", "LO", "LOCAL", "OFF", "TRACK");

    public boolean isAutoMode() {
        if (mode == null) return false;
        String m = mode.trim().toUpperCase();
        if (m.isEmpty() || "UNKNOWN".equals(m)) return false;
        // Explicit manual tokens first: IMAN/ROUT must never be mistaken for
        // auto by the looser substring fallback below.
        if (MANUAL_MODE_TOKENS.contains(m)) return false;
        if (AUTO_MODE_TOKENS.contains(m)) return true;
        // Compound vendor strings, e.g. "AUTO-CAS".
        return m.contains("AUTO") || m.contains("CASCADE");
    }

    /**
     * P2-19 - a UTF-8 BOM smuggled into a producer's first key/value made
     * "\uFEFFG13_LOOP_A" a DIFFERENT loop from "G13_LOOP_A": keyed state split,
     * and the sparse phantom partition dropped out of watermark computation so
     * its records arrived late and were discarded. Strip BOM + whitespace here
     * so no producer quirk can fork a loop's identity.
     */
    private static String cleanId(String id) {
        if (id == null) return null;
        return id.replace("\uFEFF", "").trim();
    }

    /** True when the JSON node holds a usable number for the given field. */
    private static boolean isNumeric(JsonNode root, String field) {
        JsonNode v = root.get(field);
        if (v == null || v.isNull()) return false;
        if (v.isNumber()) return true;
        if (v.isTextual()) {
            try { Double.parseDouble(v.asText().trim()); return true; }
            catch (NumberFormatException e) { return false; }
        }
        return false;
    }
}
