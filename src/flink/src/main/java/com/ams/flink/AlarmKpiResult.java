package com.ams.flink;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;

public class AlarmKpiResult implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String kpiType;
    public long windowStartMs;
    public long windowEndMs;
    
    // For Alarm Rates
    public int alarmCount;
    public String floodStatus;
    
    // For Standing Alarms
    public int standingCount;
    public long oldestStandingDurationMs;
    
    // For Bad Actors
    public String alarmId;
    public String nuisanceType;
    public int occurrences;
    
    // For Health Score
    public double healthScore;

    public AlarmKpiResult() {
    }

    public String toJson() {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("kpiType", this.kpiType);
        out.put("windowStartMs", this.windowStartMs);
        out.put("windowEndMs", this.windowEndMs);
        
        if ("ALARM_RATE".equals(kpiType)) {
            out.put("alarmCount", this.alarmCount);
            out.put("floodStatus", this.floodStatus);
        } else if ("STANDING_ALARM_SNAPSHOT".equals(kpiType)) {
            out.put("standingCount", this.standingCount);
            out.put("oldestStandingDurationMs", this.oldestStandingDurationMs);
        } else if ("BAD_ACTOR".equals(kpiType)) {
            out.put("alarmId", this.alarmId);
            out.put("nuisanceType", this.nuisanceType);
            out.put("occurrences", this.occurrences);
        } else if ("HEALTH_SCORE".equals(kpiType)) {
            out.put("healthScore", this.healthScore);
        }
        
        return out.toString();
    }
}
