package com.ams.flink.cplm;

import org.apache.flink.api.common.JobID;
import org.apache.flink.contrib.streaming.state.EmbeddedRocksDBStateBackend;
import org.apache.flink.core.execution.JobClient;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.sink.DiscardingSink;
import org.apache.flink.streaming.api.functions.source.SourceFunction;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import org.junit.Assume;
import org.junit.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

/**
 * CHG-039 measurement, not a regression test (run with {@code -Dtest=ShortWindowBacklogBench -Dshort.bench=true}).
 * A Marun-sized backlog - 144 loops, N minutes of 5 s samples ({@code -Dshort.bench.minutes}, default 30), all queued - through the v2.6.5
 * six-window graph and through {@link ShortFeatureBufferFn}, both on RocksDB at parallelism 1. Prints how long
 * the backlog took to drain and the size of a full (non-incremental) checkpoint taken with the state at its peak.
 */
public class ShortWindowBacklogBench {

    private static final long T0 = 1_735_689_600_000L;
    private static final int LOOPS = 144;
    private static final long INTERVAL_MS = Long.getLong("short.bench.intervalMs", 5_000L);
    private static final int SAMPLES_PER_LOOP = (int) (Integer.getInteger("short.bench.minutes", 30) * 60_000L / INTERVAL_MS);
    private static final long CAP_MS = Long.getLong("short.bench.capS", 900L) * 1000L;
    /** -Dshort.bench.real=true: samples are the lab's real 1.1 tuple (five roles) with a resolved profile. */
    private static final boolean REAL = Boolean.getBoolean("short.bench.real");
    /** CHG-061b: -Dshort.bench.stalledWm=true never advances the watermark: only the per-loop cap bounds the buffer. */
    private static final boolean STALLED_WM = Boolean.getBoolean("short.bench.stalledWm");
    private static final String TEMPLATE_LOOP = "FIC10302";
    private static final String TEMPLATE_TS = "1791191779702";
    static final AtomicLong EMITTED_AT_MS = new AtomicLong();
    static final AtomicLong EMITTED = new AtomicLong();

    /** Emits the backlog as fast as the job accepts it, then idles (no MAX watermark) so a checkpoint sees the full state. */
    static final class BacklogSource implements SourceFunction<CplmNormalizedSample> {
        private volatile boolean running = true;

        @Override
        public void run(SourceContext<CplmNormalizedSample> ctx) throws Exception {
            Random rnd = new Random(1);
            String template = REAL ? new String(ShortWindowBacklogBench.class.getResourceAsStream("/cplm/real-loop-sample.json")
                    .readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).trim() : null;
            for (int i = 0; i < SAMPLES_PER_LOOP && running; i++) {
                long ts = T0 + i * INTERVAL_MS;
                synchronized (ctx.getCheckpointLock()) {
                    for (int l = 0; l < LOOPS; l++) {
                        CplmNormalizedSample s;
                        if (REAL) {
                            // the lab's real tuple (schema 1.1, five roles) as the job parses it, plus the resolved profile
                            s = CplmNormalizedSample.fromJson(template
                                    .replace("\"loop_id\":\"" + TEMPLATE_LOOP + "\"", "\"loop_id\":\"LOOP-" + l + "\"")
                                    .replace(TEMPLATE_TS, Long.toString(ts + l)));
                            s.resolvedProfile = CplmLoopDynamicsProfile.resolve(s.loopId, s.loopType, null);
                        } else {
                            s = new CplmNormalizedSample();
                            s.loopId = "LOOP-" + l;
                            s.site = "hdpe";
                            s.eventTsMs = ts + l;
                            s.ingestTsMs = ts + l + 300;
                            s.sp = 50;
                            s.pv = 50 + Math.sin(i / 7.0 + l) * 4 + rnd.nextGaussian() * 0.2;
                            s.op = 40 + Math.sin(i / 7.0 + l + 0.6) * 3;
                            s.mode = "AUTO";
                            s.quality = "GOOD";
                        }
                        ctx.collectWithTimestamp(s, s.eventTsMs);
                        EMITTED.incrementAndGet();
                    }
                    if (!STALLED_WM) ctx.emitWatermark(new Watermark(ts - 20_000));
                }
            }
            EMITTED_AT_MS.set(System.currentTimeMillis());
            while (running) Thread.sleep(200);
        }

        @Override
        public void cancel() {
            running = false;
        }
    }

    private static long dirBytes(Path p) throws IOException {
        if (!Files.exists(p)) return 0;
        try (Stream<Path> s = Files.walk(p)) {
            return s.filter(Files::isRegularFile).mapToLong(f -> f.toFile().length()).sum();
        }
    }

