package com.ams.sparkplug;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Sparkplug B Edge Node publisher — entry point.
 *
 * Architecture:
 *   Kafka (live.alarms, live.metrics)
 *       ↓  AlarmMetricPublisher
 *   EMQX  (spBv1.0/ams_site1/NBIRTH|DBIRTH|DDATA/ams_edge1/...)
 *       ↓  also writes
 *   Redis (snapshot:metric:*, alias:*)
 *
 * Spec reference: Traverse Edge Platform Specification §8.3 — Sparkplug B bridge.
 */
public class SparkplugEdgeNode {

    private static final Logger LOG = LoggerFactory.getLogger(SparkplugEdgeNode.class);

    public static void main(String[] args) {
        LOG.info("Starting AMS Sparkplug Edge Node...");
        SparkplugConfig cfg = SparkplugConfig.fromEnv();

        LOG.info("Config: kafka={}, group={}/{}, mqtt={}",
                cfg.kafkaBrokers, cfg.sparkplugGroup, cfg.sparkplugEdge, cfg.mqttBrokerUri());

        Runtime.getRuntime().addShutdownHook(new Thread(() ->
                LOG.info("Sparkplug Edge Node shutting down...")));

        AlarmMetricPublisher publisher = new AlarmMetricPublisher(cfg);
        publisher.start();  // blocks; handles MQTT reconnect + Kafka poll loop internally
    }
}
