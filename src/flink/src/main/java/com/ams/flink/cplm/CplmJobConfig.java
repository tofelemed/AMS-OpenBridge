package com.ams.flink.cplm;

import java.util.HashMap;
import java.util.Map;

/** Shared CLI configuration for CPLM Flink jobs. */
public final class CplmJobConfig {
    public final String brokers;
    public final String jobName;
    public final String consumerGroupId;
    public final String inputTopic;
    public final String outputTopic;
    public final String shortFeatureTopic;
    public final String longFeatureTopic;
    public final int windowHours;
    public final int outOfOrdernessMinutes;

    public CplmJobConfig(String brokers, String jobName, String consumerGroupId,
                         String inputTopic, String outputTopic,
                         String shortFeatureTopic, String longFeatureTopic,
                         int windowHours, int outOfOrdernessMinutes) {
        this.brokers = brokers;
        this.jobName = jobName;
        this.consumerGroupId = consumerGroupId;
        this.inputTopic = inputTopic;
        this.outputTopic = outputTopic;
        this.shortFeatureTopic = shortFeatureTopic;
        this.longFeatureTopic = longFeatureTopic;
        this.windowHours = windowHours;
        this.outOfOrdernessMinutes = outOfOrdernessMinutes;
    }

    public static CplmJobConfig fromArgs(String[] args) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < args.length - 1; i += 2) {
            String key = args[i].startsWith("--") ? args[i].substring(2) : args[i];
            m.put(key, args[i + 1]);
        }
        return new CplmJobConfig(
                m.getOrDefault("bootstrap.servers", System.getenv().getOrDefault("KAFKA_BROKERS", "kafka:9092")),
                m.getOrDefault("job-name", "AMS - CPLM Job"),
                m.getOrDefault("consumer-group-id", "flink-ams-cplm"),
                m.getOrDefault("input-topic", "clpm.normalized.samples.v1"),
                m.getOrDefault("output-topic", "clpm.gate.results.v1"),
                m.getOrDefault("short-feature-topic", "clpm.feature.short.v1"),
                m.getOrDefault("long-feature-topic", "clpm.feature.long.v1"),
                parseInt(m.getOrDefault("window-hours", "24"), 24),
                parseInt(m.getOrDefault("out-of-orderness-minutes", "2"), 2)
        );
    }

    private static int parseInt(String raw, int def) {
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
