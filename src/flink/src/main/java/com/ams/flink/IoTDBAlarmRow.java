package com.ams.flink;

import java.io.Serializable;

/**
 * DTO for a single alarm measurement row written to IoTDB.
 * IoTDB tree path: root.ams.site1.alarms.<safeAlarmId>
 *
 * Measurements written (7 per event):
 *   severity, state, ack_status, condition_active, priority, source_name, condition_name
 */
public final class IoTDBAlarmRow implements Serializable {

    private static final long serialVersionUID = 1L;

    /** IoTDB device path, e.g. root.ams.site1.alarms.abc123 */
    public final String devicePath;

    /** Event timestamp in epoch milliseconds (source time, not ingest time). */
    public final long timestampMs;

    public final int     severity;
    /** ACTIVE | CLEARED | ACKNOWLEDGED */
    public final String  state;
    public final boolean ackStatus;
    public final boolean conditionActive;
    /** CRITICAL | HIGH | MEDIUM | LOW | DIAGNOSTIC */
    public final String  priority;
    public final String  sourceName;
    public final String  conditionName;

    public IoTDBAlarmRow(
            String  devicePath,
            long    timestampMs,
            int     severity,
            String  state,
            boolean ackStatus,
            boolean conditionActive,
            String  priority,
            String  sourceName,
            String  conditionName) {
        this.devicePath      = devicePath;
        this.timestampMs     = timestampMs;
        this.severity        = severity;
        this.state           = state           == null ? "" : state;
        this.ackStatus       = ackStatus;
        this.conditionActive = conditionActive;
        this.priority        = priority        == null ? "" : priority;
        this.sourceName      = sourceName      == null ? "" : sourceName;
        this.conditionName   = conditionName   == null ? "" : conditionName;
    }
}
