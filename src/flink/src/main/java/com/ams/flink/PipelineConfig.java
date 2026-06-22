package com.ams.flink;

import java.util.HashMap;
import java.util.Map;

/** Per-operator parallelism — no global parallelism override. */
public final class PipelineConfig {
    public final String brokers;
    public final String dbUrl;
    public final String dbUser;
    public final String dbPass;
    public final String rawAlarmsStartingOffsets;

    public final int rawSource;
    public final int validation;
    public final int dedup;
    public final int enrichment;
    public final int soe;
    public final int lifecycle;
    public final int flood;
    public final int kpi;
    public final int correlation;
    public final int ackProcessor;
    public final int projection;

    private PipelineConfig(
            String brokers, String dbUrl, String dbUser, String dbPass, String rawAlarmsStartingOffsets,
            int rawSource, int validation, int dedup, int enrichment, int soe, int lifecycle,
            int flood, int kpi, int correlation, int ackProcessor, int projection) {
        this.brokers = brokers;
        this.dbUrl = dbUrl;
        this.dbUser = dbUser;
        this.dbPass = dbPass;
        this.rawAlarmsStartingOffsets = rawAlarmsStartingOffsets;
        this.rawSource = rawSource;
        this.validation = validation;
        this.dedup = dedup;
        this.enrichment = enrichment;
        this.soe = soe;
        this.lifecycle = lifecycle;
        this.flood = flood;
        this.kpi = kpi;
        this.correlation = correlation;
        this.ackProcessor = ackProcessor;
        this.projection = projection;
    }

    public static PipelineConfig fromArgs(String[] args) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < args.length - 1; i += 2) {
            String key = args[i].startsWith("--") ? args[i].substring(2) : args[i];
            m.put(key, args[i + 1]);
        }
        String rawOffsets = m.getOrDefault("raw-alarms.starting-offsets", "earliest");
        int normalization = m.containsKey("parallelism.normalization")
                ? parseInt(m, "parallelism.normalization", 4)
                : parseInt(m, "parallelism.enrichment", 4);
        int projection = m.containsKey("parallelism.projection")
                ? parseInt(m, "parallelism.projection", 2)
                : parseInt(m, "parallelism.current-sink", 2);
        int ack = m.containsKey("parallelism.ack")
                ? parseInt(m, "parallelism.ack", 2)
                : parseInt(m, "parallelism.ack-results", 2);
        int correlation = m.containsKey("parallelism.correlation")
                ? parseInt(m, "parallelism.correlation", 2)
                : parseInt(m, "parallelism.cep", 2);
        return new PipelineConfig(
                m.getOrDefault("bootstrap.servers", System.getenv().getOrDefault("KAFKA_BROKERS", "kafka:9092")),
                System.getenv().getOrDefault("DB_URL", "jdbc:postgresql://postgres:5432/ams"),
                System.getenv().getOrDefault("DB_USER", "ams_user"),
                System.getenv().getOrDefault("DB_PASS", "supersecurepassword123"),
                rawOffsets,
                parseInt(m, "parallelism.raw-ingest", 4),
                parseInt(m, "parallelism.validation", 4),
                parseInt(m, "parallelism.dedup", 4),
                normalization,
                parseInt(m, "parallelism.soe", 2),
                parseInt(m, "parallelism.lifecycle", 2),
                parseInt(m, "parallelism.flood", 2),
                parseInt(m, "parallelism.kpi", 1),
                correlation,
                ack,
                projection
        );
    }

    private static int parseInt(Map<String, String> m, String key, int defaultValue) {
        if (!m.containsKey(key)) return defaultValue;
        try {
            return Integer.parseInt(m.get(key));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
