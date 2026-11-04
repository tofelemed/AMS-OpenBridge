package com.ams.flink.cplm.ondemand;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

/**
 * CHG-102 5c: the status record of one evaluation ({@code traverse.cpa.clpm.evaluation.status.v1}, schema
 * {@code cplm.evaluation.status.v1}, keyed by analysis_run_id): RUNNING when the work starts, then SUCCEEDED or FAILED.
 * Every field is always present; error is "CODE: detail" on FAILED, null otherwise.
 */
public final class EvaluationStatus {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    public static final String SCHEMA = "cplm.evaluation.status.v1";
    public static final String RUNNING = "RUNNING";
    public static final String SUCCEEDED = "SUCCEEDED";
    public static final String FAILED = "FAILED";

    private EvaluationStatus() {}

    public static String json(EvaluationRequest r, String state, int samples, int artifacts, Map<String, String> methodRunIds,
                              String error, long elapsedMs, long atMs) {
        ObjectNode o = MAPPER.createObjectNode();
        o.put("schema", SCHEMA);
        o.put("analysis_run_id", r.analysisRunId);
        o.put("loop_id", r.loopId);
        o.put("state", state);
        o.put("window_kind", r.windowKind);
        o.put("window_start_ms", r.fromMs);
        o.put("window_end_ms", r.toMs);
        o.put("samples", samples);
        o.put("artifacts", artifacts);
        ObjectNode runs = o.putObject("method_run_ids");
        if (methodRunIds != null) for (Map.Entry<String, String> e : methodRunIds.entrySet()) runs.put(e.getKey(), e.getValue());
        if (error == null) o.putNull("error"); else o.put("error", error);
        o.put("elapsed_ms", Math.max(0L, elapsedMs));
        o.put("at_ms", atMs);
        try {
            return MAPPER.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String running(EvaluationRequest r, long atMs) {
        return json(r, RUNNING, 0, 0, null, null, 0L, atMs);
    }

    public static String failed(EvaluationRequest r, String error, int samples, long elapsedMs, long atMs) {
        return json(r, FAILED, samples, 0, null, error, elapsedMs, atMs);
    }
}
