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
    /** v2.5 (3C.1): the governed-configuration control plane - bundle topic, ACK topic, the HMAC key the worker verifies bundles with, the site the job serves. */
    public final String gateConfigTopic;
    public final String gateConfigAcksTopic;
    public final String gateConfigKey;
    public final String site;

    public CplmJobConfig(String brokers, String jobName, String consumerGroupId,
                         String inputTopic, String outputTopic,
                         String shortFeatureTopic, String longFeatureTopic,
                         int windowHours, int outOfOrdernessMinutes) {
        this(brokers, jobName, consumerGroupId, inputTopic, outputTopic, shortFeatureTopic, longFeatureTopic, windowHours, outOfOrdernessMinutes,
                com.ams.flink.cplm.contract.CplmTopics.GATE_CONFIG, com.ams.flink.cplm.contract.CplmTopics.GATE_CONFIG_ACKS, envKey(), envSite());
    }

    public CplmJobConfig(String brokers, String jobName, String consumerGroupId,
                         String inputTopic, String outputTopic,
                         String shortFeatureTopic, String longFeatureTopic,
                         int windowHours, int outOfOrdernessMinutes,
                         String gateConfigTopic, String gateConfigAcksTopic, String gateConfigKey, String site) {
        this.brokers = brokers;
        this.jobName = jobName;
        this.consumerGroupId = consumerGroupId;
        this.inputTopic = inputTopic;
        this.outputTopic = outputTopic;
        this.shortFeatureTopic = shortFeatureTopic;
        this.longFeatureTopic = longFeatureTopic;
        this.windowHours = windowHours;
        this.outOfOrdernessMinutes = outOfOrdernessMinutes;
        this.gateConfigTopic = gateConfigTopic;
        this.gateConfigAcksTopic = gateConfigAcksTopic;
        this.gateConfigKey = gateConfigKey == null ? "" : gateConfigKey;
        this.site = site == null ? "" : site;
    }

    /** The same configuration under a job name / consumer-group suffix / output topic; the control-plane settings are kept (3C.1). */
    public CplmJobConfig forJob(String name, String groupSuffix, String output) {
        return new CplmJobConfig(brokers, name, consumerGroupId + groupSuffix, inputTopic, output == null ? outputTopic : output,
                shortFeatureTopic, longFeatureTopic, windowHours, outOfOrdernessMinutes, gateConfigTopic, gateConfigAcksTopic, gateConfigKey, site);
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
                m.getOrDefault("consumer-group-id", "traverse-cpa-flink-cplm"),
                // Default = the LIVE samples topic. The old default
                // (traverse.cpa.clpm.normalized.samples.v1) had no producer, so a
                // submit that forgot --input-topic consumed an auto-created empty
                // topic and produced nothing, with no error (audit.md F-5).
                m.getOrDefault("input-topic", "traverse.cpa.loop.samples.v1"),
                m.getOrDefault("output-topic", "traverse.cpa.clpm.gate.results.v1"),
                m.getOrDefault("short-feature-topic", "traverse.cpa.clpm.feature.short.v1"),
                m.getOrDefault("long-feature-topic", "traverse.cpa.clpm.feature.long.v1"),
                parseInt(m.getOrDefault("window-hours", "24"), 24),
                parseInt(m.getOrDefault("out-of-orderness-minutes", "2"), 2),
                m.getOrDefault("gate-config-topic", com.ams.flink.cplm.contract.CplmTopics.GATE_CONFIG),
                m.getOrDefault("gate-config-acks-topic", com.ams.flink.cplm.contract.CplmTopics.GATE_CONFIG_ACKS),
                m.getOrDefault("gate-config-key", envKey()),
                m.getOrDefault("site", envSite())
        );
    }

    /** The bundle-signing key: CPLM_GATE_CONFIG_KEY, else the platform service key (what cplm-api signs with). Empty = every bundle is NACKed UNSIGNED. */
    static String envKey() {
        String k = System.getenv("CPLM_GATE_CONFIG_KEY");
        if (k == null || k.isBlank()) k = System.getenv("TRAVERSE_SERVICE_KEY");
        return k == null ? "" : k.trim();
    }

    static String envSite() {
        String s = System.getenv("CPLM_SITE");
        if (s == null || s.isBlank()) s = System.getenv("TRAVERSE_SITE");
        return s == null ? "" : s.trim();
    }

    private static int parseInt(String raw, int def) {
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
