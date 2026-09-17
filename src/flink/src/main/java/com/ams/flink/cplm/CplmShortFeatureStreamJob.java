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
import org.apache.flink.util.OutputTag;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import com.ams.flink.cplm.evidence.ShortArtifacts;

import java.util.ArrayList;
import java.util.List;

/**
 * Stage 1 — Short-feature job (Gates 0–4): 1m tumbling + five sliding windows.
 *
 * <p>Six parallel window branches, all keyed per loop, unioned into one sink.
 * Only 1m is a TUMBLING window — every other kind is a sliding window whose
 * records overlap their neighbours (a consumer must never sum/average across
 * kinds):
 * <ul>
 *   <li>TumblingEventTimeWindows.of(1 min)                — allowed lateness 30s</li>
 *   <li>SlidingEventTimeWindows(5 min  / 1 min slide)     — allowed lateness 60s</li>
 *   <li>SlidingEventTimeWindows(10 min / 2 min slide)     — allowed lateness 90s</li>
 *   <li>SlidingEventTimeWindows(15 min / 5 min slide)     — allowed lateness 2min</li>
 *   <li>SlidingEventTimeWindows(30 min / 5 min slide)     — allowed lateness 2min</li>
 *   <li>SlidingEventTimeWindows(60 min / 5 min slide)     — allowed lateness 3min</li>
 * </ul>
 * This list is mirrored by cplm-api's window contract
 * ({@code CpmAnalyticsController.WindowSpecs}, served at /api/v1/cpm/resolutions)
 * — keep the two in step when adding or changing a branch.
 *
 * <p>Source: the normalized loop-sample topic (submitters pass
 * {@code --input-topic traverse.cpa.loop.samples.v1}).
 * Sink: traverse.cpa.clpm.feature.short.v1, keyed by loop_id.
 */
public class CplmShortFeatureStreamJob {

