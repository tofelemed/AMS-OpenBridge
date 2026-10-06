package com.ams.flink.cplm;

import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.source.SourceFunction;
import org.apache.flink.util.CloseableIterator;
import org.apache.flink.util.Collector;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import org.junit.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-061b: the Short buffer has a hard per-loop cap. With a watermark that never advances (a backlog, a stalled
 * partition) nothing is ever evicted by event time, so before the cap the buffer grew without limit. The cap evicts
 * whole oldest minutes; the running count must stay at or below it and agree with the buffer's real size.
 */
public class ShortBufferCapTest {

    private static final long T0 = 1_735_689_600_000L;
    static final AtomicLong MAX_COUNT = new AtomicLong();
    static final AtomicLong MAX_TRUE_SIZE = new AtomicLong();
    static final AtomicLong CAPPED = new AtomicLong();
    static final AtomicLong MISMATCHES = new AtomicLong();

    /** The operator under test, reporting its running count, real size and capped counter after every sample. */
    static final class Probe extends ShortFeatureBufferFn {
        Probe(EvidencePolicy policy, int maxSamplesPerLoop) {
            super(policy, maxSamplesPerLoop);
        }

        @Override
        public void processElement(CplmNormalizedSample s, Context ctx, Collector<CplmShortFeatureResult> out) throws Exception {
            super.processElement(s, ctx, out);
            long count = bufferedCount();
            long size = bufferedSizeSlow();
            MAX_COUNT.accumulateAndGet(count, Math::max);
            MAX_TRUE_SIZE.accumulateAndGet(size, Math::max);
            if (count != size) MISMATCHES.incrementAndGet();
            CAPPED.set(cappedCount());
        }
    }

    /** {@code n} samples of one loop on a declared 5 s grid; no watermark at all until the end of input. */
    static final class StalledSource implements SourceFunction<CplmNormalizedSample> {
        private final int n;

        StalledSource(int n) {
            this.n = n;
        }

        @Override
        public void run(SourceContext<CplmNormalizedSample> ctx) {
            CplmLoopDynamicsProfile a = profile("PROFILE-A");
            CplmLoopDynamicsProfile b = profile("PROFILE-B");
            for (int i = 0; i < n; i++) {
                CplmNormalizedSample s = new CplmNormalizedSample();
                s.loopId = "L1";
                s.site = "hdpe";
                s.gridSeconds = 5;
                s.eventTsMs = T0 + i * 5_000L;
                s.ingestTsMs = s.eventTsMs + 300;
                s.sp = 50;
                s.pv = 50 + Math.sin(i / 7.0) * 4;
                s.op = 40 + Math.sin(i / 7.0 + 0.6) * 3;
                s.mode = "AUTO";
                s.quality = "GOOD";
                // the profile changes after the first third: the cap must evict profile A with its minutes
                s.resolvedProfile = (i < n / 3 ? a : b).copy();
                ctx.collectWithTimestamp(s, s.eventTsMs);
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

    @Test
    public void derivedCapIsTwiceTheRetainedMinutesOnTheDeclaredGrid() {
        assertEquals(1_584, ShortFeatureBufferFn.capFor(5, 0));
        assertEquals(1_584, ShortFeatureBufferFn.capFor(0, 0));      // no declared grid: the 5 s fallback
        assertEquals(1_584, ShortFeatureBufferFn.capFor(-3, 0));
        assertEquals(7_920, ShortFeatureBufferFn.capFor(1, 0));
        assertEquals(1_132, ShortFeatureBufferFn.capFor(7, 0));      // 2 x ceil(3960 / 7) = 2 x 566
        assertEquals(250, ShortFeatureBufferFn.capFor(5, 250));      // the job argument wins
    }

    @Test
    public void aStalledWatermarkNeverGrowsTheBufferPastTheCap() throws Exception {
        int cap = ShortFeatureBufferFn.capFor(5, 0);
        MAX_COUNT.set(0);
        MAX_TRUE_SIZE.set(0);
        CAPPED.set(0);
        MISMATCHES.set(0);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        env.setStateBackend(new HashMapStateBackend());
        EvidencePolicy none = new EvidencePolicy(EvidencePolicy.Mode.NONE);
        long results = 0;
        try (CloseableIterator<CplmShortFeatureResult> it = env.addSource(new StalledSource(3 * cap))
                .keyBy(x -> x.loopId).process(new Probe(none, 0)).executeAndCollect()) {
            while (it.hasNext()) {
                it.next();
                results++;
            }
        }
        assertTrue("the buffer stays at or below the cap: " + MAX_TRUE_SIZE.get(), MAX_TRUE_SIZE.get() <= cap);
        assertTrue("the running count stays at or below the cap: " + MAX_COUNT.get(), MAX_COUNT.get() <= cap);
        assertTrue("the cap was reached: " + MAX_TRUE_SIZE.get(), MAX_TRUE_SIZE.get() > cap - 12);
        assertEquals("the running count equals the buffer's real size", 0, MISMATCHES.get());
        assertTrue("shortBufferCapped counted: " + CAPPED.get(), CAPPED.get() > 0);
        // the final MAX watermark fires what the cap kept (profiles re-attached: none was evicted early)
        assertTrue("capped windows still fire: " + results, results > 0);
    }
}
