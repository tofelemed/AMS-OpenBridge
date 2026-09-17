package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;

/**
 * v2.5 Task 3C.1 (spec v6 §5.6): a worker's PREPARE / APPLY acknowledgement on
 * traverse.cpa.context.gate-config.acks.v1, keyed by bundle_id like the CAPABILITY record. The
 * control plane (cplm-api CplmConfigAckConsumerService) records it against the deployment and its
 * job / subtask, with the jar and topology that answered, so mixed jars or a missing member are
 * visible and never "verified" (NR-051).
 */
public final class ConfigAck {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ConfigAck() {}

    /** Who is answering: the job, its subtask, the build and the topology generation it runs in. */
    public static final class WorkerIdentity implements Serializable {
        private static final long serialVersionUID = 1L;
        public final String jobName;
        public final int subtaskIndex;
        public final String jarSha256;
        public final String sourceCommit;
        public final String topologyGeneration;

        public WorkerIdentity(String jobName, int subtaskIndex, String jarSha256, String sourceCommit, String topologyGeneration) {
            this.jobName = jobName;
            this.subtaskIndex = subtaskIndex;
            this.jarSha256 = jarSha256;
            this.sourceCommit = sourceCommit;
            this.topologyGeneration = topologyGeneration;
        }
    }

    public static String ack(WorkerIdentity id, String deploymentId, String bundleId, String phase, String bundleHash) {
        return record("ACK", id, deploymentId, bundleId, phase, bundleHash, null);
    }

    public static String nack(WorkerIdentity id, String deploymentId, String bundleId, String phase, String bundleHash, String reason) {
        return record("NACK", id, deploymentId, bundleId, phase, bundleHash, reason);
    }

    private static String record(String kind, WorkerIdentity id, String deploymentId, String bundleId, String phase, String bundleHash, String reason) {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("record_kind", kind);
        n.put("deployment_id", deploymentId == null ? "" : deploymentId);
        n.put("bundle_id", bundleId == null ? "" : bundleId);
        n.put("job_name", id.jobName);
        n.put("subtask_index", id.subtaskIndex);
        n.put("phase", phase);
        n.put("status", kind);
        n.put("bundle_hash", bundleHash == null ? "" : bundleHash);
        n.put("jar_sha256", id.jarSha256);
        n.put("source_commit", id.sourceCommit);
        n.put("topology_generation", id.topologyGeneration);
        if (reason != null) n.put("reason", reason);
        n.put("emitted_at_ms", System.currentTimeMillis());
        return n.toString();
    }
}
