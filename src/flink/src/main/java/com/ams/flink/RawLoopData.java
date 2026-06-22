package com.ams.flink;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;

public class RawLoopData implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String tagId;
    public long timestampEpochMs;
    public double pv;
    public double sp;
    public double op;
    public String mode;
    public boolean isValid = true;

    public RawLoopData() {
    }

    public static RawLoopData fromJson(String json) {
        RawLoopData data = new RawLoopData();
        try {
            JsonNode root = MAPPER.readTree(json);
            if (!root.has("tagId") || !root.has("timestamp")) {
                data.isValid = false;
                return data;
            }
            data.tagId = root.get("tagId").asText();
            data.timestampEpochMs = root.get("timestamp").asLong();
            data.pv = root.has("pv") ? root.get("pv").asDouble(0.0) : 0.0;
            data.sp = root.has("sp") ? root.get("sp").asDouble(0.0) : 0.0;
            data.op = root.has("op") ? root.get("op").asDouble(0.0) : 0.0;
            data.mode = root.has("mode") ? root.get("mode").asText("UNKNOWN") : "UNKNOWN";
        } catch (Exception e) {
            data.isValid = false;
        }
        return data;
    }
}
