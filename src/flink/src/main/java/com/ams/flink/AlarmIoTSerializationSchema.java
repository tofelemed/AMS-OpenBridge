package com.ams.flink;

import org.apache.iotdb.flink.Event;
import org.apache.iotdb.flink.IoTSerializationSchema;
import org.apache.iotdb.tsfile.file.metadata.enums.TSDataType;

import java.util.Arrays;
import java.util.List;

/**
 * Maps an {@link IoTDBAlarmRow} to an IoTDB {@link Event} for the flink-iotdb-connector.
 *
 * IoTDB device path:  root.ams.site1.alarms.<alarmId>
 * Measurements (7):
 *   severity (INT32), state (TEXT), ack_status (BOOLEAN),
 *   condition_active (BOOLEAN), priority (TEXT),
 *   source_name (TEXT), condition_name (TEXT)
 *
 * Idempotency: IoTDB overwrites on duplicate (series, timestamp) — Flink replays are safe.
 */
public final class AlarmIoTSerializationSchema implements IoTSerializationSchema<IoTDBAlarmRow> {

    private static final long serialVersionUID = 1L;

    /** Shared with {@link FailLoudIoTDBSink} — one measurement schema, one place. */
    static final List<String> MEASUREMENTS = Arrays.asList(
            "severity", "state", "ack_status", "condition_active",
            "priority", "source_name", "condition_name");

    static final List<TSDataType> TYPES = Arrays.asList(
            TSDataType.INT32,   // severity
            TSDataType.TEXT,    // state
            TSDataType.BOOLEAN, // ack_status
            TSDataType.BOOLEAN, // condition_active
            TSDataType.TEXT,    // priority
            TSDataType.TEXT,    // source_name
            TSDataType.TEXT);   // condition_name

    @Override
    public Event serialize(IoTDBAlarmRow row) {
        List<Object> values = Arrays.asList(
                row.severity,
                row.state,
                row.ackStatus,
                row.conditionActive,
                row.priority,
                row.sourceName,
                row.conditionName);

        return new Event(row.devicePath, row.timestampMs, MEASUREMENTS, TYPES, values);
    }
}
