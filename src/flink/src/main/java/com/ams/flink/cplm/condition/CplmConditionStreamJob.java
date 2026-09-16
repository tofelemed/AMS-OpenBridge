package com.ams.flink.cplm.condition;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmIngestPipeline;
import com.ams.flink.cplm.CplmJobConfig;
import com.ams.flink.cplm.CplmKafkaSink;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.contract.CplmTopics;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

/**
 * v2.5 Task 1D.4 (spec v6 R11 / R08) - the fast condition path. Consumes the same normalised
 * samples (with resolved profiles and declared ranges) as the window jobs and publishes
 * G10 limit-dwell and G11 freeze conditions as they happen, to
 * {@code traverse.cpa.clpm.condition.v1} (keyed by loop_id). The long-window gates keep
 * their own per-slice evidence; fusion consumes the open conditions (Task 1D.5).
 *
 * <p>Submitted as "AMS - CPLM Condition Engine" next to the three CPLM jobs.
 */
public final class CplmConditionStreamJob {

    private CplmConditionStreamJob() {
    }

    public static void main(String[] args) throws Exception {
        CplmJobConfig base = CplmJobConfig.fromArgs(args);
        String conditionTopic = argOr(args, "condition-topic", CplmTopics.CONDITION_EVENTS);
        CplmJobConfig cfg = new CplmJobConfig(base.brokers, "AMS - CPLM Condition Engine",
                base.consumerGroupId + "-condition", base.inputTopic, conditionTopic,
                base.shortFeatureTopic, base.longFeatureTopic,
                base.windowHours, base.outOfOrdernessMinutes);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60_000, CheckpointingMode.EXACTLY_ONCE);

        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-condition-source");

        DataStream<String> events = normalized
                .keyBy(s -> s.loopId)
                .process(new ConditionProcessFunction())
                .name("cplm-condition-detect")
                .uid("cplm-condition-detect");

        CplmKafkaSink.attachKeyed(events, cfg, conditionTopic, "cplm-condition-sink", "loop_id");
        env.execute(cfg.jobName);
    }

    /** Keyed wrapper: one {@link ConditionDetector} per loop, checkpointed. */
    public static class ConditionProcessFunction extends KeyedProcessFunction<String, CplmNormalizedSample, String> {
        private transient ValueState<ConditionDetector> detector;

        @Override
        public void open(Configuration parameters) {
            detector = getRuntimeContext().getState(new ValueStateDescriptor<>("conditionDetector", ConditionDetector.class));
        }

        @Override
        public void processElement(CplmNormalizedSample s, Context ctx, Collector<String> out) throws Exception {
            ConditionDetector d = detector.value();
            if (d == null) d = new ConditionDetector();
            CplmLoopDynamicsProfile profile = s.resolvedProfile != null
                    ? s.resolvedProfile
                    : CplmDynamicsParameterSetSupport.resolveFromSpine(s.loopId, s.loopType, s.assetUuid);
            for (ConditionEvent e : d.onSample(s, profile)) out.collect(e.toJson());
            detector.update(d);
        }
    }

    private static String argOr(String[] args, String key, String def) {
        for (int i = 0; i < args.length - 1; i++) {
            String a = args[i].startsWith("--") ? args[i].substring(2) : args[i];
            if (a.equals(key)) return args[i + 1];
        }
        return def;
    }
}
