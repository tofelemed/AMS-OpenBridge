package com.ams.flink.cplm.config;

import org.apache.flink.streaming.api.functions.source.SourceFunction;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** The announce source emits its record once and then stays alive until the job cancels it - never end-of-input. */
public class AnnounceOnceSourceTest {
    @Test(timeout = 15_000)
    public void emitsTheRecordOnceAndStaysAliveUntilCancelled() throws Exception {
        String record = "{\"record_kind\":\"CAPABILITY\",\"job_name\":\"t\"}";
        AnnounceOnceSource src = new AnnounceOnceSource(record);
        List<String> out = Collections.synchronizedList(new ArrayList<>());
        Object lock = new Object();
        SourceFunction.SourceContext<String> ctx = new SourceFunction.SourceContext<String>() {
            @Override public void collect(String e) { assertTrue("collect holds the checkpoint lock", Thread.holdsLock(lock)); out.add(e); }
            @Override public void collectWithTimestamp(String e, long ts) { out.add(e); }
            @Override public void emitWatermark(Watermark mark) { }
            @Override public void markAsTemporarilyIdle() { }
            @Override public Object getCheckpointLock() { return lock; }
            @Override public void close() { }
        };
        Thread t = new Thread(() -> {
            try { src.run(ctx); } catch (Exception e) { throw new RuntimeException(e); }
        });
        t.start();
        long deadline = System.currentTimeMillis() + 5_000;
        while (out.isEmpty() && System.currentTimeMillis() < deadline) Thread.sleep(10);
        assertEquals(Collections.singletonList(record), out);
        t.join(1_500);
        assertTrue("the source stays alive after emitting - an unbounded task never reaches endInput", t.isAlive());
        src.cancel();
        t.join(5_000);
        assertFalse("the source returns once cancelled", t.isAlive());
        assertEquals("still exactly one record", 1, out.size());
    }
}
