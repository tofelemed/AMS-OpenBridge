package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmIngestPipeline;
import com.ams.flink.cplm.CplmJobConfig;
import com.ams.flink.cplm.CplmKafkaSink;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

/**
 * v2.5 Task 2B.1 (spec §2, R01, R11): the G12 system-response job. One {@link ResponseCapture}
 * per loop in keyed state detects events and closes captures; each closed capture is evaluated
 * in place by {@link ResponseEvaluator} (Flink processes one key at a time, so per-loop
 * concurrency is one by construction; the wall-clock budget censors a slow fit). Results go to
 * {@code traverse.cpa.clpm.response.results.v1} keyed by loop_id; evidence records ride a side
 * output to the gate-evidence topic keyed by method_run_id, exactly like the long job.
 * The previous COMPLETE event of a loop is held as the independent validation holdout.
 */
public final class CplmResponseAnalysisJob {
    public static final String JOB_NAME = "AMS - CPLM Response Engine";

    private CplmResponseAnalysisJob() {}

    public static void main(String[] args) throws Exception {
        CplmJobConfig base = CplmJobConfig.fromArgs(args);
        String resultsTopic = argOr(args, "response-topic", CplmTopics.RESPONSE_RESULTS);
        String evidenceTopic = argOr(args, "evidence-topic", CplmTopics.GATE_EVIDENCE);
        String purpose = argOr(args, "purpose", "LIVE");
        String analysisRunId = argOr(args, "analysis-run-id", "");
        CplmJobConfig cfg = new CplmJobConfig(base.brokers, JOB_NAME, base.consumerGroupId + "-response", base.inputTopic, resultsTopic,
                base.shortFeatureTopic, base.longFeatureTopic, base.windowHours, base.outOfOrdernessMinutes);
        ResponseJobConfig rcfg = ResponseJobConfig.fromArgs(args);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(300_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(120_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-response-source");
        SingleOutputStreamOperator<String> results = normalized
                .keyBy(s -> s.loopId)
                .process(new ResponseProcessFunction(rcfg, purpose, analysisRunId))
                .name("cplm-response-capture-evaluate")
                .uid("cplm-response-capture-evaluate");

        CplmKafkaSink.attachKeyed(results.getSideOutput(ResponseProcessFunction.EVIDENCE), cfg, evidenceTopic, "cplm-response-evidence-sink", EvidenceKafkaRecords.KEY_FIELD);
        CplmKafkaSink.attachKeyed(results, cfg, resultsTopic, "cplm-response-sink", "loop_id");
        env.execute(cfg.jobName);
    }

    /** Keyed wrapper: capture state + the loop's holdout, checkpointed; evaluation inline. */
    public static class ResponseProcessFunction extends KeyedProcessFunction<String, CplmNormalizedSample, String> {
        static final OutputTag<String> EVIDENCE = new OutputTag<String>("cplm-response-evidence") {
        };
        private static final ObjectMapper MAPPER = new ObjectMapper();
        private final ResponseJobConfig cfg;
        private final String purpose, analysisRunId;
        private transient ValueState<ResponseCapture> capture;
        private transient ValueState<EventDataset> holdout;
        private transient ValueState<Double> holdoutU0;
        private transient ResponseEvaluator evaluator;

        public ResponseProcessFunction(ResponseJobConfig cfg, String purpose, String analysisRunId) {
            this.cfg = cfg;
            this.purpose = purpose;
            this.analysisRunId = analysisRunId;
        }

        @Override
        public void open(Configuration parameters) {
            capture = getRuntimeContext().getState(new ValueStateDescriptor<>("responseCapture", TypeInformation.of(ResponseCapture.class)));
            holdout = getRuntimeContext().getState(new ValueStateDescriptor<>("responseHoldout", TypeInformation.of(EventDataset.class)));
            holdoutU0 = getRuntimeContext().getState(new ValueStateDescriptor<>("responseHoldoutU0", Double.class));
            evaluator = new ResponseEvaluator(cfg);
        }

        @Override
        public void processElement(CplmNormalizedSample s, Context ctx, Collector<String> out) throws Exception {
            ResponseCapture c = capture.value();
            if (c == null) c = new ResponseCapture(s.loopId, cfg);
            // VP is the applied input only while it is evidence: a held positioner value past vp_max_age_s
            // is not (spec §2.7) - presence alone froze u_applied on the lab and hid every OP step
            boolean vpUsable = s.vpEligible(cfg.vpMaxAgeS);
            for (ResponseCapture.Closed closed : c.onSample(s, vpUsable)) {
                ModelFamily family = familyFor(s);
                ResponseEvaluator.Outcome o = evaluator.evaluate(closed, family, holdout.value(), holdoutU0.value() == null ? 0 : holdoutU0.value(),
                        ControllerSnapshot.unknown(), ctx.timerService().currentProcessingTime(), purpose, analysisRunId, 0);
                out.collect(o.result.toJson());
                for (EvidenceArtifact a : o.artifacts) {
                    for (String record : EvidenceKafkaRecords.records(a, MAPPER, o.result.emittedAtMs)) ctx.output(EVIDENCE, record);
                }
                if (o.holdoutCandidate != null) {
                    holdout.update(o.holdoutCandidate);
                    holdoutU0.update(o.holdoutU0);
                }
            }
            capture.update(c);
        }

        /** Phase 2G replaces this with the registry's explicit dynamic class; until then the loop-type preset. */
        static ModelFamily familyFor(CplmNormalizedSample s) {
            String lt = s.loopType == null ? "" : s.loopType.toUpperCase();
            if (lt.startsWith("LIC")) return ModelFamily.IPDT;
            return ModelFamily.FOPDT;
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
