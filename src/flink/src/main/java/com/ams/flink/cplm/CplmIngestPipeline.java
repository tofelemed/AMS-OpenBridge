package com.ams.flink.cplm;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

import java.time.Duration;

/** Shared normalized-sample ingest: source → map → filter → watermarks. */
public final class CplmIngestPipeline {
    private CplmIngestPipeline() {
    }

    public static DataStream<CplmNormalizedSample> build(
            StreamExecutionEnvironment env,
            CplmJobConfig cfg,
            String sourceOperatorName) {

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(cfg.inputTopic)
                .setGroupId(cfg.consumerGroupId)
                // committed offsets, earliest for a brand-new group. latest() (the CPA
                // original) silently skipped every sample published while a job was
                // down — a fresh submit after a JobManager loss dropped the backlog
                // instead of resuming. The supervisor resubmits jobs on failure, so
                // resuming from committed offsets is the correct restart semantic.
                .setStartingOffsets(OffsetsInitializer.committedOffsets(
                        org.apache.kafka.clients.consumer.OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        // Marun 2026-09-27: the strategy sits ON THE SOURCE so Flink keeps one watermark per Kafka
        // partition and takes the minimum. Assigned after the merge (the previous shape) it was one
        // "max timestamp seen" over sixteen interleaved partitions; whenever the job trailed the feed
        // the first-read partition drove it forward by minutes and the other fifteen were dropped as
        // late - 91 % of the plant's samples on the 1m window. See IngestPipelineWatermarkTest.
        WatermarkStrategy<String> sourceWm = sourceWatermarks(cfg);

        // STR-11: uid() mirrors name() so savepoints survive topology changes.
        // sourceOperatorName is per-job, which keeps these unique across the CPLM jobs
        // that share this pipeline builder.
        DataStream<CplmNormalizedSample> parsed = env
                .fromSource(source, sourceWm, sourceOperatorName)
                .uid(sourceOperatorName + "-source")
                .map(CplmNormalizedSample::fromJson)
                .name(sourceOperatorName + "-parse")
                .uid(sourceOperatorName + "-parse")
                .filter(s -> s != null && s.isValid)
                .name(sourceOperatorName + "-quality-filter")
                .uid(sourceOperatorName + "-quality-filter");

        // The profile / gate-config control streams mark themselves idle (see
        // CplmParameterSetBroadcastSupport.controlWatermarks), so the join passes the per-partition
        // sample watermark straight through and nothing re-derives it downstream.
        return CplmParameterSetBroadcastSupport.connectSampleProfiles(parsed, env, cfg);
    }

    /**
     * The per-partition sample watermark strategy, applied at the Kafka source on the RAW record so the
     * event time is known before parsing. Same bounds and idleness as {@link #watermarks(CplmJobConfig)}.
     */
    public static WatermarkStrategy<String> sourceWatermarks(CplmJobConfig cfg) {
        return WatermarkStrategy
                .<String>forBoundedOutOfOrderness(Duration.ofMinutes(cfg.outOfOrdernessMinutes))
                .withIdleness(Duration.ofMinutes(1))
                .withTimestampAssigner((raw, recordTs) -> eventTsOf(raw, recordTs));
    }

    /**
     * The sample watermark strategy. withIdleness: keyed backfills land on one Kafka partition; idle
     * partitions must not stall event-time watermarks (otherwise long-job timers never fire).
     * ANY operator that connects the samples with a no-watermark control stream (profiles, peer
     * fan-out) must re-assign this strategy downstream: a two-input operator's watermark is the
     * minimum of its inputs, and the control stream's is minus infinity - the lab long job emitted
     * nothing for an hour when the 2F.1 fan-out was connected after the assigner (2026-09-16).
     */
    /**
     * The event time of a raw sample tuple, read straight off the JSON text so the Kafka source can
     * assign it per partition BEFORE parsing (Marun 2026-09-27, see IngestPipelineWatermarkTest).
     * The ingestion producer sets no record timestamp, so the record time is only the fallback.
     */
    public static long eventTsOf(String raw, long recordTs) {
        if (raw == null) return recordTs;
        int k = raw.indexOf("\"event_ts_ms\"");
        if (k < 0) return recordTs;
        int i = raw.indexOf(':', k + 13);
        if (i < 0) return recordTs;
        i++;
        while (i < raw.length() && raw.charAt(i) == ' ') i++;
        long v = 0; boolean any = false;
        while (i < raw.length()) {
            char c = raw.charAt(i);
            if (c < '0' || c > '9') break;
            v = v * 10 + (c - '0'); any = true; i++;
        }
        return any ? v : recordTs;
    }

    public static WatermarkStrategy<CplmNormalizedSample> watermarks(CplmJobConfig cfg) {
        return WatermarkStrategy
                .<CplmNormalizedSample>forBoundedOutOfOrderness(Duration.ofMinutes(cfg.outOfOrdernessMinutes))
                .withIdleness(Duration.ofMinutes(1))
                .withTimestampAssigner((event, ts) -> event.eventTsMs);
    }
}
