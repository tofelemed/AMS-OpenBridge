package com.ams.flink.cplm;

import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.source.SourceFunction;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.util.CloseableIterator;
import org.apache.flink.util.Collector;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import org.junit.Before;
import org.junit.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-061b: the Short buffer has a hard per-loop cap. With a watermark that never advances (a backlog, a stalled
 * partition) nothing is ever evicted by event time, so before the cap the buffer grew without limit. The cap evicts
 * whole oldest minutes; the running count must stay at or below it and agree with the buffer's real size. A normal
 * feed (advancing watermark, real-length windows) never reaches the cap, and the count stays exact across the
 * event-time (timer) evictions as well.
 */
public class ShortBufferCapTest {

    private static final long T0 = 1_735_689_600_000L;
    static final AtomicLong MAX_COUNT = new AtomicLong();
    static final AtomicLong MAX_TRUE_SIZE = new AtomicLong();
    static final AtomicLong CAPPED = new AtomicLong();
    static final AtomicLong MISMATCHES = new AtomicLong();
    static final AtomicLong CHECKS = new AtomicLong();

    /**
     * The operator under test. Before each sample it checks the count against the real size (the state as the
     * previous append and any timer evictions since left it); after it, the same plus the maxima and the counter.
     */
    static final class Probe extends ShortFeatureBufferFn {
        Probe(EvidencePolicy policy, int maxSamplesPerLoop) {
            super(policy, maxSamplesPerLoop);
        }

        @Override
        public void processElement(CplmNormalizedSample s, Context ctx, Collector<CplmShortFeatureResult> out) throws Exception {
            check();
            super.processElement(s, ctx, out);
            long size = check();
            MAX_COUNT.accumulateAndGet(bufferedCount(), Math::max);
            MAX_TRUE_SIZE.accumulateAndGet(size, Math::max);
            CAPPED.set(cappedCount());
        }

        private long check() throws Exception {
            long size = bufferedSizeSlow();
            CHECKS.incrementAndGet();
            if (bufferedCount() != size) MISMATCHES.incrementAndGet();
            return size;
        }
    }

    /**
     * {@code n} samples per loop every 5 s, declaring {@code gridSeconds}. With {@code advancing} the watermark
     * follows 20 s behind (as the job's ingest does); otherwise there is none until the end of input.
     */
    static final class Feed implements SourceFunction<CplmNormalizedSample> {
        private final int loops;
        private final int n;
        private final int gridSeconds;
        private final boolean advancing;

        Feed(int loops, int n, int gridSeconds, boolean advancing) {
            this.loops = loops;
            this.n = n;
            this.gridSeconds = gridSeconds;
            this.advancing = advancing;
        }

        @Override
        public void run(SourceContext<CplmNormalizedSample> ctx) {
            CplmLoopDynamicsProfile a = profile("PROFILE-A");
            CplmLoopDynamicsProfile b = profile("PROFILE-B");
            for (int i = 0; i < n; i++) {
                long ts = T0 + i * 5_000L;
                for (int l = 0; l < loops; l++) {
                    CplmNormalizedSample s = new CplmNormalizedSample();
                    s.loopId = "L" + l;
                    s.site = "hdpe";
                    s.gridSeconds = gridSeconds;
                    s.eventTsMs = ts;
                    s.ingestTsMs = ts + 300;
                    s.sp = 50;
                    s.pv = 50 + Math.sin(i / 7.0 + l) * 4;
                    s.op = 40 + Math.sin(i / 7.0 + l + 0.6) * 3;
                    s.mode = "AUTO";
                    s.quality = "GOOD";
                    // the profile changes after the first third: the cap must evict profile A with its minutes
                    s.resolvedProfile = (i < n / 3 ? a : b).copy();
                    ctx.collectWithTimestamp(s, ts);
                }
                if (advancing && i % 12 == 11) ctx.emitWatermark(new Watermark(ts - 20_000));
            }
        }

        @Override
        public void cancel() {
        }
    }

