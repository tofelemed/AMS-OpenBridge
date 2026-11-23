package com.ams.flink.cplm;

import com.ams.flink.cplm.evidence.EvidencePolicy;
import org.apache.flink.api.common.state.ListState;
import org.apache.flink.api.common.state.ListStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.runtime.checkpoint.OperatorSubtaskState;
import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.apache.flink.util.Collector;
import org.junit.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-226: the Long job keeps, per loop, from when its rolling buffer covers, and marks every window that opens
 * before that ({@code warming_up}) - the refill after a fresh submit - with {@code coverage_from_ms}. G0 stays as
 * computed. The coverage start survives a snapshot/restore and is rebuilt from the buffer when a restored state
 * (from a jar without it) does not carry it.
 */
public class LongWarmupCoverageTest {
    private static final long MIN = 60_000L;
    private static final long HOUR = 60 * MIN;
    private static final long GRID_MS = 120_000L;                                   // 2-min grid keeps 25 h cheap
    private static final long T0 = Instant.parse("2026-11-13T12:18:20Z").toEpochMilli();   // mid-window, off the 15-min grid
    private static final ObjectMapper M = new ObjectMapper();

    private static CplmNormalizedSample sample(long ts) {
        int i = (int) ((ts - T0) / GRID_MS);
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = "L1";
        s.site = "hdpe";
        s.gridSeconds = (int) (GRID_MS / 1000);
        s.eventTsMs = ts;
        s.ingestTsMs = ts + 300;
        s.sp = 50;
        s.pv = 50 + Math.sin(i * 2 * Math.PI / 15.0) * 4;
        s.op = 40 + Math.sin(i * 2 * Math.PI / 15.0 + 0.8) * 3;
        s.mode = "AUTO";
        s.quality = "GOOD";
        return s;
    }

    private static KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> harness(
            KeyedProcessFunction<String, CplmNormalizedSample, CplmLongDiagnosticsResult> fn) throws Exception {
        KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h =
                new KeyedOneInputStreamOperatorTestHarness<>(new KeyedProcessOperator<>(fn), x -> x.loopId, Types.STRING);
        h.setStateBackend(new HashMapStateBackend());
        return h;
    }

    private static CplmLongDiagnosticsStreamJob.LongDiagnosticsProcessFunction longFn() {
        return new CplmLongDiagnosticsStreamJob.LongDiagnosticsProcessFunction(new EvidencePolicy(EvidencePolicy.Mode.NONE));
    }

    /** Samples on the grid over {@code [from, to)}; the watermark follows each sample unless {@code holdWatermark}. */
    private static void feed(KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, ?> h,
                             long from, long to, boolean holdWatermark) throws Exception {
        for (long ts = from; ts < to; ts += GRID_MS) {
            h.processElement(new StreamRecord<>(sample(ts), ts));
            if (!holdWatermark) h.processWatermark(new Watermark(ts - 1));
        }
    }

