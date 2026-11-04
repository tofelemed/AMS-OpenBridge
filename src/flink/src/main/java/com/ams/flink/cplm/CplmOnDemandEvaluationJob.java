package com.ams.flink.cplm;

import com.ams.flink.KafkaSinks;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import com.ams.flink.cplm.ondemand.EvaluationSources;
import com.ams.flink.cplm.ondemand.OnDemandEvaluationFunction;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.java.utils.ParameterTool;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.kafka.clients.consumer.OffsetResetStrategy;

import java.util.Map;

/**
 * CHG-102 Phase 5c — the always-running on-demand evaluation job ("AMS - CPLM On-Demand Evaluation").
 *
 * <p>Why: evidence for a window that is neither live (6 h) nor archived (a plant 00:00 / 12:00 boundary) was rebuilt by
 * submitting a BATCH CplmHistoricalReplayJob per click and per gate - a job start (tens of seconds) and a slot each time.
 * This job is submitted once and answers requests from {@link CplmTopics#EVALUATION_REQUESTS}: per request it reads the
 * loop's window from the IoTDB historian, evaluates it exactly as the replay does ({@link WindowEvaluation}), and writes
 * the fused result (purpose EVALUATE) to the gate results topic, the whole evidence set (short + long + fusion) to the
 * evidence topic, and RUNNING / SUCCEEDED / FAILED to {@link CplmTopics#EVALUATION_STATUS}.
 *
 * <p>Source: Kafka, committed offsets of group ams-cplm-on-demand-evaluation, else latest (never a backlog from the
 * beginning; a request older than --max-request-age-minutes is answered REQUEST_EXPIRED). An unbounded Kafka source only
 * - no bounded source feeds a KafkaSink here (FLINK-25920). No capability record: this job applies no governed bundle
 * (a request carries its bundle) and must not look like a gate-config worker to the bundle ACK protocol.
 *
 * <p>Arguments: --bootstrap.servers (or --brokers; env KAFKA_BROKERS), --request-topic, --status-topic,
 * --output-topic (gate results), --evidence-topic, --consumer-group-id, --iotdb-host/--iotdb-port (env IOTDB_HOST),
 * --iotdb-root-prefix (env LOOP_ROOT_PREFIX, default root.site1.cpm; a request's iotdb_device wins), --max-request-age-minutes
 * (15), --parameter-refresh-minutes (5), --max-rows (200000), --evidence-max-cycles (12), --parallelism (1).
 * IoTDB credentials come from the TaskManager's environment (IOTDB_USER / IOTDB_PASS), never from a program argument.
 */
public final class CplmOnDemandEvaluationJob {
    public static final String JOB_NAME = "AMS - CPLM On-Demand Evaluation";
    public static final String CONSUMER_GROUP = "ams-cplm-on-demand-evaluation";

    private CplmOnDemandEvaluationJob() {}

    public static void main(String[] args) throws Exception {
        ParameterTool params = ParameterTool.fromArgs(args);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(params.getInt("parallelism", 1));
        // offsets are committed on checkpoint: a minute keeps a re-answered backlog after a restore small
        CplmCheckpointing.configureBusyTolerant(env, 60_000, 30_000);
        build(env, params, System.getenv());
        env.execute(JOB_NAME);
    }

    static String brokers(ParameterTool params, Map<String, String> env) {
        return params.get("bootstrap.servers", params.get("brokers",
                CplmHistoricalReplayJob.envFirst(env, "kafka:9092", "KAFKA_BROKERS")));
    }

    static OnDemandEvaluationFunction.Settings settings(ParameterTool params, Map<String, String> env) {
        return new OnDemandEvaluationFunction.Settings(
                params.get("iotdb-root-prefix", CplmHistoricalReplayJob.envFirst(env, "root.site1.cpm", "LOOP_ROOT_PREFIX")),
                params.getLong("max-request-age-minutes", 15L) * 60_000L,
                params.getLong("parameter-refresh-minutes", 5L) * 60_000L,
                params.getLong("max-rows", 200_000L),
                params.getInt(EvidencePolicy.ARG_MAX_CYCLES.substring(2), EvidencePolicy.DEFAULT_MAX_CYCLES));
    }

    /** The job graph without execution. */
    public static void build(StreamExecutionEnvironment env, ParameterTool params, Map<String, String> envVars) {
        String brokers = brokers(params, envVars);
        String requestTopic = params.get("request-topic", CplmTopics.EVALUATION_REQUESTS);
        String statusTopic = params.get("status-topic", CplmTopics.EVALUATION_STATUS);
        String resultTopic = params.get("output-topic", CplmTopics.GATE_RESULTS);
        String evidenceTopic = params.get("evidence-topic", CplmTopics.GATE_EVIDENCE);
        String iotdbHost = params.get("iotdb-host", CplmHistoricalReplayJob.envFirst(envVars, "ams-iotdb", "IOTDB_HOST"));
        int iotdbPort = params.getInt("iotdb-port", 6667);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics(requestTopic)
                .setGroupId(params.get("consumer-group-id", CONSUMER_GROUP))
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.LATEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("commit.offsets.on.checkpoint", "true")
                .build();
        DataStream<String> requests = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "cplm-on-demand-request-source")
                .uid("cplm-on-demand-request-source");

        SingleOutputStreamOperator<String> status = requests
                .keyBy(OnDemandEvaluationFunction::keyOf)
                .process(new OnDemandEvaluationFunction(
                        // credentials null: read from the TaskManager's environment at request time (CHG-036 names)
                        new EvaluationSources.IotDbHistorian(iotdbHost, iotdbPort, null, null),
                        new EvaluationSources.KafkaParameters(brokers),
                        settings(params, envVars),
                        System::currentTimeMillis))
                .name("cplm-on-demand-evaluate")
                .uid("cplm-on-demand-evaluate");

        status.sinkTo(KafkaSinks.keyedByJsonField(brokers, statusTopic, "analysis_run_id"))
                .name("cplm-on-demand-status-sink").uid("cplm-on-demand-status-sink");
        status.getSideOutput(OnDemandEvaluationFunction.RESULTS)
                .sinkTo(KafkaSinks.keyedByJsonField(brokers, resultTopic, "loop_id"))
                .name("cplm-on-demand-result-sink").uid("cplm-on-demand-result-sink");
        status.getSideOutput(OnDemandEvaluationFunction.EVIDENCE)
                .sinkTo(KafkaSinks.keyedByJsonField(brokers, evidenceTopic, EvidenceKafkaRecords.KEY_FIELD))
                .name("cplm-on-demand-evidence-sink").uid("cplm-on-demand-evidence-sink");
    }
}
