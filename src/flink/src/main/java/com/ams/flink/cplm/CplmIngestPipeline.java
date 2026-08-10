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

        // withIdleness: keyed backfills land on one Kafka partition; idle partitions
        // must not stall event-time watermarks (otherwise long-job timers never fire).
        WatermarkStrategy<CplmNormalizedSample> wm = WatermarkStrategy
                .<CplmNormalizedSample>forBoundedOutOfOrderness(Duration.ofMinutes(cfg.outOfOrdernessMinutes))
                .withIdleness(Duration.ofMinutes(1))
                .withTimestampAssigner((event, ts) -> event.eventTsMs);

        // STR-11: uid() mirrors name() so savepoints survive topology changes.
        // sourceOperatorName is per-job, which keeps these unique across the CPLM jobs
        // that share this pipeline builder.
        DataStream<CplmNormalizedSample> parsed = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), sourceOperatorName)
                .uid(sourceOperatorName + "-source")
                .map(CplmNormalizedSample::fromJson)
                .name(sourceOperatorName + "-parse")
                .uid(sourceOperatorName + "-parse")
                .filter(s -> s != null && s.isValid)
                .name(sourceOperatorName + "-quality-filter")
                .uid(sourceOperatorName + "-quality-filter");

        // Connect profiles before assigning event-time watermarks so the
        // no-watermark configuration stream cannot hold back window timers.
        return CplmParameterSetBroadcastSupport.connectSampleProfiles(parsed, env, cfg)
                .assignTimestampsAndWatermarks(wm)
                .name(sourceOperatorName + "-watermarks")
                .uid(sourceOperatorName + "-watermarks");
    }
}
