package com.ams.flink;

/** Normalized alarm event after validation/enrichment. */
public class RawOpcAlarmEvent implements java.io.Serializable {
    public String alarmId;
    public String alarmKey;
    public String serverId;
    public String source;
    public String condition;
    public String subCondition;
    public String message;
    public int severity;
    /**
     * Severity as received on the wire, BEFORE ValidationMap normalizes http-feed
     * events to the priority band floor. FloodDetectFilter tests this value
     * (PIPE-012): the normalized severity is capped at 900, so the documented
     * "drop >= 950" band could never fire on the http-feed path.
     */
    public int rawSeverity;
    public boolean conditionActive;
    public boolean ackRequired;
    /** DCS/OPC ack bit from telemetry — informational only; never drives UI projection. */
    public boolean opcDcsAcknowledged;
    /** Operator-confirmed ack — only set by ack-results / operator-actions path. */
    public boolean acknowledged;
    public int cookieOffset;
    public long eventTimeEpochMs;
    public long activeTimeEpochMs;
    public long activeFileTime;
    public String priority;
    public String category;
    public String lifecycleState;
    public String transitionType; // NEW, ACTIVE, CLEARED
    public boolean duplicate;
    public boolean httpFeed;
    public String sourceEventId;
    public String opcAttributesJson;

    public String getAlarmKey() {
        return alarmKey != null ? alarmKey : AlarmKeys.alarmKey(serverId, source, condition, subCondition);
    }
}
