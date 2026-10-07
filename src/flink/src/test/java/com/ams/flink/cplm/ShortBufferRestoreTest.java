package com.ams.flink.cplm;

import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.runtime.checkpoint.OperatorSubtaskState;
import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-061 (final review): the Short buffer survives a heap-backend snapshot and restore. Two profiles and enough
 * samples to hit the cap go in, the operator is snapshotted and restored into a fresh harness, and feeding
 * continues; the output must be identical to an uninterrupted run, and the restored running count must equal the
 * buffer's real size. Exact duplicates are dropped and counted on {@code shortDuplicatesDropped}.
 */
public class ShortBufferRestoreTest {

    private static final long T0 = 1_735_689_600_000L;
    private static final int CAP = 120;                // explicit cap: reached within the first phase
    private static final int PHASE1 = 200;             // samples per loop before the snapshot (stalled watermark)
    private static final int TOTAL = 420;              // samples per loop in all
    private static final String[] LOOPS = {"L1", "L2"};

    private static CplmLoopDynamicsProfile profile(String id) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("L1", null, null);
        p.gateProfileId = id;
        return p;
    }

    private static final CplmLoopDynamicsProfile A = profile("PROFILE-A");
    private static final CplmLoopDynamicsProfile B = profile("PROFILE-B");

    /** A fresh sample (the heap backend keeps references, so every run builds its own). */
    private static CplmNormalizedSample sample(String loop, int i) {
        long ts = T0 + i * 5_000L;
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = loop;
        s.site = "hdpe";
        s.gridSeconds = 5;
        s.eventTsMs = ts;
        s.ingestTsMs = ts + 300;
        s.sp = 50;
        s.pv = 50 + Math.sin(i / 7.0 + loop.hashCode()) * 4;
        s.op = 40 + Math.sin(i / 7.0 + 0.6) * 3;
        s.mode = "AUTO";
        s.quality = "GOOD";
        s.resolvedProfile = (i < 150 || (i >= 260 && i < 300) ? A : B).copy();   // two profiles, both before the cap
        return s;
    }

    private static KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult>
            harness(ShortFeatureBufferFn fn) throws Exception {
        KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h =
                new KeyedOneInputStreamOperatorTestHarness<>(new KeyedProcessOperator<>(fn), x -> x.loopId, Types.STRING);
        h.setStateBackend(new HashMapStateBackend());
        return h;
    }

    /** Feeds samples {@code [from, to)} of every loop; the watermark advances only past {@code PHASE1}. */
    private static void feed(KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h,
                             int from, int to) throws Exception {
        for (int i = from; i < to; i++) {
            for (String loop : LOOPS) {
                CplmNormalizedSample s = sample(loop, i);
                h.processElement(new StreamRecord<>(s, s.eventTsMs));
                if (i % 50 == 7) h.processElement(new StreamRecord<>(sample(loop, i), s.eventTsMs));  // exact duplicate
            }
            if (i >= PHASE1 && i % 12 == 11) h.processWatermark(new Watermark(T0 + i * 5_000L - 20_000));
        }
    }

    /** Everything emitted so far, results and evidence, with the wall-clock emission time masked. */
    private static List<String> drain(KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h,
                                      long since) {
        List<String> out = new ArrayList<>();
        for (CplmShortFeatureResult r : h.extractOutputValues()) out.add("R|" + r.toJson());
        if (h.getSideOutput(ShortFeatureEmitter.EVIDENCE) != null) {
            for (StreamRecord<String> e : h.getSideOutput(ShortFeatureEmitter.EVIDENCE)) out.add("E|" + e.getValue());
        }
        Pattern p = Pattern.compile("\\b\\d{13}\\b");
        List<String> masked = new ArrayList<>();
        for (String l : out) {
            Matcher m = p.matcher(l);
            StringBuilder sb = new StringBuilder();
            while (m.find()) m.appendReplacement(sb, Long.parseLong(m.group()) >= since ? "NOW" : m.group());
            m.appendTail(sb);
            masked.add(sb.toString());
        }
        return masked;
    }

    private static int[] counts(KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h,
                                ShortFeatureBufferFn fn, String loop) throws Exception {
        h.getOperator().setCurrentKey(loop);
        return new int[]{fn.bufferedCount(), fn.bufferedSizeSlow()};
    }

    @Test
    public void aRestoredBufferContinuesExactlyAsAnUninterruptedOne() throws Exception {
        long since = System.currentTimeMillis();
        EvidencePolicy policy = new EvidencePolicy(EvidencePolicy.Mode.ALL);

        ShortFeatureBufferFn straightFn = new ShortFeatureBufferFn(policy, CAP);
        List<String> straight;
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h = harness(straightFn)) {
            h.open();
            feed(h, 0, TOTAL);
            h.processWatermark(new Watermark(Long.MAX_VALUE));
            straight = drain(h, since);
            assertTrue("the cap was hit", straightFn.cappedCount() > 0);
        }

        ShortFeatureBufferFn firstFn = new ShortFeatureBufferFn(policy, CAP);
        List<String> resumed = new ArrayList<>();
        OperatorSubtaskState snapshot;
        int[][] before = new int[LOOPS.length][];
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h = harness(firstFn)) {
            h.open();
            feed(h, 0, PHASE1);
            assertTrue("the cap was hit before the snapshot", firstFn.cappedCount() > 0);
            for (int l = 0; l < LOOPS.length; l++) before[l] = counts(h, firstFn, LOOPS[l]);
            snapshot = h.snapshot(1L, T0 + PHASE1 * 5_000L);
            resumed.addAll(drain(h, since));
        }

        ShortFeatureBufferFn restoredFn = new ShortFeatureBufferFn(policy, CAP);
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h = harness(restoredFn)) {
            h.setup();
            h.initializeState(snapshot);
            h.open();
            for (int l = 0; l < LOOPS.length; l++) {
                int[] after = counts(h, restoredFn, LOOPS[l]);
                assertEquals("restored count == real size (" + LOOPS[l] + ")", after[1], after[0]);
                assertEquals("restored size == size at the snapshot (" + LOOPS[l] + ")", before[l][1], after[1]);
                assertTrue("the buffer was at the cap when snapshotted: " + after[1], after[1] > CAP - 12 && after[1] <= CAP);
            }
            feed(h, PHASE1, TOTAL);
            h.processWatermark(new Watermark(Long.MAX_VALUE));
            resumed.addAll(drain(h, since));
        }

        long results = straight.stream().filter(l -> l.startsWith("R|")).count();
        assertTrue("windows fired: " + results, results > 50);
        for (String id : new String[]{"PROFILE-A", "PROFILE-B"}) {
            assertTrue("profile " + id + " governs some windows", straight.stream().anyMatch(l -> l.contains("\"gate_profile_id\":\"" + id + "\"")));
        }
        assertEquals("a restored run emits exactly what an uninterrupted one does", straight, resumed);
    }

    @Test
    public void exactDuplicatesAreDroppedAndCounted() throws Exception {
        ShortFeatureBufferFn fn = new ShortFeatureBufferFn(new EvidencePolicy(EvidencePolicy.Mode.NONE), 0);
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmShortFeatureResult> h = harness(fn)) {
            h.open();
            feed(h, 0, 100);                          // duplicates at i = 7 and 57, for each of the two loops
            assertEquals("shortDuplicatesDropped counts every dropped duplicate", 4, fn.duplicatesDroppedCount());
            for (String loop : LOOPS) {
                int[] c = counts(h, fn, loop);
                assertEquals("duplicates are not buffered (" + loop + ")", 100, c[1]);
                assertEquals(c[1], c[0]);
            }
        }
    }
}
