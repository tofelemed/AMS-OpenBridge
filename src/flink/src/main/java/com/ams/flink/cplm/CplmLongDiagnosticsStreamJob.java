package com.ams.flink.cplm;

import org.apache.flink.api.common.state.ListState;
import org.apache.flink.api.common.state.ListStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.util.OutputTag;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import com.ams.flink.cplm.evidence.LongArtifacts;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import com.ams.flink.cplm.engine.LongDiagnosticsCalculator;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Stage 2 — Long-diagnostics job: rolling 4h/12h/24h windows via KeyedProcessFunction
 * (NOT built-in sliding windows — see build prompt §2.2).
 *
 * <p>Key by loop_id, maintain ListState rolling buffer evicted at event_ts - 24h - 10min cushion,
 * register event-time timers on 15-minute cadence, compute the 4h, 12h and 24h slices on each
 * timer. A slice with fewer than {@link #MIN_SAMPLES} samples is not emitted at all, which is the
 * usual reason a sparse loop never produces a verdict.
 *
 * <p>Only the 12h and 24h records trigger the fusion engine — see
 * {@code CplmGateFusionStreamJob.processElement2}. The API mirrors all of this in
 * {@code GET /api/v1/cpm/resolutions}; keep the two in step.
 *
 * <p>Source: cplm-normalized-source (existing topic, independent consumer group).
 * Sink: traverse.cpa.clpm.feature.long.v1 (matches existing topic name in CplmJobConfig defaults).
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
        cfg = cfg.forJob("AMS - CPLM Long Diagnostics Engine", "-long", null);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(300_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(120_000);
        env.getCheckpointConfig().setCheckpointTimeout(600_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        build(env, cfg, args);
        env.execute(cfg.jobName);
    }

    /** The job graph without execution (a test inspects its operator order). */
    public static void build(StreamExecutionEnvironment env, CplmJobConfig cfg, String[] args) {
        DataStream<CplmNormalizedSample> normalized = CplmIngestPipeline.build(env, cfg, "cplm-long-normalized-source");

        // v2.5 (2F.1): every sample also reaches the loops that list its loop as a peer (tagged
        // peerOfLoopId), so one keyed window holds a loop's own samples AND its peers' for G13.
        DataStream<CplmNormalizedSample> withPeers = CplmPeerFanoutSupport.connectPeerFanout(normalized, env, cfg);

        SingleOutputStreamOperator<CplmLongDiagnosticsResult> processed = withPeers
                .keyBy(CplmPeerFanoutSupport::windowKey)
                .process(new LongDiagnosticsProcessFunction(EvidencePolicy.fromArgs(args)))
                .name("cplm-long-diagnostics-keyed-process")
                .uid("cplm-long-diagnostics-keyed-process");
        DataStream<String> diagnostics = processed
                .map(CplmLongDiagnosticsResult::toJson)
                .name("cplm-long-diagnostics-serialize")
                .uid("cplm-long-diagnostics-serialize");

        // v2.5 (1G.3): evidence artifacts (manifest + chunks, keyed by method_run_id) ride a
        // side output to the evidence topic; the results topic stays exactly as it was.
        String evidenceTopic = argOr(args, "--evidence-topic", CplmTopics.GATE_EVIDENCE);
        DataStream<String> evidence = processed.getSideOutput(LongDiagnosticsProcessFunction.EVIDENCE);
        CplmKafkaSink.attachKeyed(evidence, cfg, evidenceTopic, "cplm-long-evidence-sink", EvidenceKafkaRecords.KEY_FIELD);

        // Keyed by loop_id (audit-jobs.md A-F1): fusion's family-history persistence
        // is order-sensitive per loop; unkeyed records round-robined across the
        // 8 partitions could arrive out of emission order.
        CplmKafkaSink.attachKeyed(diagnostics, cfg, cfg.longFeatureTopic, "cplm-long-diagnostics-sink", "loop_id");
        // v2.5 (3A.2): announce what this job can be configured with (readable property ids, catalogue hash,
        // compiled capacity) on the gate-config ACK topic at every start - capability from the RUNNING job
        com.ams.flink.cplm.config.CapabilityRecord.announce(env, cfg, cfg.jobName, args);
    }

    private static String argOr(String[] args, String name, String def) {
        for (int i = 0; i + 1 < args.length; i++) if (name.equals(args[i])) return args[i + 1];
        return def;
    }

    /**
     * KeyedProcessFunction implementing the rolling-buffer long diagnostics.
     * <p>
     * Per build prompt §2.2: maintain ListState rolling buffer per loop_id,
     * evict at event_ts - 24h - 10min, register event-time timers every 15 minutes,
     * compute 4h + 12h + 24h slices from buffer on each timer firing.
     * <p>
     * State size estimate: ~0.83–1.38 MB per loop at 5s sampling over 24h (17,280 samples).
     */
    static class LongDiagnosticsProcessFunction
            extends KeyedProcessFunction<String, CplmNormalizedSample, CplmLongDiagnosticsResult> {

        /** v2.5 (1G.3): evidence records (EvidenceKafkaRecords JSON) leave through this side output. */
        static final OutputTag<String> EVIDENCE = new OutputTag<String>("cplm-long-evidence") {
        };
        private static final ObjectMapper MAPPER = new ObjectMapper();
        private final EvidencePolicy policy;

        private transient ListState<CplmNormalizedSample> rollingBuffer;
        /** v2.5 (2F.1): the peers' samples fanned out to this loop (peerOfLoopId == this key). */
        private transient ListState<CplmNormalizedSample> peerBuffer;
        private transient ValueState<Long> nextTimerTs;

        LongDiagnosticsProcessFunction() {
            this(new EvidencePolicy(EvidencePolicy.Mode.EPISODES));
        }

        LongDiagnosticsProcessFunction(EvidencePolicy policy) {
            this.policy = policy;
        }

        /** v2.5 (2C.1c): every gate's exact intermediates (LongArtifacts) when the policy says so; the
         *  intermediates are transient, so this runs before the result leaves the operator. */
        private void emitEvidence(OnTimerContext ctx, CplmLongDiagnosticsResult r, long nowMs) {
            if (!policy.emit(r)) return;
            for (EvidenceArtifact a : LongArtifacts.artifacts(r, policy.maxCycles)) {
                for (String record : EvidenceKafkaRecords.records(a, MAPPER, nowMs)) ctx.output(EVIDENCE, record);
            }
        }

        @Override
        public void open(Configuration parameters) {
            rollingBuffer = getRuntimeContext().getListState(
                    new ListStateDescriptor<>("cplm-rolling-buffer",
                            TypeInformation.of(CplmNormalizedSample.class)));
            peerBuffer = getRuntimeContext().getListState(
                    new ListStateDescriptor<>("cplm-peer-buffer",
                            TypeInformation.of(CplmNormalizedSample.class)));
            nextTimerTs = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("next-timer-ts", Long.class));
        }

        @Override
        public void processElement(CplmNormalizedSample sample, Context ctx,
                                   Collector<CplmLongDiagnosticsResult> out) throws Exception {
            if (sample.peerOfLoopId != null) {
                // a peer's sample: buffered for G13, never a timer trigger (the loop's own cadence drives)
                peerBuffer.add(sample);
                return;
            }
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

            // v2.5 (2F.1): the peers' samples over the same retention, grouped by peer; the configured
            // peer list is the one the newest own sample carried from the registry broadcast
            List<CplmNormalizedSample> peerRetained = new ArrayList<>();
            Map<String, List<CplmNormalizedSample>> peersById = new HashMap<>();
            for (CplmNormalizedSample s : peerBuffer.get()) {
                if (s.eventTsMs < evictBefore) continue;
                peerRetained.add(s);
                peersById.computeIfAbsent(s.loopId, k -> new ArrayList<>()).add(s);
            }
            peerBuffer.update(peerRetained);
            CplmNormalizedSample newest = retained.isEmpty() ? null : retained.get(retained.size() - 1);
            LongDiagnosticsCalculator.PeerContext peers = new LongDiagnosticsCalculator.PeerContext(
                    newest == null ? null : newest.configuredPeers, peersById, newest == null ? 0 : newest.relationshipRevision);

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
                        slice4h, cutoff4h, timestamp, "4h", null, peers);
                r4h.alignedShort = CplmGateEngine.computeShortFeatures(
                        slice4h, cutoff4h, timestamp, "4h");
                out.collect(r4h);
                emitEvidence(ctx, r4h, timestamp);
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
                        slice12h, cutoff12h, timestamp, "12h", null, peers);
                r12h.alignedShort = CplmGateEngine.computeShortFeatures(
                        slice12h, cutoff12h, timestamp, "12h");
                out.collect(r12h);
                emitEvidence(ctx, r12h, timestamp);
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
                        slice24h, cutoff24h, timestamp, "24h", null, peers);
                r24h.alignedShort = CplmGateEngine.computeShortFeatures(
                        slice24h, cutoff24h, timestamp, "24h");
                out.collect(r24h);
                emitEvidence(ctx, r24h, timestamp);
            }

            // Register the next cadence timer. CRITICAL: skip ahead when the
            // watermark has already moved past it. Stepping strictly +15 min
            // means an event-time gap (a historical backfill, or any idle
            // period) forces one firing per 15 minutes of gap - an 11-day gap
            // is ~1,056 sequential firings, each rescanning the whole 24h
            // buffer. The job then cannot complete a checkpoint, restarts, and
            // replays the same timers forever, so no window past the gap is
            // ever emitted. Jumping to the watermark collapses that to one.
            long next = timestamp + TIMER_INTERVAL_MS;
            long watermark = ctx.timerService().currentWatermark();
            if (watermark >= next) {
                next = ((watermark / TIMER_INTERVAL_MS) + 1) * TIMER_INTERVAL_MS;
            }
            ctx.timerService().registerEventTimeTimer(next);
            nextTimerTs.update(next);
        }
    }
}
