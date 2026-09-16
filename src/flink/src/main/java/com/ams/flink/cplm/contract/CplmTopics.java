package com.ams.flink.cplm.contract;

/**
 * The CPLM Kafka topic catalogue (v2.5 Task 1A.2). One place for every name the jobs
 * default to; the plant list is {@code migration/kafka/topics.txt} and the lab list
 * {@code scripts/kafka-reset-lab-topics.ps1} — keep all three in step.
 *
 * <p>Job arguments still override these (see {@code CplmJobConfig.fromArgs}); the
 * constants are the defaults, not a second configuration mechanism.
 */
public final class CplmTopics {
    private CplmTopics() {
    }

    // ── existing (schema 1.0 → 1.1 additive; v2.5 changes no names) ────────────────────
    public static final String LOOP_SAMPLES = "traverse.cpa.loop.samples.v1";
    public static final String SHORT_FEATURES = "traverse.cpa.clpm.feature.short.v1";
    public static final String LONG_FEATURES = "traverse.cpa.clpm.feature.long.v1";
    public static final String GATE_RESULTS = "traverse.cpa.clpm.gate.results.v1";
    public static final String LIVE_LOOP_METRICS = "traverse.cpa.live.loop.metrics";
    public static final String METADATA_UPDATES = "traverse.cpa.ams.metadata.updates";
    public static final String PARAMETER_SET = "traverse.cpa.context.parameter-set.v1";

    // ── new in v2.5 (registered in Phase 1/2/3 tasks; listed here so names are fixed once) ──
    public static final String CONDITION_EVENTS = "traverse.cpa.clpm.condition.v1";
    public static final String GATE_EVIDENCE = "traverse.cpa.clpm.gate.evidence.v1";
    public static final String INSTRUMENT_HEALTH = "traverse.cpa.instrument.health.v1";
    public static final String INSTRUMENT_HEALTH_CONTEXT = "traverse.cpa.context.instrument-health.v1";
    public static final String RESPONSE_RESULTS = "traverse.cpa.clpm.response.results.v1";
    public static final String GATE_CONFIG = "traverse.cpa.context.gate-config.v1";
    public static final String GATE_CONFIG_ACKS = "traverse.cpa.context.gate-config.acks.v1";
}
