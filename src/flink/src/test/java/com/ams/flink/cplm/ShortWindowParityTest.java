package com.ams.flink.cplm;

import org.apache.flink.contrib.streaming.state.EmbeddedRocksDBStateBackend;
import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.source.SourceFunction;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.assigners.WindowAssigner;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.CloseableIterator;
import org.apache.flink.util.Collector;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import org.junit.Test;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-039: the single-buffer short operator must emit exactly what the v2.6.5 six-WindowOperator graph emitted.
 *
 * <p>Both graphs read one scripted stream (explicit watermarks, parallelism 1, so the run is deterministic):
 * three loops on a jittered 5 s grid, local disorder, late samples in every lateness band (inside and beyond
 * 30 s / 60 s / 90 s / 2 min / 3 min), duplicates, one loop silent for 45 minutes and a 10-minute watermark
 * jump followed by the held-back samples. Every result JSON and every evidence record (emission time masked)
 * must match as a multiset, on the heap and the RocksDB backend.
 */
public class ShortWindowParityTest {

    private static final long T0 = 1_735_689_600_000L + 3_700L; // 2025-01-01T00:00:03.700Z, off the minute grid
    private static final long MIN = 60_000L;

    /** One scripted step: a sample with its record timestamp, or a watermark. */
    static final class Step implements Serializable {
        final CplmNormalizedSample sample;
        final long ts;
        final boolean watermark;

        Step(CplmNormalizedSample sample, long ts, boolean watermark) {
            this.sample = sample;
            this.ts = ts;
            this.watermark = watermark;
        }
    }

    /** Emits the script exactly; the end of input brings Flink's final MAX watermark to both graphs. */
    static final class ScriptedSource implements SourceFunction<CplmNormalizedSample> {
        private final List<Step> steps;

        ScriptedSource(List<Step> steps) {
            this.steps = steps;
        }

        @Override
        public void run(SourceContext<CplmNormalizedSample> ctx) {
            for (Step s : steps) {
                if (s.watermark) ctx.emitWatermark(new Watermark(s.ts));
                else ctx.collectWithTimestamp(s.sample, s.ts);
            }
        }

        @Override
        public void cancel() {
        }
    }

    /** The v2.6.5 window function, unchanged except that the maths now sits in ShortFeatureEmitter. */
    static final class LegacyWindowFn extends ProcessWindowFunction<CplmNormalizedSample, CplmShortFeatureResult, String, TimeWindow> {
        private final String kind;
        private final EvidencePolicy policy;

        LegacyWindowFn(String kind, EvidencePolicy policy) {
            this.kind = kind;
            this.policy = policy;
        }

        @Override
        public void process(String loopId, Context ctx, Iterable<CplmNormalizedSample> elements, Collector<CplmShortFeatureResult> out) {
            ShortFeatureEmitter.emit(ctx.window().getStart(), ctx.window().getEnd(), kind, policy, elements, out,
                    record -> ctx.output(ShortFeatureEmitter.EVIDENCE, record));
        }
    }