    public static void main(String[] args) throws Exception {
        CplmJobConfig cfg = CplmJobConfig.fromArgs(args);
        cfg = cfg.forJob("AMS - CPLM Short Feature Engine", "-short", null);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(180_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(60_000);
        env.getCheckpointConfig().setCheckpointTimeout(300_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        build(env, cfg, args);
        env.execute(cfg.jobName);
    }

    /** The job graph without execution (a test inspects its operators). */
    public static void build(StreamExecutionEnvironment env, CplmJobConfig cfg, String[] args) {
        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-short-normalized-source");
        // v2.5 (2C.1c): every branch emits its gates' exact intermediates on a side output when the
        // policy says so (findings by default, --evidence-emit all|episodes|none); one evidence sink.
        EvidencePolicy policy = EvidencePolicy.fromArgs(args);
        String evidenceTopic = argOr(args, "--evidence-topic", CplmTopics.GATE_EVIDENCE);
        List<DataStream<String>> evidenceStreams = new ArrayList<>();

        // Branch 1: 1m tumbling, 30s allowed lateness
        SingleOutputStreamOperator<CplmShortFeatureResult> windowed1m = normalized
                .keyBy(s -> s.loopId)
                .window(TumblingEventTimeWindows.of(Time.minutes(1)))
                .allowedLateness(Time.seconds(30))
                .process(new ShortFeatureWindowFn("1m", policy))
                .name("cplm-short-window-1m")
                .uid("cplm-short-window-1m");
        evidenceStreams.add(windowed1m.getSideOutput(ShortFeatureWindowFn.EVIDENCE));
        DataStream<String> branch1m = windowed1m
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-1m")
                .uid("cplm-short-serialize-1m");

        // Branch 2: 5m sliding / 1m slide, 60s allowed lateness
        SingleOutputStreamOperator<CplmShortFeatureResult> windowed5m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(5), Time.minutes(1)))
                .allowedLateness(Time.seconds(60))
                .process(new ShortFeatureWindowFn("5m", policy))
                .name("cplm-short-window-5m")
                .uid("cplm-short-window-5m");
        evidenceStreams.add(windowed5m.getSideOutput(ShortFeatureWindowFn.EVIDENCE));
        DataStream<String> branch5m = windowed5m
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-5m")
                .uid("cplm-short-serialize-5m");

        // Branch 3: 10m sliding / 2m slide, 90s allowed lateness
        SingleOutputStreamOperator<CplmShortFeatureResult> windowed10m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(10), Time.minutes(2)))
                .allowedLateness(Time.seconds(90))
                .process(new ShortFeatureWindowFn("10m", policy))
                .name("cplm-short-window-10m")
                .uid("cplm-short-window-10m");
        evidenceStreams.add(windowed10m.getSideOutput(ShortFeatureWindowFn.EVIDENCE));
        DataStream<String> branch10m = windowed10m
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-10m")
                .uid("cplm-short-serialize-10m");

        // Branch 4: 15m sliding / 5m slide, 2min allowed lateness
        SingleOutputStreamOperator<CplmShortFeatureResult> windowed15m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(15), Time.minutes(5)))
                .allowedLateness(Time.minutes(2))
                .process(new ShortFeatureWindowFn("15m", policy))
                .name("cplm-short-window-15m")
                .uid("cplm-short-window-15m");
        evidenceStreams.add(windowed15m.getSideOutput(ShortFeatureWindowFn.EVIDENCE));
        DataStream<String> branch15m = windowed15m
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-15m")
                .uid("cplm-short-serialize-15m");

        // Branch 5: 30m sliding / 5m slide, 2min allowed lateness
        SingleOutputStreamOperator<CplmShortFeatureResult> windowed30m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(30), Time.minutes(5)))
                .allowedLateness(Time.minutes(2))
                .process(new ShortFeatureWindowFn("30m", policy))
                .name("cplm-short-window-30m")
                .uid("cplm-short-window-30m");
        evidenceStreams.add(windowed30m.getSideOutput(ShortFeatureWindowFn.EVIDENCE));
        DataStream<String> branch30m = windowed30m
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-30m")
                .uid("cplm-short-serialize-30m");

        // Branch 6: 60m sliding / 5m slide, 3min allowed lateness
        SingleOutputStreamOperator<CplmShortFeatureResult> windowed60m = normalized
                .keyBy(s -> s.loopId)
                .window(SlidingEventTimeWindows.of(Time.minutes(60), Time.minutes(5)))
                .allowedLateness(Time.minutes(3))
                .process(new ShortFeatureWindowFn("60m", policy))
                .name("cplm-short-window-60m")
                .uid("cplm-short-window-60m");
        evidenceStreams.add(windowed60m.getSideOutput(ShortFeatureWindowFn.EVIDENCE));
        DataStream<String> branch60m = windowed60m
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize-60m")
                .uid("cplm-short-serialize-60m");

        // Union all six branches into one sink. Keyed by loop_id (audit.md F-2,
        // same class as PIPE-010): all of one loop's windows land on one
        // partition, so downstream consumers see them in emission order.
        DataStream<String> union = branch1m.union(branch5m).union(branch10m).union(branch15m).union(branch30m).union(branch60m);
        CplmKafkaSink.attachKeyed(union, cfg, cfg.shortFeatureTopic, "cplm-short-feature-sink", "loop_id");
        DataStream<String> evidence = evidenceStreams.get(0);
        for (int i = 1; i < evidenceStreams.size(); i++) evidence = evidence.union(evidenceStreams.get(i));
        CplmKafkaSink.attachKeyed(evidence, cfg, evidenceTopic, "cplm-short-evidence-sink", EvidenceKafkaRecords.KEY_FIELD);

        // v2.5 (3A.2): announce what this job can be configured with (readable property ids, catalogue hash,
        // compiled capacity) on the gate-config ACK topic at every start - capability from the RUNNING job
        com.ams.flink.cplm.config.CapabilityRecord.announce(env, cfg, cfg.jobName, args);
    }

    static class ShortFeatureWindowFn extends ProcessWindowFunction<CplmNormalizedSample, CplmShortFeatureResult, String, TimeWindow> {
        /** v2.5 (2C.1c): evidence records (EvidenceKafkaRecords JSON) leave through this side output. */
        static final OutputTag<String> EVIDENCE = new OutputTag<String>("cplm-short-evidence") {
        };
        private static final ObjectMapper MAPPER = new ObjectMapper();
        private final String windowKind;
        private final EvidencePolicy policy;

        ShortFeatureWindowFn(String windowKind) {
            this(windowKind, new EvidencePolicy(EvidencePolicy.Mode.EPISODES));
        }

        ShortFeatureWindowFn(String windowKind, EvidencePolicy policy) {
            this.windowKind = windowKind;
            this.policy = policy;
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
            CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(batch, start, end, windowKind);
            // the intermediates are transient: build the artifacts HERE, before the result leaves the operator
            if (policy.emit(r)) {
                long nowMs = System.currentTimeMillis();
                for (EvidenceArtifact a : ShortArtifacts.artifacts(r)) {
                    for (String record : EvidenceKafkaRecords.records(a, MAPPER, nowMs)) ctx.output(EVIDENCE, record);
                }
            }
            out.collect(r);
        }
    }

    private static String argOr(String[] args, String key, String def) {
        for (int i = 0; i + 1 < args.length; i++) if (key.equals(args[i])) return args[i + 1];
        return def;
    }
}
