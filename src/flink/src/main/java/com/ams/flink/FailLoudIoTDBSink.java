package com.ams.flink;

import org.apache.flink.configuration.Configuration;
import org.apache.flink.runtime.state.FunctionInitializationContext;
import org.apache.flink.runtime.state.FunctionSnapshotContext;
import org.apache.flink.streaming.api.checkpoint.CheckpointedFunction;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;
import org.apache.iotdb.session.pool.SessionPool;
import org.apache.iotdb.tsfile.file.metadata.enums.TSDataType;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * IoTDB sink that FAILS THE CHECKPOINT when writes fail (PIPE-014).
 *
 * The upstream {@code org.apache.iotdb.flink.IoTDBSink} flushes on a background
 * scheduler and swallows every error ("flush error" log, batch kept only in
 * memory) while checkpoints keep completing — so the Kafka source commits
 * offsets past records that were never persisted. During the 2026-08-13 IoTDB
 * memory-exhaustion incident that meant ~40 min of alarms survived only in a
 * heap buffer: a TaskManager restart in that window would have lost them
 * permanently.
 *
 * This sink buffers rows and flushes them synchronously in two places:
 * when the buffer reaches {@code batchSize}, and inside
 * {@link #snapshotState(FunctionSnapshotContext)}. A flush that cannot land
 * after bounded retries THROWS, which fails the checkpoint, restarts the job
 * from the last successful checkpoint, and replays the unpersisted records —
 * at-least-once end to end, with IoTDB's (series, timestamp) idempotency
 * absorbing the duplicates. An IoTDB outage therefore shows up as a visibly
 * restarting job in the Flink UI instead of silently dropped history.
 *
 * Latency note: with a low event rate the buffer drains at checkpoint cadence
 * (60 s for this job) rather than the old 5 s scheduler — an accepted trade
 * for the durability guarantee.
 */
public final class FailLoudIoTDBSink extends RichSinkFunction<IoTDBAlarmRow>
        implements CheckpointedFunction {

    private static final long serialVersionUID = 1L;
    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(FailLoudIoTDBSink.class);

    private static final int MAX_ATTEMPTS = 3;
    private static final long RETRY_BACKOFF_MS = 2_000;

    private final String host;
    private final int port;
    private final String user;
    private final String pass;
    private final int batchSize;

    private transient SessionPool pool;
    private transient List<IoTDBAlarmRow> buffer;

    public FailLoudIoTDBSink(String host, int port, String user, String pass, int batchSize) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.pass = pass;
        this.batchSize = Math.max(1, batchSize);
    }

    @Override
    public void open(Configuration parameters) {
        pool = new SessionPool(host, port, user, pass, 3);
        buffer = new ArrayList<>(batchSize);
    }

    @Override
    public void invoke(IoTDBAlarmRow row, Context context) throws Exception {
        if (row == null) {
            return;
        }
        buffer.add(row);
        if (buffer.size() >= batchSize) {
            flush();
        }
    }

    @Override
    public void snapshotState(FunctionSnapshotContext context) throws Exception {
        // The no-loss seam: everything received before this checkpoint must be IN
        // IoTDB before the checkpoint may complete (and offsets may be committed).
        flush();
    }

    @Override
    public void initializeState(FunctionInitializationContext context) {
        // No operator state: rows not yet in IoTDB are simply not covered by the
        // last checkpoint, so a restart replays them from Kafka.
    }

    @Override
    public void close() throws Exception {
        try {
            flush();
        } finally {
            if (pool != null) {
                pool.close();
            }
        }
    }

    private void flush() throws IOException {
        if (buffer == null || buffer.isEmpty()) {
            return;
        }
        List<String> devices = new ArrayList<>(buffer.size());
        List<Long> times = new ArrayList<>(buffer.size());
        List<List<String>> measurements = new ArrayList<>(buffer.size());
        List<List<TSDataType>> types = new ArrayList<>(buffer.size());
        List<List<Object>> values = new ArrayList<>(buffer.size());
        for (IoTDBAlarmRow row : buffer) {
            devices.add(row.devicePath);
            times.add(row.timestampMs);
            measurements.add(AlarmIoTSerializationSchema.MEASUREMENTS);
            types.add(AlarmIoTSerializationSchema.TYPES);
            values.add(java.util.Arrays.asList(
                    row.severity, row.state, row.ackStatus, row.conditionActive,
                    row.priority, row.sourceName, row.conditionName));
        }

        Exception last = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                pool.insertRecords(devices, times, measurements, types, values);
                buffer.clear();
                return;
            } catch (Exception e) {
                last = e;
                LOG.warn("IoTDB insert failed (attempt {}/{}, {} rows): {}",
                        attempt, MAX_ATTEMPTS, buffer.size(), e.getMessage());
                if (attempt < MAX_ATTEMPTS) {
                    try {
                        Thread.sleep(RETRY_BACKOFF_MS * attempt);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        // Fail loud: checkpoint fails, job restarts, Kafka replays the batch.
        throw new IOException(
                "IoTDB insert of " + buffer.size() + " rows failed after "
                        + MAX_ATTEMPTS + " attempts — failing the checkpoint so the "
                        + "records are replayed instead of dropped", last);
    }
}
