package com.ams.flink.cplm;

import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.util.ArrayList;
import java.util.List;

/**
 * Stage 1 — Short-feature job (Gates 0–4): 1m tumbling + 5m/15m/60m sliding windows.
 *
 * <p>Per build prompt §2.1:
 * <ul>
 *   <li>TumblingEventTimeWindows.of(1 min)  — allowed lateness 30s</li>
 *   <li>SlidingEventTimeWindows(5 min / 1 min slide) — allowed lateness 60s</li>
 *   <li>SlidingEventTimeWindows(15 min / 5 min slide) — allowed lateness 2min</li>
 *   <li>SlidingEventTimeWindows(60 min / 5 min slide) — allowed lateness 3min</li>
 * </ul>
 * Four parallel window branches unioned into one sink, exactly as in job_short_features
 * from the CPLM architecture report.
 *
 * <p>Source: cplm-normalized-source (existing topic).
 * Sink: clpm.feature.short.v1 (matches existing topic name in CplmJobConfig defaults).
 */
public class CplmShortFeatureStreamJob {

    public static void main(String[] args) throws Exception {
        CplmJobConfig cfg = CplmJobConfig.fromArgs(args);
        cfg = new CplmJobConfig(cfg.brokers, "AMS - CPLM Short Feature Engine",
                cfg.consumerGroupId + "-short", cfg.inputTopic, cfg.outputTopic,
                cfg.shortFeatureTopic, cfg.longFeatureTopic, cfg.windowHours, cfg.outOfOrdernessMinutes);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(180_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(60_000);
        env.getCheckpointConfig().setCheckpointTimeout(300_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-short-normalized-source");

        // Branch 1: 1m tumbling, 30s allowed lateness
        DataStream<String> branch1m = normalized
                .keyBy(s -> s.loopId)
                .window(TumblingEventTimeWindows.of(Time.minutes(1)))
                .allowedLateness(Time.seconds(30))
                .process(new ShortFeatureWindowFn("1m"))
                .name("cplm-short-window-1m")
                .uid("cplm-short-window-1m")
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-1m")
                .uid("cplm-short-serialize-1m");

        // Branch 2: 5m sliding / 1m slide, 60s allowed lateness
        DataStream<String> branch5m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(5), Time.minutes(1)))
                .allowedLateness(Time.seconds(60))
                .process(new ShortFeatureWindowFn("5m"))
                .name("cplm-short-window-5m")
                .uid("cplm-short-window-5m")
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-5m")
                .uid("cplm-short-serialize-5m");

        // Branch 3: 10m sliding / 2m slide, 90s allowed lateness
        DataStream<String> branch10m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(10), Time.minutes(2)))
                .allowedLateness(Time.seconds(90))
                .process(new ShortFeatureWindowFn("10m"))
                .name("cplm-short-window-10m")
                .uid("cplm-short-window-10m")
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-10m")
                .uid("cplm-short-serialize-10m");

        // Branch 4: 15m sliding / 5m slide, 2min allowed lateness
        DataStream<String> branch15m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(15), Time.minutes(5)))
                .allowedLateness(Time.minutes(2))
                .process(new ShortFeatureWindowFn("15m"))
                .name("cplm-short-window-15m")
                .uid("cplm-short-window-15m")
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-15m")
                .uid("cplm-short-serialize-15m");

        // Branch 5: 30m sliding / 5m slide, 2min allowed lateness
        DataStream<String> branch30m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(30), Time.minutes(5)))
                .allowedLateness(Time.minutes(2))
                .process(new ShortFeatureWindowFn("30m"))
                .name("cplm-short-window-30m")
                .uid("cplm-short-window-30m")
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-30m")
                .uid("cplm-short-serialize-30m");

        // Branch 6: 60m sliding / 5m slide, 3min allowed lateness
        DataStream<String> branch60m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(60), Time.minutes(5)))
                .allowedLateness(Time.minutes(3))
                .process(new ShortFeatureWindowFn("60m"))
                .name("cplm-short-window-60m")
                .uid("cplm-short-window-60m")
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-60m")
                .uid("cplm-short-serialize-60m");

        // Union all four branches into one sink
        DataStream<String> union = branch1m.union(branch5m).union(branch10m).union(branch15m).union(branch30m).union(branch60m);
        CplmKafkaSink.attach(union, cfg, cfg.shortFeatureTopic, "cplm-short-feature-sink");

        env.execute(cfg.jobName);
    }

    static class ShortFeatureWindowFn extends ProcessWindowFunction<CplmNormalizedSample, CplmShortFeatureResult, String, TimeWindow> {
        private final String windowKind;

        ShortFeatureWindowFn(String windowKind) {
            this.windowKind = windowKind;
        }

        @Override
        public void process(String loopId, Context ctx, Iterable<CplmNormalizedSample> elements, Collector<CplmShortFeatureResult> out) {
            long start = ctx.window().getStart();
            long end = ctx.window().getEnd(); // Flink TimeWindow is [start, end)
            List<CplmNormalizedSample> batch = new ArrayList<>();
            for (CplmNormalizedSample s : elements) {
                if (s != null && s.eventTsMs >= start && s.eventTsMs < end) {
                    batch.add(s);
                }
            }
            out.collect(CplmGateEngine.computeShortFeatures(batch, start, end, windowKind));
        }
    }
}
