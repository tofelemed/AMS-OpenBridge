package com.ams.flink.cplm;

import org.apache.flink.api.common.state.ListState;
import org.apache.flink.api.common.state.ListStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Stage 2 — Long-diagnostics job: rolling 4h/24h windows via KeyedProcessFunction
 * (NOT built-in sliding windows — see build prompt §2.2).
 *
 * <p>Key by loop_id, maintain ListState rolling buffer evicted at event_ts - 24h - 10min cushion,
 * register event-time timers on 15-minute cadence, compute both 4h and 24h slices on each timer.
 *
 * <p>Source: cplm-normalized-source (existing topic, independent consumer group).
 * Sink: clpm.feature.long.v1 (matches existing topic name in CplmJobConfig defaults).
 */
public class CplmLongDiagnosticsStreamJob {

    // Re-emit diagnostics every 15 minutes (900_000 ms)
    private static final long TIMER_INTERVAL_MS = 15L * 60L * 1000L;
    // Retain 24h + 10min of data in rolling buffer
    private static final long BUFFER_RETENTION_MS = (24L * 60L + 10L) * 60L * 1000L;
    // Minimum samples before computing diagnostics
    private static final int MIN_SAMPLES = 32;
    // Window lengths for diagnostics
    private static final long WINDOW_12H_MS = 12L * 60L * 60L * 1000L;
    private static final long WINDOW_4H_MS = 4L * 60L * 60L * 1000L;
    private static final long WINDOW_24H_MS = 24L * 60L * 60L * 1000L;

    public static void main(String[] args) throws Exception {
        CplmJobConfig cfg = CplmJobConfig.fromArgs(args);
        cfg = new CplmJobConfig(cfg.brokers, "AMS - CPLM Long Diagnostics Engine",
                cfg.consumerGroupId + "-long", cfg.inputTopic, cfg.outputTopic,
                cfg.shortFeatureTopic, cfg.longFeatureTopic, cfg.windowHours, cfg.outOfOrdernessMinutes);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(300_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(120_000);
        env.getCheckpointConfig().setCheckpointTimeout(600_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-long-normalized-source");

        DataStream<String> diagnostics = normalized
                .keyBy(s -> s.loopId)
                .process(new LongDiagnosticsProcessFunction())
                .name("cplm-long-diagnostics-keyed-process")
                .map(CplmLongDiagnosticsResult::toJson)
                .name("cplm-long-diagnostics-serialize");

        CplmKafkaSink.attach(diagnostics, cfg, cfg.longFeatureTopic, "cplm-long-diagnostics-sink");
        env.execute(cfg.jobName);
    }

    /**
     * KeyedProcessFunction implementing the rolling-buffer long diagnostics.
     * <p>
     * Per build prompt §2.2: maintain ListState rolling buffer per loop_id,
     * evict at event_ts - 24h - 10min, register event-time timers every 15 minutes,
     * compute 4h + 24h slices from buffer on each timer firing.
     * <p>
     * State size estimate: ~0.83–1.38 MB per loop at 5s sampling over 24h (17,280 samples).
     */
    static class LongDiagnosticsProcessFunction
            extends KeyedProcessFunction<String, CplmNormalizedSample, CplmLongDiagnosticsResult> {

        private transient ListState<CplmNormalizedSample> rollingBuffer;
        private transient ValueState<Long> nextTimerTs;

        @Override
        public void open(Configuration parameters) {
            rollingBuffer = getRuntimeContext().getListState(
                    new ListStateDescriptor<>("cplm-rolling-buffer",
                            TypeInformation.of(CplmNormalizedSample.class)));
            nextTimerTs = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("next-timer-ts", Long.class));
        }

        @Override
        public void processElement(CplmNormalizedSample sample, Context ctx,
                                   Collector<CplmLongDiagnosticsResult> out) throws Exception {
            // Add sample to rolling buffer
            rollingBuffer.add(sample);

            // Register the next 15-minute cadence timer if not already set
            Long currentNext = nextTimerTs.value();
            // Align to next 15-minute boundary: ((event_ts / 15min) + 1) * 15min
            long alignedNext = ((sample.eventTsMs / TIMER_INTERVAL_MS) + 1) * TIMER_INTERVAL_MS;

            if (currentNext == null || alignedNext > currentNext) {
                ctx.timerService().registerEventTimeTimer(alignedNext);
                nextTimerTs.update(alignedNext);
            }
        }

        @Override
        public void onTimer(long timestamp, OnTimerContext ctx,
                            Collector<CplmLongDiagnosticsResult> out) throws Exception {
            String loopId = ctx.getCurrentKey();

            // Evict samples older than timestamp - 24h - 10min cushion
            long evictBefore = timestamp - BUFFER_RETENTION_MS;
            List<CplmNormalizedSample> retained = new ArrayList<>();
            Iterator<CplmNormalizedSample> it = rollingBuffer.get().iterator();
            while (it.hasNext()) {
                CplmNormalizedSample s = it.next();
                if (s.eventTsMs >= evictBefore) {
                    retained.add(s);
                }
            }
            rollingBuffer.update(retained);

            // Compute 4h window slice
            long cutoff4h = timestamp - WINDOW_4H_MS;
            List<CplmNormalizedSample> slice4h = new ArrayList<>();
            for (CplmNormalizedSample s : retained) {
                if (s.eventTsMs >= cutoff4h && s.eventTsMs < timestamp) {
                    slice4h.add(s);
                }
            }
            if (slice4h.size() >= MIN_SAMPLES) {
                CplmLongDiagnosticsResult r4h = CplmGateEngine.computeLongDiagnostics(
                        slice4h, cutoff4h, timestamp, "4h");
                r4h.alignedShort = CplmGateEngine.computeShortFeatures(
                        slice4h, cutoff4h, timestamp, "4h");
                out.collect(r4h);
            }

            // Compute 12h window slice
            long cutoff12h = timestamp - WINDOW_12H_MS;
            List<CplmNormalizedSample> slice12h = new ArrayList<>();
            for (CplmNormalizedSample s : retained) {
                if (s.eventTsMs >= cutoff12h && s.eventTsMs < timestamp) {
                    slice12h.add(s);
                }
            }
            if (slice12h.size() >= MIN_SAMPLES) {
                CplmLongDiagnosticsResult r12h = CplmGateEngine.computeLongDiagnostics(
                        slice12h, cutoff12h, timestamp, "12h");
                r12h.alignedShort = CplmGateEngine.computeShortFeatures(
                        slice12h, cutoff12h, timestamp, "12h");
                out.collect(r12h);
            }

            // Compute 24h window slice
            long cutoff24h = timestamp - WINDOW_24H_MS;
            List<CplmNormalizedSample> slice24h = new ArrayList<>();
            for (CplmNormalizedSample s : retained) {
                if (s.eventTsMs >= cutoff24h && s.eventTsMs < timestamp) {
                    slice24h.add(s);
                }
            }
            if (slice24h.size() >= MIN_SAMPLES) {
                CplmLongDiagnosticsResult r24h = CplmGateEngine.computeLongDiagnostics(
                        slice24h, cutoff24h, timestamp, "24h");
                r24h.alignedShort = CplmGateEngine.computeShortFeatures(
                        slice24h, cutoff24h, timestamp, "24h");
                out.collect(r24h);
            }

            // Register next timer at +15 minutes
            long next = timestamp + TIMER_INTERVAL_MS;
            ctx.timerService().registerEventTimeTimer(next);
            nextTimerTs.update(next);
        }
    }
}