    private static CplmNormalizedSample sample(String loop, long ts, Random rnd) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = loop;
        s.site = "hdpe";
        s.eventTsMs = ts;
        s.ingestTsMs = ts + 300;
        double phase = 2 * Math.PI * (ts % 90_000L) / 90_000.0;
        s.sp = 50.0;
        s.pv = 50.0 + 5 * Math.sin(phase) + rnd.nextGaussian() * 0.3;
        s.op = 40.0 + 3 * Math.sin(phase + 0.7) + rnd.nextGaussian() * 0.2;
        s.mode = "AUTO";
        s.quality = rnd.nextInt(40) == 0 ? "UNCERTAIN" : "GOOD";
        return s;
    }

    /** The scripted stream (fixed seed). */
    static List<Step> script() {
        Random rnd = new Random(20261005L);
        String[] loops = {"L1", "L2", "L3"};
        List<long[]> raw = new ArrayList<>();          // {ts, loop index}
        for (int i = 0; i < 150 * 12; i++) {
            for (int l = 0; l < loops.length; l++) {
                long ts = T0 + i * 5_000L + rnd.nextInt(2_001) - 1_000;
                if (l == 1 && ts >= T0 + 40 * MIN && ts < T0 + 85 * MIN) continue; // L2 silent 45 min
                raw.add(new long[]{ts, l});
            }
        }
        raw.sort((a, b) -> Long.compare(a[0], b[0]));
        for (int i = 0; i + 6 <= raw.size(); i += 6) {     // local disorder within blocks of six
            for (int j = 5; j > 0; j--) {
                int k = rnd.nextInt(j + 1);
                long[] t = raw.get(i + j);
                raw.set(i + j, raw.get(i + k));
                raw.set(i + k, t);
            }
        }

        long[] lateBands = {5_000, 25_000, 40_000, 70_000, 100_000, 130_000, 170_000, 200_000, 400_000};
        List<Step> steps = new ArrayList<>();
        List<long[]> heldBack = new ArrayList<>();
        long maxTs = Long.MIN_VALUE;
        long wm = Long.MIN_VALUE;
        boolean jumped = false;
        CplmNormalizedSample last = null;
        long lastTs = 0;
        int n = 0;
        for (long[] r : raw) {
            long ts = r[0];
            if (ts >= T0 + 100 * MIN && ts < T0 + 110 * MIN) {   // the feed stalls for 10 minutes
                heldBack.add(r);
                continue;
            }
            if (!jumped && ts >= T0 + 110 * MIN) {                // ... the watermark jumps, then the stall drains late
                jumped = true;
                wm = T0 + 110 * MIN - 20_000;
                steps.add(new Step(null, wm, true));
                for (long[] h : heldBack) steps.add(new Step(sample(loops[(int) h[1]], h[0], rnd), h[0], false));
            }
            last = sample(loops[(int) r[1]], ts, rnd);
            lastTs = ts;
            steps.add(new Step(last, ts, false));
            maxTs = Math.max(maxTs, ts);
            n++;
            if (n % 80 == 0) steps.add(new Step(last, lastTs, false));  // an exact duplicate
            if (n % 12 == 0 && maxTs - 20_000 > wm) {
                wm = maxTs - 20_000;
                steps.add(new Step(null, wm, true));
                if (n % 48 == 0) {                                     // a late sample, rotating through the bands
                    long lateTs = wm - lateBands[(n / 48) % lateBands.length];
                    steps.add(new Step(sample(loops[rnd.nextInt(3)], lateTs, rnd), lateTs, false));
                }
            }
        }
        return steps;
    }

    private static List<String> run(boolean rocksDb, boolean legacy) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        env.setStateBackend(rocksDb ? new EmbeddedRocksDBStateBackend() : new HashMapStateBackend());
        EvidencePolicy policy = new EvidencePolicy(EvidencePolicy.Mode.ALL);
        DataStream<CplmNormalizedSample> src = env.addSource(new ScriptedSource(script())).name("script");

        List<SingleOutputStreamOperator<CplmShortFeatureResult>> outs = new ArrayList<>();
        if (legacy) {
            for (ShortWindowSpecs.Spec s : ShortWindowSpecs.ALL) {
                outs.add(src.keyBy(x -> x.loopId)
                        .window(s.sizeMs == s.slideMs
                                ? TumblingEventTimeWindows.of(Time.milliseconds(s.sizeMs))   // v2.6.5's 1m branch
                                : SlidingEventTimeWindows.of(Time.milliseconds(s.sizeMs), Time.milliseconds(s.slideMs)))
                        .allowedLateness(Time.milliseconds(s.latenessMs))
                        .process(new LegacyWindowFn(s.kind, policy)));
            }
        } else {
            outs.add(src.keyBy(x -> x.loopId).process(new ShortFeatureBufferFn(policy)));
        }
        DataStream<String> all = null;
        for (SingleOutputStreamOperator<CplmShortFeatureResult> o : outs) {
            DataStream<String> r = o.map(x -> "R|" + x.toJson());
            DataStream<String> e = o.getSideOutput(ShortFeatureEmitter.EVIDENCE).map(x -> "E|" + x);
            all = all == null ? r.union(e) : all.union(r, e);
        }
        List<String> collected = new ArrayList<>();
        try (CloseableIterator<String> it = all.executeAndCollect()) {
            it.forEachRemaining(collected::add);
        }
        return collected;
    }

    /** Masks the evidence emission time (wall clock) so two runs compare. */
    private static List<String> normalised(List<String> lines, long since) {
        Pattern p = Pattern.compile("\\b\\d{13}\\b");
        List<String> out = new ArrayList<>();
        for (String l : lines) {
            Matcher m = p.matcher(l);
            StringBuilder sb = new StringBuilder();
            while (m.find()) m.appendReplacement(sb, Long.parseLong(m.group()) >= since ? "NOW" : m.group());
            m.appendTail(sb);
            out.add(sb.toString());
        }
        out.sort(String::compareTo);
        return out;
    }

    private static Map<String, Integer> counts(Collection<String> lines) {
        Map<String, Integer> c = new HashMap<>();
        for (String l : lines) c.merge(l, 1, Integer::sum);
        return c;
    }

    private static void assertParity(boolean rocksDb) throws Exception {
        long since = System.currentTimeMillis();
        List<String> legacy = normalised(run(rocksDb, true), since);
        List<String> buffered = normalised(run(rocksDb, false), since);

        long results = legacy.stream().filter(l -> l.startsWith("R|")).count();
        long evidence = legacy.stream().filter(l -> l.startsWith("E|")).count();
        assertTrue("the script must fire windows: " + results, results > 1_000);
        assertTrue("evidence must be exercised: " + evidence, evidence > 0);
        for (ShortWindowSpecs.Spec s : ShortWindowSpecs.ALL) {
            assertTrue("kind " + s.kind + " fired", legacy.stream().anyMatch(l -> l.contains("\"window_kind\":\"" + s.kind + "\"")));
        }
        Pattern key = Pattern.compile("\"loop_id\":\"([^\"]+)\".*?\"window_kind\":\"([^\"]+)\".*?\"windowStartMs\":(\\d+)");
        Map<String, Integer> firings = new HashMap<>();
        for (String l : legacy) {
            if (!l.startsWith("R|")) continue;
            Matcher m = key.matcher(l);
            assertTrue("result carries its window identity: " + l, m.find());
            firings.merge(m.group(1) + "|" + m.group(2) + "|" + m.group(3), 1, Integer::sum);
        }
        assertTrue("late re-firing must be exercised", firings.values().stream().anyMatch(v -> v > 1));

        assertEquals("same number of records", legacy.size(), buffered.size());
        Map<String, Integer> a = counts(legacy);
        Map<String, Integer> b = counts(buffered);
        for (Map.Entry<String, Integer> e : a.entrySet()) {
            assertEquals("record count differs: " + e.getKey(), e.getValue(), b.getOrDefault(e.getKey(), 0));
        }
        assertEquals(legacy, buffered);
    }

    @Test
    public void bufferedOperatorMatchesTheSixWindowGraphOnTheHeapBackend() throws Exception {
        assertParity(false);
    }

    @Test
    public void bufferedOperatorMatchesTheSixWindowGraphOnRocksDb() throws Exception {
        assertParity(true);
    }

    @Test
    public void windowArithmeticMatchesFlinksAssigners() {
        Random rnd = new Random(7);
        for (ShortWindowSpecs.Spec s : ShortWindowSpecs.ALL) {
            SlidingEventTimeWindows flink = SlidingEventTimeWindows.of(Time.milliseconds(s.sizeMs), Time.milliseconds(s.slideMs));
            for (int i = 0; i < 2_000; i++) {
                long ts = T0 + (long) (rnd.nextDouble() * 86_400_000L);
                Collection<TimeWindow> expected = flink.assignWindows(null, ts, (WindowAssigner.WindowAssignerContext) null);
                List<TimeWindow> ours = new ArrayList<>();
                for (long start = s.lastStart(ts); start > ts - s.sizeMs; start -= s.slideMs) {
                    ours.add(new TimeWindow(start, start + s.sizeMs));
                    assertTrue(s.endsAt(start + s.sizeMs));
                }
                assertEquals(s.kind + " @" + ts, new ArrayList<>(expected), ours);
                for (TimeWindow w : ours) assertTrue(ShortWindowSpecs.retainUntil(ts) >= s.cleanupTime(w.getEnd()));
            }
        }
    }
}
