package com.ams.flink.cplm;

import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.evidence.EvidencePolicy;

/**
 * Stage 1 — Short-feature job (Gates 0–4): 1m tumbling + five sliding windows.
 *
 * <p>All six kinds come from one keyed operator ({@link ShortFeatureBufferFn}, CHG-039) that holds each
 * loop's samples once and fires every kind from that buffer with Flink's window semantics. Only 1m is a
 * TUMBLING window — every other kind is a sliding window whose records overlap their neighbours (a
 * consumer must never sum/average across kinds). Kinds, sizes and lateness live in {@link ShortWindowSpecs}:
 * <ul>
 *   <li>1m tumbling                — allowed lateness 30s</li>
 *   <li>5m sliding  / 1 min slide  — allowed lateness 60s</li>
 *   <li>10m sliding / 2 min slide  — allowed lateness 90s</li>
 *   <li>15m sliding / 5 min slide  — allowed lateness 2min</li>
 *   <li>30m sliding / 5 min slide  — allowed lateness 2min</li>
 *   <li>60m sliding / 5 min slide  — allowed lateness 3min</li>
 * </ul>
 * This list is mirrored by cplm-api's window contract
 * ({@code CpmAnalyticsController.WindowSpecs}, served at /api/v1/cpm/resolutions)
 * — keep the two in step when adding or changing a kind.
 *
 * <p>Source: the normalized loop-sample topic (submitters pass
 * {@code --input-topic traverse.cpa.loop.samples.v1}).
 * Sink: traverse.cpa.clpm.feature.short.v1, keyed by loop_id.
 */
public class CplmShortFeatureStreamJob {

    /**
     * CHG-038 (Marun 2026-09-27 / 10-03 / 10-04): the job fell a few minutes behind three times and never recovered.
     * With Flink's default of zero tolerated checkpoint failures, one expired aligned checkpoint (5 min) failed the
     * job, the restore rewound Kafka to the last good checkpoint, the backlog grew and the next checkpoint expired too
     * (32 completed vs 212 failed, 14 h behind). So: an expired checkpoint is tolerated, the barrier overtakes the
     * backlog (unaligned after a 30 s aligned attempt - exactly-once is kept), and a checkpoint gets 15 minutes.
     *
     * <p>CHG-039 (Marun 2026-10-05): the job overrode the cluster's DELETE_ON_CANCELLATION with RETAIN, so every
     * cancel or redeploy left its whole checkpoint tree in MinIO (4.1 GB found, 3 GB free on the disk). It now
     * follows the cluster rule; a restore from a cancelled job's checkpoint is not a workflow at the plant.
     */
    static void configureCheckpointing(StreamExecutionEnvironment env) {
        env.enableCheckpointing(180_000, CheckpointingMode.EXACTLY_ONCE);
        CheckpointConfig c = env.getCheckpointConfig();
        c.setMinPauseBetweenCheckpoints(60_000);
        c.setCheckpointTimeout(900_000);
        c.setTolerableCheckpointFailureNumber(1_000);
        c.enableUnalignedCheckpoints(true);
        c.setAlignedCheckpointTimeout(java.time.Duration.ofSeconds(30));
        c.setExternalizedCheckpointCleanup(CheckpointConfig.ExternalizedCheckpointCleanup.DELETE_ON_CANCELLATION);
    }

    /**
     * CHG-039: this job alone keeps its state on the heap; the cluster default (RocksDB) stays for the others.
     * Its state is the per-loop window buffer, ~250 MB of live heap at 144 loops (full checkpoint ~116 MB). On RocksDB
     * with Marun's ~45 MB of managed memory per slot every access serialized a heavy tuple and writes stalled:
     * 47 samples/s per core, against 804/s on the heap (ShortWindowBacklogBench, real tuples, 90-min buffer). The
     * TaskManager's task heap was raised to ~1.1 GB for it (process 3584m). Checkpoint storage stays the cluster's.
     */
    static void configureStateBackend(StreamExecutionEnvironment env) {
        env.setStateBackend(new HashMapStateBackend());
    }

    public static void main(String[] args) throws Exception {
        CplmJobConfig cfg = CplmJobConfig.fromArgs(args);
        cfg = cfg.forJob("AMS - CPLM Short Feature Engine", "-short", null);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        configureCheckpointing(env);
        configureStateBackend(env);

        build(env, cfg, args);
        env.execute(cfg.jobName);
    }

    /** The job graph without execution (a test inspects its operators). */
    public static void build(StreamExecutionEnvironment env, CplmJobConfig cfg, String[] args) {
        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-short-normalized-source");
        // v2.5 (2C.1c): every window emits its gates' exact intermediates on a side output when the
        // policy says so (findings by default, --evidence-emit all|episodes|none); one evidence sink.
        EvidencePolicy policy = EvidencePolicy.fromArgs(args);
        String evidenceTopic = argOr(args, "--evidence-topic", CplmTopics.GATE_EVIDENCE);
        // CHG-061b: the hard per-loop buffer cap; 0 (default) derives it from each sample's declared grid
        int maxSamplesPerLoop = Integer.parseInt(argOr(args, "--short-max-samples-per-loop", "0"));

        SingleOutputStreamOperator<CplmShortFeatureResult> windowed = normalized
                .keyBy(s -> s.loopId)
                .process(new ShortFeatureBufferFn(policy, maxSamplesPerLoop))
                .name("cplm-short-windows")
                .uid("cplm-short-windows");
        DataStream<String> results = windowed
                .map(CplmShortFeatureResult::toJson)
                .name("cplm-short-serialize")
                .uid("cplm-short-serialize");

        // Keyed by loop_id (audit.md F-2, same class as PIPE-010): all of one loop's windows land on one
        // partition, so downstream consumers see them in emission order.
        CplmKafkaSink.attachKeyed(results, cfg, cfg.shortFeatureTopic, "cplm-short-feature-sink", "loop_id");
        CplmKafkaSink.attachKeyed(windowed.getSideOutput(ShortFeatureEmitter.EVIDENCE), cfg, evidenceTopic,
                "cplm-short-evidence-sink", com.ams.flink.cplm.evidence.EvidenceKafkaRecords.KEY_FIELD);

        // v2.5 (3A.2): announce what this job can be configured with (readable property ids, catalogue hash,
        // compiled capacity) on the gate-config ACK topic at every start - capability from the RUNNING job
        com.ams.flink.cplm.config.CapabilityRecord.announce(env, cfg, cfg.jobName, args);
    }

    private static String argOr(String[] args, String key, String def) {
        for (int i = 0; i + 1 < args.length; i++) if (key.equals(args[i])) return args[i + 1];
        return def;
    }
}