    private static CplmLoopDynamicsProfile profile(String id) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("L1", null, null);
        p.gateProfileId = id;
        return p;
    }

    @Before
    public void reset() {
        MAX_COUNT.set(0);
        MAX_TRUE_SIZE.set(0);
        CAPPED.set(0);
        MISMATCHES.set(0);
        CHECKS.set(0);
    }

    /** Runs the feed through the probe (derived cap); returns the number of window results. */
    private static long run(Feed feed) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        env.setStateBackend(new HashMapStateBackend());
        long results = 0;
        try (CloseableIterator<CplmShortFeatureResult> it = env.addSource(feed).keyBy(x -> x.loopId)
                .process(new Probe(new EvidencePolicy(EvidencePolicy.Mode.NONE), 0)).executeAndCollect()) {
            while (it.hasNext()) {
                it.next();
                results++;
            }
        }
        return results;
    }

    @Test
    public void derivedCapIsTwiceTheRetainedMinutesOnTheDeclaredGridWithAFloor() {
        assertEquals(1_584, ShortFeatureBufferFn.capFor(5, 0));
        assertEquals(1_584, ShortFeatureBufferFn.capFor(0, 0));      // no declared grid: the 5 s fallback
        assertEquals(1_584, ShortFeatureBufferFn.capFor(-3, 0));
        assertEquals(7_920, ShortFeatureBufferFn.capFor(1, 0));
        assertEquals(1_584, ShortFeatureBufferFn.capFor(7, 0));      // 2 x ceil(3960 / 7) = 1,132: the floor
        assertEquals(1_584, ShortFeatureBufferFn.capFor(3_600, 0));  // 2 x ceil(3960 / 3600) = 4: the floor
        assertEquals(250, ShortFeatureBufferFn.capFor(5, 250));      // the job argument wins, no floor
        assertEquals(4, ShortFeatureBufferFn.capFor(3_600, 4));
    }

    @Test
    public void aStalledWatermarkNeverGrowsTheBufferPastTheCap() throws Exception {
        int cap = ShortFeatureBufferFn.capFor(5, 0);
        long results = run(new Feed(1, 3 * cap, 5, false));
        assertTrue("the buffer stays at or below the cap: " + MAX_TRUE_SIZE.get(), MAX_TRUE_SIZE.get() <= cap);
        assertTrue("the running count stays at or below the cap: " + MAX_COUNT.get(), MAX_COUNT.get() <= cap);
        assertTrue("the cap was reached: " + MAX_TRUE_SIZE.get(), MAX_TRUE_SIZE.get() > cap - 12);
        assertEquals("the running count equals the buffer's real size", 0, MISMATCHES.get());
        assertTrue("shortBufferCapped counted: " + CAPPED.get(), CAPPED.get() > 0);
        // the final MAX watermark fires what the cap kept (profiles re-attached: none was evicted early)
        assertTrue("capped windows still fire: " + results, results > 0);
    }

    /** Two hours of 5 s samples for three loops with the watermark advancing: event time alone bounds the buffer. */
    @Test
    public void aNormalFeedNeverReachesTheCapAndTheCountSurvivesTimerEvictions() throws Exception {
        int perLoop = 2 * 60 * 12;
        long results = run(new Feed(3, perLoop, 5, true));
        assertEquals("shortBufferCapped stays 0 on a normal feed", 0, CAPPED.get());
        assertTrue("windows fired: " + results, results > 3 * 100);
        // the timer chain evicted minutes: no loop ever held its whole 2 h feed (~70 min retained at most)
        assertTrue("timer evictions happened: " + MAX_TRUE_SIZE.get(), MAX_TRUE_SIZE.get() < 1_000);
        assertTrue("checks ran: " + CHECKS.get(), CHECKS.get() >= 2L * 3 * perLoop);
        assertEquals("the running count equals the real size after every timer eviction", 0, MISMATCHES.get());
    }

    /** A loop declaring a 1 h grid but reporting every 5 s: the floor keeps the derived cap at 1,584. */
    @Test
    public void aCoarseDeclaredGridDoesNotShrinkTheCapBelowTheFloor() throws Exception {
        assertTrue(ShortFeatureBufferFn.capFor(3_600, 0) >= 1_584);
        run(new Feed(2, 2 * 60 * 12, 3_600, true));
        assertEquals("no capping on a normal 5 s feed declaring a 1 h grid", 0, CAPPED.get());
        assertEquals(0, MISMATCHES.get());
    }
}