    /** A fresh Long job fed {@code [from, to)}: every result it emitted. */
    private static List<CplmLongDiagnosticsResult> run(long from, long to) throws Exception {
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h = harness(longFn())) {
            h.open();
            feed(h, from, to, false);
            return new ArrayList<>(h.extractOutputValues());
        }
    }

    private static CplmLongDiagnosticsResult last(List<CplmLongDiagnosticsResult> out, String kind) {
        CplmLongDiagnosticsResult last = null;
        for (CplmLongDiagnosticsResult r : out) if (kind.equals(r.windowKind)) last = r;
        assertTrue("a " + kind + " result was emitted", last != null);
        return last;
    }

    private static void assertCoverage(List<CplmLongDiagnosticsResult> out, long coverage, boolean allWarming) {
        assertFalse("results were emitted", out.isEmpty());
        for (CplmLongDiagnosticsResult r : out) {
            assertEquals(r.windowKind + " ending " + r.windowEndMs, coverage, r.coverageFromMs.longValue());
            assertEquals(r.windowKind + " ending " + r.windowEndMs, r.windowStartMs < coverage, r.warmingUp);
            if (allWarming) assertTrue(r.windowKind + " ending " + r.windowEndMs + " is a refill window", r.warmingUp);
        }
    }

    @Test
    public void aBufferStartingMidWindowIsWarmingUpFromTheFirstSample() throws Exception {
        List<CplmLongDiagnosticsResult> out = run(T0, T0 + 3 * HOUR);
        assertCoverage(out, T0, true);
        for (String kind : Arrays.asList("4h", "12h", "24h")) {
            JsonNode n = M.readTree(last(out, kind).toJson());
            assertTrue(kind + " payload says warming_up", n.path("warming_up").asBoolean(false));
            assertEquals(kind + " payload coverage_from_ms = the first sample", T0, n.path("coverage_from_ms").asLong());
        }
        // G0 stays as computed: the refill window is still INCOMPLETE
        CplmShortFeatureResult g0 = last(out, "12h").alignedShort;
        assertEquals("FAIL", g0.gate0Status);
        assertEquals("INCOMPLETE", g0.gate0Reason);
        assertFalse(g0.sufficientData);
    }

    @Test
    public void aFullBufferIsNotWarmingUp() throws Exception {
        List<CplmLongDiagnosticsResult> out = run(T0, T0 + 25 * HOUR + 20 * MIN);
        assertCoverage(out, T0, false);
        for (String kind : Arrays.asList("12h", "24h")) {
            boolean sawRefill = false, sawFull = false;
            for (CplmLongDiagnosticsResult r : out) {
                if (!kind.equals(r.windowKind)) continue;
                sawRefill |= r.warmingUp;
                sawFull |= !r.warmingUp;
            }
            assertTrue(kind + " had refill windows first", sawRefill);
            assertTrue(kind + " has full windows once the buffer covers them", sawFull);
            CplmLongDiagnosticsResult r = last(out, kind);
            assertFalse(kind + " with a full buffer", r.warmingUp);
            JsonNode n = M.readTree(r.toJson());
            assertTrue(n.has("warming_up"));
            assertFalse(n.path("warming_up").asBoolean(true));
            assertEquals(T0, n.path("coverage_from_ms").asLong());
            assertNotEquals("a full window passes G0", "FAIL", r.alignedShort.gate0Status);
        }
    }

    @Test
    public void aRestoreKeepsTheCoverageStart() throws Exception {
        OperatorSubtaskState snapshot;
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h = harness(longFn())) {
            h.open();
            feed(h, T0, T0 + 2 * HOUR, false);
            snapshot = h.snapshot(1L, T0 + 2 * HOUR);
        }
        List<CplmLongDiagnosticsResult> restored;
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h = harness(longFn())) {
            h.setup();
            h.initializeState(snapshot);
            h.open();
            feed(h, T0 + 2 * HOUR, T0 + 4 * HOUR, false);
            restored = new ArrayList<>(h.extractOutputValues());
        }
        assertCoverage(restored, T0, true);
        // without the state the same feed would start the coverage at its own first sample
        assertCoverage(run(T0 + 2 * HOUR, T0 + 4 * HOUR), T0 + 2 * HOUR, true);
    }

    /** The Long job's buffer, cadence and timers as a jar from before CHG-226 kept them: no coverage state. */
    static final class PreChg226LongFn extends KeyedProcessFunction<String, CplmNormalizedSample, CplmLongDiagnosticsResult> {
        private transient ListState<CplmNormalizedSample> rollingBuffer;
        private transient ValueState<Long> nextTimerTs;

        @Override
        public void open(Configuration parameters) {
            rollingBuffer = getRuntimeContext().getListState(
                    new ListStateDescriptor<>("cplm-rolling-buffer", TypeInformation.of(CplmNormalizedSample.class)));
            nextTimerTs = getRuntimeContext().getState(new ValueStateDescriptor<>("next-timer-ts", Long.class));
        }

        @Override
        public void processElement(CplmNormalizedSample s, Context ctx, Collector<CplmLongDiagnosticsResult> out) throws Exception {
            rollingBuffer.add(s);
            long next = ((s.eventTsMs / (15 * MIN)) + 1) * 15 * MIN;
            Long current = nextTimerTs.value();
            if (current == null || next > current) {
                ctx.timerService().registerEventTimeTimer(next);
                nextTimerTs.update(next);
            }
        }
    }

    private static OperatorSubtaskState preChg226Snapshot() throws Exception {
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h = harness(new PreChg226LongFn())) {
            h.open();
            feed(h, T0, T0 + 2 * HOUR, true);                       // the watermark held: the timers wait in the state
            return h.snapshot(1L, T0 + 2 * HOUR);
        }
    }

    @Test
    public void aRestoreWithoutTheStateTakesTheOldestBufferedSample() throws Exception {
        // a restored timer fires before the loop's next sample
        List<CplmLongDiagnosticsResult> timerFirst;
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h = harness(longFn())) {
            h.setup();
            h.initializeState(preChg226Snapshot());
            h.open();
            h.processWatermark(new Watermark(T0 + 2 * HOUR));
            timerFirst = new ArrayList<>(h.extractOutputValues());
        }
        assertCoverage(timerFirst, T0, true);

        // the loop's next sample arrives first
        List<CplmLongDiagnosticsResult> sampleFirst;
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h = harness(longFn())) {
            h.setup();
            h.initializeState(preChg226Snapshot());
            h.open();
            feed(h, T0 + 2 * HOUR, T0 + 3 * HOUR, false);
            sampleFirst = new ArrayList<>(h.extractOutputValues());
        }
        assertCoverage(sampleFirst, T0, true);
    }

    @Test
    public void theCoverageStartOnlyMovesBack() {
        List<CplmNormalizedSample> buffer = Arrays.asList(sample(T0 + 10 * MIN), sample(T0), sample(T0 + 20 * MIN));
        assertEquals("fresh start: the first sample", T0 + 5 * MIN,
                LongBufferCoverage.afterSample(null, new ArrayList<>(), T0 + 5 * MIN));
        assertEquals("restore without it: the oldest buffered sample (the buffer is not in time order)", T0,
                LongBufferCoverage.afterSample(null, buffer, T0 + 30 * MIN));
        assertEquals("a newer sample never shortens it", T0, LongBufferCoverage.afterSample(T0, null, T0 + HOUR));
        assertEquals("a late older sample extends it", T0 - MIN, LongBufferCoverage.afterSample(T0, null, T0 - MIN));
        assertNull(LongBufferCoverage.oldest(new ArrayList<>()));
    }

    @Test
    public void warmingUpIsWindowStartBeforeCoverageAndTheFieldsRoundTrip() {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = "L1";
        r.windowKind = "12h";
        r.windowStartMs = T0;
        LongBufferCoverage.stamp(r, T0);
        assertFalse("a window starting exactly at the coverage start is covered", r.warmingUp);
        LongBufferCoverage.stamp(r, T0 + 1);
        assertTrue(r.warmingUp);

        CplmLongDiagnosticsResult back = CplmLongDiagnosticsResult.fromJson(r.toJson());
        assertEquals(T0 + 1, back.coverageFromMs.longValue());
        assertTrue(back.warmingUp);

        CplmLongDiagnosticsResult unknown = new CplmLongDiagnosticsResult();      // not from the Long buffer: neither field
        unknown.loopId = "L1";
        unknown.windowKind = "12h";
        LongBufferCoverage.stamp(unknown, null);
        String json = unknown.toJson();
        assertFalse(json.contains("warming_up"));
        assertFalse(json.contains("coverage_from_ms"));
        CplmLongDiagnosticsResult old = CplmLongDiagnosticsResult.fromJson(json);   // a row from an older jar
        assertNull(old.coverageFromMs);
        assertFalse(old.warmingUp);
    }
}