    private static long latestCheckpointBytes(Path root, JobID id) throws IOException {
        Path job = root.resolve(id.toHexString());
        if (!Files.exists(job)) return 0;
        long best = -1;
        Path latest = null;
        try (Stream<Path> s = Files.list(job)) {
            for (Path p : (Iterable<Path>) s::iterator) {
                String n = p.getFileName().toString();
                // the newest COMPLETED checkpoint: an in-progress chk-N has no _metadata yet
                if (n.startsWith("chk-") && Files.exists(p.resolve("_metadata")) && Integer.parseInt(n.substring(4)) > best) {
                    best = Integer.parseInt(n.substring(4));
                    latest = p;
                }
            }
        }
        return latest == null ? 0 : dirBytes(latest) + dirBytes(job.resolve("shared"));
    }

    private static void measure(boolean legacy) throws Exception {
        Path ckRoot = Paths.get(System.getProperty("java.io.tmpdir"), "short-bench-" + (legacy ? "legacy" : "buffer"));
        // -Dshort.bench.managedMb=45 reproduces one slot of the Marun/lab TaskManager (717 MB managed / 16 slots)
        org.apache.flink.configuration.Configuration conf = new org.apache.flink.configuration.Configuration();
        Integer managedMb = Integer.getInteger("short.bench.managedMb");
        if (managedMb != null) {
            conf.set(org.apache.flink.configuration.TaskManagerOptions.MANAGED_MEMORY_SIZE,
                    org.apache.flink.configuration.MemorySize.ofMebiBytes(managedMb));
        }
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1, conf);
        boolean heap = Boolean.getBoolean("short.bench.heap"); // CHG-039: the job runs on heap state
        env.setStateBackend(heap ? new org.apache.flink.runtime.state.hashmap.HashMapStateBackend() : new EmbeddedRocksDBStateBackend(false));
        env.enableCheckpointing(5_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setCheckpointStorage(ckRoot.toUri().toString());
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);
        EvidencePolicy none = new EvidencePolicy(EvidencePolicy.Mode.NONE);

        DataStream<CplmNormalizedSample> src = env.addSource(new BacklogSource()).name("backlog");
        if (legacy) {
            for (ShortWindowSpecs.Spec s : ShortWindowSpecs.ALL) {
                src.keyBy(x -> x.loopId)
                        .window(s.sizeMs == s.slideMs ? TumblingEventTimeWindows.of(Time.milliseconds(s.sizeMs))
                                : SlidingEventTimeWindows.of(Time.milliseconds(s.sizeMs), Time.milliseconds(s.slideMs)))
                        .allowedLateness(Time.milliseconds(s.latenessMs))
                        .process(new ShortWindowParityTest.LegacyWindowFn(s.kind, none))
                        .addSink(new DiscardingSink<>());
            }
        } else {
            src.keyBy(x -> x.loopId).process(new ShortFeatureBufferFn(none)).addSink(new DiscardingSink<>());
        }

        EMITTED_AT_MS.set(0);
        EMITTED.set(0);
        long started = System.currentTimeMillis();
        JobClient job = env.executeAsync(legacy ? "bench-legacy" : "bench-buffer");
        while (EMITTED_AT_MS.get() == 0 && System.currentTimeMillis() - started < CAP_MS) Thread.sleep(200);
        boolean finished = EMITTED_AT_MS.get() != 0;
        long drainedMs = (finished ? EMITTED_AT_MS.get() : System.currentTimeMillis()) - started;
        long done = EMITTED.get();
        Thread.sleep(15_000); // at least two checkpoints with the full backlog in state
        long ckBytes = latestCheckpointBytes(ckRoot, job.getJobID());
        System.gc();
        Runtime rt = Runtime.getRuntime();
        System.out.printf("SHORT-BENCH heap_used_after_gc_MB=%.0f%n", (rt.totalMemory() - rt.freeMemory()) / 1048576.0);
        job.cancel().get();
        System.out.printf("SHORT-BENCH %-7s backlog=%d accepted=%d finished=%s elapsed_s=%.1f samples_per_s=%.0f checkpoint_MB=%.1f%n",
                legacy ? "legacy" : "buffer", (long) LOOPS * SAMPLES_PER_LOOP, done, finished, drainedMs / 1000.0,
                done * 1000.0 / Math.max(1, drainedMs), ckBytes / 1048576.0);
    }

    @Test
    public void backlogDrainAndCheckpointSize() throws Exception {
        Assume.assumeTrue(Boolean.getBoolean("short.bench"));
        if (!Boolean.getBoolean("short.bench.newOnly")) measure(true);
        measure(false);
    }
}
