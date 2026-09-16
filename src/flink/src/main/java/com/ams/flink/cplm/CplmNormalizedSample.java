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
    /** v2.5 (2C.1c): the tuple's ingest_ts_ms - when the ingestion emitted it (G0 arrival_time); 0 when absent. */
    public long ingestTsMs;
    public double pv;
    public double sp;
    public double op;
    public Double vp;
    public String mode = "UNKNOWN";
    /** Normalised verdict of the 1.0 field: GOOD | UNCERTAIN | BAD | UNKNOWN. Absent = UNKNOWN (v2.5 R04). */
    public String quality = "UNKNOWN";
    public boolean isValid = true;
    /** Why isValid is false (v2.5): NON_FINITE, MISSING_ID, MISSING_TS, MISSING_REQUIRED_ROLE, PARSE_ERROR. */
    public String invalidReason;
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

    // ── v2.5 schema 1.1 (spec v6 R03/C02): per-role provenance ─────────────────────
    /** "1.0" (top-level fields only, roles synthesised) or "1.1" (producer wrote roles{}). */
    public String schemaVersion = "1.0";
    public long bindingRevision;
    public int gridSeconds;
    /** pv/sp/op/vp/mode → observation; never null after fromJson (may be empty when invalid). */
    public java.util.Map<String, com.ams.flink.cplm.contract.RoleObservation> roles = new java.util.LinkedHashMap<>();

    public CplmNormalizedSample() {
    }

    /** The role's observation, or null when the tuple has no such role. */
    public com.ams.flink.cplm.contract.RoleObservation role(String role) {
        return roles == null ? null : roles.get(role);
    }

    /**
     * Whether VP may be used as evidence for this sample. A 1.1 tuple exposes VP's own
     * quality and hold age: a BAD or over-age held VP is not evidence (a stale positioner
     * value next to a fresh OP must not read as "following"). A 1.0 tuple cannot say, so
     * presence alone decides, exactly as before.
     */
    public boolean vpEligible(CplmLoopDynamicsProfile profile) {
        return vpEligible(profile == null ? CplmLoopDynamicsProfile.VP_MAX_AGE_S_DEFAULT : profile.vpMaxAgeS);
    }

    /** The same rule with the hold-age limit given directly (the response job carries it in its own settings). */
    public boolean vpEligible(double maxAgeS) {
        if (vp == null) return false;
        com.ams.flink.cplm.contract.RoleObservation o = role("vp");
        if (o == null || com.ams.flink.cplm.contract.RoleObservation.SOURCE_LEGACY_TUPLE.equals(o.provenance)) return true;
        if (!o.isGood()) return false;
        return !(o.held && o.ageMs > maxAgeS * 1000.0);
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
                s.invalidReason = "MISSING_ID";
                return s;
            }

            if (root.has("event_ts_ms")) {
                s.eventTsMs = root.get("event_ts_ms").asLong();
            } else if (root.has("timestamp")) {
                s.eventTsMs = root.get("timestamp").asLong();
            } else {
                s.isValid = false;
                s.invalidReason = "MISSING_TS";
                return s;
            }

            // P1-12: a missing or non-numeric required signal is NOT zero.
            // asDouble(0.0) also swallows JSON null and unparseable strings, so
            // a bridge that stopped publishing OP produced op=0 with isValid
            // still true -> effort_ratio 0, travel 0 -> "G4 PASS, actuator
            // healthy" for a valve nobody was receiving data from.
            if (!isNumeric(root, "pv") || !isNumeric(root, "sp") || !isNumeric(root, "op")) {
                s.isValid = false;
                s.invalidReason = "MISSING_REQUIRED_ROLE";
                return s;
            }
            s.pv = root.get("pv").asDouble();
            s.sp = root.get("sp").asDouble();
            s.op = root.get("op").asDouble();
            // v2.5 R04: Double.parseDouble("NaN") / "1e309" succeed. A non-finite required
            // role would turn every window statistic into NaN; reject the tuple with a reason.
            if (!Double.isFinite(s.pv) || !Double.isFinite(s.sp) || !Double.isFinite(s.op)) {
                s.isValid = false;
                s.invalidReason = "NON_FINITE";
                return s;
            }
            if (root.has("vp") && !root.get("vp").isNull()) {
                double v = root.get("vp").asDouble();
                s.vp = Double.isFinite(v) ? v : null;   // optional: dropped, never a NaN in the engine
            }
            s.mode = root.has("mode") ? root.get("mode").asText("UNKNOWN") : "UNKNOWN";
            JsonNode q = root.get("quality");
            if (q != null && !q.isNull() && !q.asText().trim().isEmpty()) {
                s.quality = q.asText().trim();
            } else if (root.has("is_good_quality")) {
                s.quality = root.get("is_good_quality").asBoolean(false) ? "GOOD" : "BAD";
            } else {
                s.quality = "UNKNOWN";                 // absent is UNKNOWN, never GOOD (R04)
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
            com.ams.flink.cplm.contract.TupleCodec.applyRoles(root, s);
        } catch (Exception e) {
            s.isValid = false;
            s.invalidReason = "PARSE_ERROR";
        }
        return s;
    }

    /**
     * v2.5 R04 (replaces P2-20). Quality is decoded ONCE, at ingestion, under the data
     * source's declared protocol (ingestion-service QualityDecoder), and arrives here as a
     * normalised verdict. The engine therefore accepts exactly one token as good: GOOD.
     * A raw vendor string ("Good_NonSpecific"), a raw OPC word ("192"), an absent field
     * and anything unrecognised are all NOT good - the old rule let every one of them
     * pass G0. UNCERTAIN still counts as not-good: the engine has no partial weighting.
     */
    public boolean isGoodQuality() {
        return "GOOD".equals(normalizedQuality());
    }

    /** GOOD | UNCERTAIN | BAD | UNKNOWN - anything outside the vocabulary is UNKNOWN. */
    public String normalizedQuality() {
        if (quality == null) return "UNKNOWN";
        switch (quality.trim().toUpperCase()) {
            case "GOOD": return "GOOD";
            case "UNCERTAIN": return "UNCERTAIN";
            case "BAD": return "BAD";
            default: return "UNKNOWN";
        }
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
