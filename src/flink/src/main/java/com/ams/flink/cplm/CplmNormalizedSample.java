package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;

/**
 * Normalized control-loop sample — supports both legacy loop-raw-data ({@code tagId,timestamp})
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
                s.loopId = root.get("loop_id").asText();
            } else if (root.has("tagId")) {
                s.loopId = root.get("tagId").asText();
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

            s.pv = root.has("pv") ? root.get("pv").asDouble(0.0) : 0.0;
            s.sp = root.has("sp") ? root.get("sp").asDouble(0.0) : 0.0;
            s.op = root.has("op") ? root.get("op").asDouble(0.0) : 0.0;
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

    public boolean isGoodQuality() {
        return quality == null || "GOOD".equalsIgnoreCase(quality);
    }

    public boolean isAutoMode() {
        return mode != null && mode.toUpperCase().contains("AUTO");
    }
}
