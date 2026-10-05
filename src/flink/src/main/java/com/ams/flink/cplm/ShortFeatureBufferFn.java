package com.ams.flink.cplm;

import org.apache.flink.api.common.state.MapState;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.PrimitiveArrayTypeInfo;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import com.ams.flink.cplm.evidence.EvidencePolicy;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * CHG-039: all six short window kinds from ONE per-loop sample buffer.
 *
 * <p>v2.6.5 ran six {@code WindowOperator}s whose sliding windows each kept their own copy of every
 * member: one sample was stored 32 times (1 + 5 + 5 + 3 + 6 + 12), with 64 timer registrations, and every
 * firing re-read its whole window. Any pause turned into hours of backlog and multi-GB checkpoints (Marun
 * 2026-10-05: 1.46 M samples behind, 4.8 GB of checkpoints).
 *
 * <p>Layout, chosen so that a sample costs O(1) to write: each sample is stored once under its arrival
 * sequence ({@code samples}); every window of every kind starts and ends on a whole minute, so a small
 * per-minute index ({@code minuteIndex}: the sequences that arrived for that minute) turns a window into
 * a run of minutes. A firing reads only the minutes of the largest window it fires; eviction deletes whole
 * minutes. Every firing and eviction time is a minute boundary minus 1 ms, so one chained event-time timer
 * per loop - re-armed for the next minute while anything is buffered - replaces per-sample timers.
 * (Lab 2026-10-05, 161 loops at ~215 samples/s: a flat map read whole per timer fell to 16 samples/s; whole
 * minute lists re-written per sample to 153 samples/s. Hence this layout.)
 *
 * <p>The firing contract is Flink's, reproduced exactly (see {@link ShortWindowSpecs}): a window fires
 * once when the watermark reaches {@code end - 1} if it has members, and again for every member that
 * arrives within its allowed lateness; a sample late for every window it falls in is dropped. Members
 * are handed over in arrival order, as Flink's list state did. {@code ShortWindowParityTest} runs this
 * function and the old six-operator graph on the same scripted stream and requires identical output.
 */
public class ShortFeatureBufferFn extends KeyedProcessFunction<String, CplmNormalizedSample, CplmShortFeatureResult> {

    private static final long serialVersionUID = 1L;
    static final long MINUTE_MS = 60_000L;

    private final EvidencePolicy policy;
    private transient MapState<Long, BufferedSample> samples;  // arrival sequence -> sample
    private transient MapState<Long, long[]> minuteIndex;      // minute start -> sequences, arrival order
    private transient ValueState<long[]> minutes;              // buffered minute starts, ascending
    private transient ValueState<Long> nextSeq;

    public ShortFeatureBufferFn(EvidencePolicy policy) {
        this.policy = policy;
    }

    @Override
    public void open(Configuration parameters) {
        samples = getRuntimeContext().getMapState(new MapStateDescriptor<>("cplm-short-samples",
                Types.LONG, TypeInformation.of(BufferedSample.class)));
        minuteIndex = getRuntimeContext().getMapState(new MapStateDescriptor<>("cplm-short-minute-index",
                Types.LONG, PrimitiveArrayTypeInfo.LONG_PRIMITIVE_ARRAY_TYPE_INFO));
        minutes = getRuntimeContext().getState(new ValueStateDescriptor<>("cplm-short-minutes", PrimitiveArrayTypeInfo.LONG_PRIMITIVE_ARRAY_TYPE_INFO));
        nextSeq = getRuntimeContext().getState(new ValueStateDescriptor<>("cplm-short-next-seq", Types.LONG));
    }

    static long minuteOf(long ts) {
        return Math.floorDiv(ts, MINUTE_MS) * MINUTE_MS;
    }

