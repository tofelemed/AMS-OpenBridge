package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmJobConfig;
import com.ams.flink.cplm.CplmKafkaSink;
import com.ams.flink.cplm.contract.CplmTopics;
import com.ams.flink.cplm.identity.BuildIdentity;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

import java.util.Map;

/**
 * v2.5 Task 3A.2 (spec v6 §5.3; NR-046): what a running job can be configured with - announced on
 * the gate-config ACK topic at every job start, keyed by the job name, so the control plane
 * reads capability from the RUNNING jobs, never from the JSON it ships with. Carries the property
 * ids the job actually applies, the catalogue hash it was built with, the compiled execution-plan
 * capacity, the role/mode combinations it supports and the build identity.
 */
public final class CapabilityRecord {
    public static final String RECORD_KIND = "CAPABILITY";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CapabilityRecord() {}

    public static String json(String jobName, String jarSha256, String sourceCommit) {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("record_kind", RECORD_KIND);
        n.put("job_name", jobName);
        n.put("bundle_id", "CAPABILITY:" + jobName);                    // the ACK topic is keyed by bundle_id; capability rides its own key
        n.put("jar_sha256", jarSha256);
        n.put("source_commit", sourceCommit);
        n.put("contract_version", BuildIdentity.CONTRACT_VERSION);
        n.put("catalogue_hash", PropertyCatalogue.current().catalogueHash());
        n.put("catalogue_count", PropertyCatalogue.current().size());
        ArrayNode ids = n.putArray("readable_property_ids");
        for (String p : PropertyReaders.forJob(jobName)) ids.add(p);
        ObjectNode unsupported = n.putObject("unsupported_property_reasons");
        for (Map.Entry<String, String> e : PropertyReaders.unsupportedInBuild().entrySet()) {
            PropertyCatalogue.Entry entry = PropertyCatalogue.current().find(e.getKey());
            if (entry != null && entry.consumers.contains(PropertyReaders.consumerOf(jobName))) unsupported.put(e.getKey(), e.getValue());
        }
        ArrayNode combos = n.putArray("supported_role_mode_combinations");
        for (String role : new String[] {"REQUIRED_CONTEXT", "PRIMARY", "SUPPORTING", "DISPLAY_ONLY", "INAPPLICABLE"}) {
            ObjectNode c = combos.addObject();
            c.put("role", role);
            c.put("mode", "OPERATIONAL");
        }
        n.set("execution_plan_capacity", ExecutionPlanCapacity.declare(MAPPER));
        n.put("emitted_at_ms", System.currentTimeMillis());
        return n.toString();
    }

    /**
     * One record per (re)start of the announce task into the ACK topic (parallelism 1, keyed by the job's capability
     * key) from an UNBOUNDED source - see {@link AnnounceOnceSource} for why a bounded one put three engines into a
     * permanent restart loop after a restore (FLINK-25920, lab 2026-09-25).
     */
    public static void announce(StreamExecutionEnvironment env, CplmJobConfig cfg, String jobName, String[] args) {
        BuildIdentity id = BuildIdentity.current();
        String record = json(jobName, id.jarSha256, id.sourceCommit);
        DataStream<String> once = env.addSource(new AnnounceOnceSource(record)).name("cplm-capability-announce").uid("cplm-capability-announce-" + jobName.hashCode());
        String topic = argOr(args, "--gate-config-acks-topic", CplmTopics.GATE_CONFIG_ACKS);
        CplmKafkaSink.attachKeyed(once, cfg, topic, "cplm-capability-sink", "bundle_id");
    }

    private static String argOr(String[] args, String name, String def) {
        for (int i = 0; i + 1 < args.length; i++) if (name.equals(args[i])) return args[i + 1];
        return def;
    }
}
