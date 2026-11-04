package com.ams.flink.cplm.ondemand;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.util.UUID;

/**
 * CHG-102 5c: one on-demand evaluation request ({@code traverse.cpa.clpm.evaluation.requests.v1}, schema
 * {@code cplm.evaluation.request.v1}, keyed by loop_id), written by cplm-api's {@code POST analysis-runs purpose=EVALUATE}.
 *
 * <p>{@link #parse} never throws. A request without a valid analysis_run_id cannot be answered (the status topic is
 * keyed by it) and is dropped with a log line; any other defect sets {@link #rejection} ("CODE: detail") and the job
 * answers FAILED with it.
 */
public final class EvaluationRequest implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    public static final String SCHEMA = "cplm.evaluation.request.v1";
    public static final String MODE_EVALUATE = "EVALUATE";
    /** The longest support one request may ask for (the longest window kind). */
    public static final long MAX_SPAN_MS = 24L * 3600_000L;

    public String analysisRunId;
    public String mode;
    public String loopId;
    public String site;
    public String loopType;
    public String windowKind;
    public long fromMs;
    public long toMs;
    public String iotdbDevice;
    public boolean hasStepTest;
    public boolean hasPeerLinks;
    public String bundleHash;
    public String bundlePropertiesB64;
    public long requestedAtMs;
    /** Null = valid; else "INVALID_REQUEST: ..." or "UNSUPPORTED_MODE: ..." (the FAILED status's error). */
    public String rejection;

    /** 4h / 12h / 24h in ms; 0 for anything else. */
    public static long kindMs(String kind) {
        if ("4h".equals(kind)) return 4L * 3600_000L;
        if ("12h".equals(kind)) return 12L * 3600_000L;
        if ("24h".equals(kind)) return 24L * 3600_000L;
        return 0L;
    }

    public static EvaluationRequest parse(String json) {
        EvaluationRequest r = new EvaluationRequest();
        JsonNode root;
        try {
            root = json == null ? null : MAPPER.readTree(json);
        } catch (Exception e) {
            root = null;
        }
        if (root == null || !root.isObject()) {
            r.rejection = "INVALID_REQUEST: not a JSON object";
            return r;
        }
        String run = text(root, "analysis_run_id");
        try {
            if (run != null) r.analysisRunId = UUID.fromString(run).toString();
        } catch (IllegalArgumentException e) {
            r.analysisRunId = null;
        }
        r.mode = text(root, "mode");
        r.loopId = text(root, "loop_id");
        r.site = text(root, "site");
        r.loopType = text(root, "loop_type");
        r.windowKind = text(root, "window_kind");
        r.fromMs = root.path("from_ms").asLong(0L);
        r.toMs = root.path("to_ms").asLong(0L);
        r.iotdbDevice = text(root, "iotdb_device");
        r.hasStepTest = root.path("has_step_test").asBoolean(false);
        r.hasPeerLinks = root.path("has_peer_links").asBoolean(false);
        r.bundleHash = text(root, "bundle_hash");
        r.bundlePropertiesB64 = text(root, "bundle_properties_b64");
        r.requestedAtMs = root.path("requested_at_ms").asLong(0L);
        r.rejection = validate(r, text(root, "schema"));
        return r;
    }

    private static String validate(EvaluationRequest r, String schema) {
        if (r.analysisRunId == null) return "INVALID_REQUEST: analysis_run_id is missing or not a UUID";
        if (schema != null && !SCHEMA.equals(schema)) return "INVALID_REQUEST: unsupported schema " + schema;
        if (!MODE_EVALUATE.equals(r.mode)) return "UNSUPPORTED_MODE: " + (r.mode == null ? "(none)" : r.mode);
        if (r.loopId == null) return "INVALID_REQUEST: loop_id is required";
        if (kindMs(r.windowKind) == 0L) return "INVALID_REQUEST: window_kind must be 4h, 12h or 24h, not " + r.windowKind;
        if (r.fromMs <= 0 || r.toMs <= r.fromMs) return "INVALID_REQUEST: needs 0 < from_ms < to_ms";
        if (r.toMs - r.fromMs > MAX_SPAN_MS) return "INVALID_REQUEST: the support is longer than 24 h";
        if (r.requestedAtMs <= 0) return "INVALID_REQUEST: requested_at_ms is required";
        boolean hash = r.bundleHash != null, props = r.bundlePropertiesB64 != null;
        if (hash != props) return "INVALID_REQUEST: bundle_hash and bundle_properties_b64 come together";
        return null;
    }

    /** "REQUEST_EXPIRED: ..." when the request waited longer than maxAgeMs (a backlog after an outage), else null. */
    public String expiry(long nowMs, long maxAgeMs) {
        long age = nowMs - requestedAtMs;
        if (maxAgeMs <= 0 || age <= maxAgeMs) return null;
        return "REQUEST_EXPIRED: requested " + (age / 1000) + " s ago, the limit is " + (maxAgeMs / 1000) + " s";
    }

    private static String text(JsonNode root, String field) {
        JsonNode n = root.get(field);
        if (n == null || n.isNull()) return null;
        String s = n.asText();
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }
}