    @Override
    public void processElement(CplmNormalizedSample sample, Context ctx, Collector<CplmShortFeatureResult> out) throws Exception {
        Long ts = ctx.timestamp();
        if (ts == null) {
            // the same refusal Flink's event-time WindowOperator makes
            throw new IllegalStateException("short sample without a record timestamp: " + sample.loopId);
        }
        long wm = ctx.timerService().currentWatermark();
        List<long[]> fireNow = new ArrayList<>(); // {spec index, window end}
        long firstOnTimeEnd = Long.MAX_VALUE;
        boolean alive = false;
        for (int i = 0; i < ShortWindowSpecs.ALL.size(); i++) {
            ShortWindowSpecs.Spec spec = ShortWindowSpecs.ALL.get(i);
            for (long start = spec.lastStart(ts); start > ts - spec.sizeMs; start -= spec.slideMs) {
                long end = start + spec.sizeMs;
                if (spec.cleanupTime(end) <= wm) continue;          // window already cleaned: not a member
                alive = true;
                if (end - 1 <= wm) fireNow.add(new long[]{i, end}); // late but allowed: fires again now
                else firstOnTimeEnd = Math.min(firstOnTimeEnd, end);
            }
        }
        if (!alive) return;                                         // late for every window: dropped

        long seq = nextSeq.value() == null ? 0L : nextSeq.value();
        nextSeq.update(seq + 1);
        samples.put(seq, new BufferedSample(seq, ts, sample));
        long m = minuteOf(ts);
        long[] idx = minuteIndex.get(m);
        if (idx == null) {
            minuteIndex.put(m, new long[]{seq});
            addMinute(m);
        } else {
            long[] grown = Arrays.copyOf(idx, idx.length + 1);
            grown[idx.length] = seq;
            minuteIndex.put(m, grown);
        }
        // the chain (onTimer) visits every later minute boundary while anything is buffered
        if (firstOnTimeEnd != Long.MAX_VALUE) ctx.timerService().registerEventTimeTimer(firstOnTimeEnd - 1);
        else ctx.timerService().registerEventTimeTimer(minuteOf(wm) + MINUTE_MS - 1); // keeps eviction going

        if (fireNow.isEmpty()) return;
        long from = Long.MAX_VALUE;
        long to = Long.MIN_VALUE;
        for (long[] f : fireNow) {
            from = Math.min(from, f[1] - ShortWindowSpecs.ALL.get((int) f[0]).sizeMs);
            to = Math.max(to, f[1]);
        }
        List<BufferedSample> range = read(from, to);
        for (long[] f : fireNow) fire(ShortWindowSpecs.ALL.get((int) f[0]), f[1], range, out, ctx);
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext ctx, Collector<CplmShortFeatureResult> out) throws Exception {
        long end = timestamp + 1;
        long from = Long.MAX_VALUE;
        for (ShortWindowSpecs.Spec spec : ShortWindowSpecs.ALL) {
            if (spec.endsAt(end)) from = Math.min(from, end - spec.sizeMs);
        }
        if (from != Long.MAX_VALUE) {
            List<BufferedSample> range = read(from, end);
            if (!range.isEmpty()) {
                for (ShortWindowSpecs.Spec spec : ShortWindowSpecs.ALL) {
                    if (spec.endsAt(end)) fire(spec, end, range, out, ctx);
                }
            }
        }
        if (evict(timestamp)) ctx.timerService().registerEventTimeTimer(minuteOf(timestamp) + 2 * MINUTE_MS - 1);
    }

    /**
     * Drops every minute no window can need after {@code t} (Flink cleans each window at its own cleanup
     * timer). Returns whether anything is still buffered.
     */
    private boolean evict(long t) throws Exception {
        long[] ms = minutes.value();
        if (ms == null || ms.length == 0) return false;
        int n = 0;
        while (n < ms.length && ShortWindowSpecs.retainUntil(ms[n] + MINUTE_MS - 1) <= t) {
            long[] idx = minuteIndex.get(ms[n]);
            if (idx != null) for (long s : idx) samples.remove(s);
            minuteIndex.remove(ms[n]);
            n++;
        }
        if (n == ms.length) {
            minutes.clear();
            nextSeq.clear();
            return false;
        }
        if (n > 0) minutes.update(Arrays.copyOfRange(ms, n, ms.length));
        return true;
    }

    private void addMinute(long m) throws Exception {
        long[] ms = minutes.value();
        if (ms == null) {
            minutes.update(new long[]{m});
            return;
        }
        int i = ms.length;
        while (i > 0 && ms[i - 1] > m) i--;                     // late minutes are rare: insert from the end
        long[] next = new long[ms.length + 1];
        System.arraycopy(ms, 0, next, 0, i);
        next[i] = m;
        System.arraycopy(ms, i, next, i + 1, ms.length - i);
        minutes.update(next);
    }

    /** The buffered samples with a record timestamp in {@code [from, to)}, in arrival order. */
    private List<BufferedSample> read(long from, long to) throws Exception {
        List<BufferedSample> all = new ArrayList<>();
        long[] ms = minutes.value();
        if (ms == null) return all;
        for (long m : ms) {
            if (m + MINUTE_MS <= from || m >= to) continue;
            long[] idx = minuteIndex.get(m);
            if (idx == null) continue;
            for (long s : idx) {
                BufferedSample b = samples.get(s);
                if (b != null) all.add(b);
            }
        }
        all.sort(Comparator.comparingLong(x -> x.seq));
        return all;
    }

    /** Fires the window of {@code spec} ending at {@code end} when it has members. */
    private void fire(ShortWindowSpecs.Spec spec, long end, List<BufferedSample> range,
                      Collector<CplmShortFeatureResult> out, Context ctx) {
        long start = end - spec.sizeMs;
        List<CplmNormalizedSample> members = new ArrayList<>();
        for (BufferedSample b : range) {
            if (b.ts >= start && b.ts < end) members.add(b.sample);
        }
        if (members.isEmpty()) return;
        ShortFeatureEmitter.emit(start, end, spec.kind, policy, members, out,
                record -> ctx.output(ShortFeatureEmitter.EVIDENCE, record));
    }

    /** One buffered sample: arrival sequence, record timestamp (window membership) and the sample. */
    public static class BufferedSample {
        public long seq;
        public long ts;
        public CplmNormalizedSample sample;

        public BufferedSample() {
        }

        BufferedSample(long seq, long ts, CplmNormalizedSample sample) {
            this.seq = seq;
            this.ts = ts;
            this.sample = sample;
        }
    }
}
