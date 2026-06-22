package com.ams.flink;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;

public class LoopKpiResult implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String tagId;
    public long windowStartMs;
    public long windowEndMs;
    public double iae;
    public double ise;
    public String dominantMode;
    public int sampleCount;

    public LoopKpiResult() {
    }

    public String toJson() {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("eventType", "LOOP_KPI");
        out.put("tagId", this.tagId);
        out.put("windowStartMs", this.windowStartMs);
        out.put("windowEndMs", this.windowEndMs);
        out.put("iae", this.iae);
        out.put("ise", this.ise);
        out.put("dominantMode", this.dominantMode);
        out.put("sampleCount", this.sampleCount);
        return out.toString();
    }
}
