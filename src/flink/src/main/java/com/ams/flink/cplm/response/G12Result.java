package com.ams.flink.cplm.response;

import com.ams.flink.cplm.response.model.Quantity;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The G12.SYSTEM_RESPONSE result (spec §2.2, §2.10): subgates A-H, evaluation/eligibility/model
 * states, every one of the 52 catalogue quantities (null WITH reason when not produced), the
 * evidence flag for an approved test record, health exclusions and the run identity block.
 * Flink POJO (public fields, no-arg constructor; the chained copy rebuilds it without a ctor).
 */
public final class G12Result implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    public static final String METHOD_ID = "G12.SYSTEM_RESPONSE";
    public static final String METHOD_VERSION = "1.0.0";
    public static final String SCORE_SEMANTICS = "EVIDENCE_SCORE_UNCALIBRATED";

    /** quantity_id -> {unit, unavailable reason} in catalogue order (xlsx_Response_quantities.tsv). */
    private static final String[][] CATALOGUE = {
        {"input_step", "input_EU", "NO_STEP_OR_UNKNOWN_INPUT"}, {"sp_step", "PV_EU", "NOT_REFERENCE_STEP"},
        {"baseline_pv", "PV_EU", "NO_VALID_BASELINE"}, {"endpoint_pv", "PV_EU", "NO_STABLE_ENDPOINT"},
        {"pre_slope", "PV_EU/s", "INSUFFICIENT_SUPPORT"}, {"post_slope", "PV_EU/s", "NO_VALID_SLOPE"},
        {"process_gain", "PV_EU/input_EU", "INTEGRATING_OR_NOT_IDENTIFIABLE"},
        {"process_gain_normalized", "dimensionless", "INVALID_SPAN_OR_GAIN"},
        {"integrating_gain", "PV_EU/(input_EU*s)", "NOT_INTEGRATING_OR_NOT_IDENTIFIABLE"},
        {"servo_gain", "dimensionless", "NO_REFERENCE_STEP_OR_ENDPOINT"},
        {"dead_time", "s", "DELAY_UNRESOLVED"}, {"time_constant", "s", "INAPPLICABLE_MODEL"},
        {"time_constant_1", "s", "INAPPLICABLE_OR_UNIDENTIFIABLE"}, {"time_constant_2", "s", "INAPPLICABLE_OR_UNIDENTIFIABLE"},
        {"damping_ratio", "dimensionless", "NOT_IDENTIFIABLE_FROM_RESPONSE"}, {"natural_frequency", "rad/s", "INAPPLICABLE_MODEL"},
        {"zero_time_constant", "s", "UNSUPPORTED_MODEL_OR_UNIDENTIFIABLE"},
        {"rise_time_10_90", "s", "CENSORED_OR_NO_ENDPOINT"}, {"settle_response", "s", "RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP"},
        {"settle_target", "s", "TARGET_NOT_REACHED_OR_NO_OBJECTIVE"}, {"overshoot", "% of response change", "NO_MEANINGFUL_RESPONSE"},
        {"undershoot", "% of response change", "NO_MEANINGFUL_RESPONSE"}, {"peak_time", "s", "NO_QUALIFIED_PEAK"},
        {"peak_pv", "PV_EU", "INSUFFICIENT_SUPPORT"}, {"steady_error", "PV_EU", "NO_STABLE_ENDPOINT"},
        {"decay_ratio", "dimensionless", "NO_QUALIFIED_PEAK_PAIR"}, {"iae", "PV_EU*s", "NO_VALID_REFERENCE_SUPPORT"},
        {"ise", "PV_EU^2*s", "NO_VALID_REFERENCE_SUPPORT"}, {"itae", "PV_EU*s^2", "NO_VALID_REFERENCE_SUPPORT"},
        {"mae_time", "PV_EU", "NO_VALID_DURATION"}, {"rmse_time", "PV_EU", "NO_VALID_DURATION"},
        {"valid_coverage", "fraction", "NO_DECLARED_INTERVAL"}, {"constraint_duration", "s", "LIMITS_UNKNOWN"},
        {"validation_rmse", "PV_EU", "NO_INDEPENDENT_VALIDATION"}, {"prediction_rmse", "PV_EU", "PREDICTOR_UNAVAILABLE"},
        {"fit_improvement", "fraction", "DEGENERATE_OR_UNSPECIFIED_BASELINE"}, {"residual_bias", "PV_EU", "NO_RESIDUAL_SUPPORT"},
        {"gain_margin", "dB", "UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING"}, {"phase_margin", "degree", "UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING"},
        {"gain_crossover", "rad/s", "NO_VALID_CROSSING"}, {"phase_crossover", "rad/s", "NO_VALID_CROSSING"},
        {"peak_sensitivity", "dimensionless", "MODEL_DOMAIN_UNAVAILABLE"},
        {"peak_complementary_sensitivity", "dimensionless", "MODEL_DOMAIN_UNAVAILABLE"},
        {"closed_loop_bandwidth", "rad/s", "NO_VALID_BANDWIDTH"},
        {"t10", "s", "CENSORED_OR_NO_ENDPOINT"}, {"t50", "s", "CENSORED_OR_NO_ENDPOINT"},
        {"t63", "s", "CENSORED_OR_NO_ENDPOINT"}, {"t90", "s", "CENSORED_OR_NO_ENDPOINT"},
        {"controller_gain", "native_units", "CONFIGURATION_UNKNOWN"}, {"controller_ti", "s", "CONFIGURATION_UNKNOWN"},
        {"controller_td", "s", "CONFIGURATION_UNKNOWN"}, {"controller_scan", "s", "CONFIGURATION_UNKNOWN"},
    };
    public static final List<String> QUANTITY_IDS;

    static {
        List<String> ids = new ArrayList<>();
        for (String[] c : CATALOGUE) ids.add(c[0]);
        QUANTITY_IDS = Collections.unmodifiableList(ids);
    }

    public static final class Subgate implements Serializable {
        private static final long serialVersionUID = 1L;
        public String state = "NOT_EVALUATED";
        public Map<String, Object> outputs = new LinkedHashMap<>();

        public Subgate() {}
    }

    public String loopId = "", pathId = "", eventId = "";
    public String evaluationState = "WAITING", eligibility = "UNKNOWN", finding = "NONE", modelState = "NONE";
    public Map<String, Subgate> subgates = new LinkedHashMap<>();
    public Map<String, Quantity> metrics = new LinkedHashMap<>();
    public boolean hasApprovedTestRecord;
    public String controllerSnapshotRef = "";
    public List<String> healthExclusions = new ArrayList<>();
    public String methodRunId = "", bundleHash = "legacy", datasetHash = "", purpose = "LIVE", analysisRunId = "";
    public int contextRevision, resultRevision = 1;
    public String sourceCommit = "", jarSha256 = "", contractVersion = "v1";
    public long windowStartMs, windowEndMs, emittedAtMs;

    public G12Result() {}

    public static G12Result empty(String loopId, String pathId) {
        G12Result g = new G12Result();
        g.loopId = loopId;
        g.pathId = pathId;
        for (String s : Arrays.asList("A", "B", "C", "D", "E", "F", "G", "H")) g.subgates.put(s, new Subgate());
        for (String[] c : CATALOGUE) g.metrics.put(c[0], Quantity.unavailable(c[0], c[1], c[2]));
        return g;
    }

    public void put(Quantity q) {
        if (!metrics.containsKey(q.quantityId)) throw new IllegalArgumentException(q.quantityId + " is not a catalogue quantity");
        metrics.put(q.quantityId, q);
    }

    public String methodId() { return METHOD_ID; }

    public String scoreSemantics() { return SCORE_SEMANTICS; }

    public String toJson() {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("loop_id", loopId);
        n.put("path_id", pathId);
        n.put("event_id", eventId);
        n.put("method_id", METHOD_ID);
        n.put("method_version", METHOD_VERSION);
        n.put("score_semantics", SCORE_SEMANTICS);
        n.put("evaluation_state", evaluationState);
        n.put("eligibility", eligibility);
        n.put("finding", finding);
        n.put("model_state", modelState);
        ObjectNode sg = n.putObject("subgates");
        for (Map.Entry<String, Subgate> e : subgates.entrySet()) {
            ObjectNode s = sg.putObject(e.getKey());
            s.put("state", e.getValue().state);
            s.set("outputs", MAPPER.valueToTree(e.getValue().outputs));
        }
        ArrayNode m = n.putArray("metrics");
        for (Quantity q : metrics.values()) {
            ObjectNode qn = q.toJson(MAPPER);
            qn.put("path_id", pathId);
            qn.put("config_hash", bundleHash);
            m.add(qn);
        }
        n.putObject("evidence").put("has_approved_test_record", hasApprovedTestRecord);
        n.put("controller_snapshot_ref", controllerSnapshotRef);
        ArrayNode hx = n.putArray("health_exclusions");
        for (String h : healthExclusions) hx.add(h);
        n.put("method_run_id", methodRunId);
        n.put("bundle_hash", bundleHash);
        n.put("dataset_hash", datasetHash);
        n.put("purpose", purpose);
        n.put("analysis_run_id", analysisRunId);
        n.put("context_revision", contextRevision);
        n.put("result_revision", resultRevision);
        n.put("sourceCommit", sourceCommit);
        n.put("jarSha256", jarSha256);
        n.put("contractVersion", contractVersion);
        n.put("window_start_ms", windowStartMs);
        n.put("window_end_ms", windowEndMs);
        n.put("emitted_at_ms", emittedAtMs);
        return n.toString();
    }

    public static G12Result fromJson(String json) {
        try {
            JsonNode n = MAPPER.readTree(json);
            G12Result g = empty(n.path("loop_id").asText(""), n.path("path_id").asText(""));
            g.eventId = n.path("event_id").asText("");
            g.evaluationState = n.path("evaluation_state").asText("WAITING");
            g.eligibility = n.path("eligibility").asText("UNKNOWN");
            g.finding = n.path("finding").asText("NONE");
            g.modelState = n.path("model_state").asText("NONE");
            for (JsonNode q : n.path("metrics")) {
                String id = q.path("quantity_id").asText();
                if (!g.metrics.containsKey(id)) continue;
                String unit = q.path("unit").asText(), method = q.path("method").asText("");
                if (q.path("value").isNumber()) {
                    Double unc = q.path("uncertainty").isNumber() ? q.path("uncertainty").asDouble() : null;
                    g.metrics.put(id, Quantity.of(id, q.path("value").asDouble(), unit, method, unc));
                } else {
                    g.metrics.put(id, Quantity.unavailable(id, unit, q.path("reason_if_null").asText("UNAVAILABLE")));
                }
            }
            Iterator<Map.Entry<String, JsonNode>> it = n.path("subgates").fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                Subgate s = g.subgates.computeIfAbsent(e.getKey(), k -> new Subgate());
                s.state = e.getValue().path("state").asText("NOT_EVALUATED");
            }
            g.hasApprovedTestRecord = n.path("evidence").path("has_approved_test_record").asBoolean(false);
            g.controllerSnapshotRef = n.path("controller_snapshot_ref").asText("");
            for (JsonNode h : n.path("health_exclusions")) g.healthExclusions.add(h.asText());
            g.methodRunId = n.path("method_run_id").asText("");
            g.bundleHash = n.path("bundle_hash").asText("legacy");
            g.datasetHash = n.path("dataset_hash").asText("");
            g.purpose = n.path("purpose").asText("LIVE");
            g.analysisRunId = n.path("analysis_run_id").asText("");
            g.contextRevision = n.path("context_revision").asInt(0);
            g.resultRevision = n.path("result_revision").asInt(1);
            g.sourceCommit = n.path("sourceCommit").asText("");
            g.jarSha256 = n.path("jarSha256").asText("");
            g.contractVersion = n.path("contractVersion").asText("v1");
            g.windowStartMs = n.path("window_start_ms").asLong(0);
            g.windowEndMs = n.path("window_end_ms").asLong(0);
            g.emittedAtMs = n.path("emitted_at_ms").asLong(0);
            return g;
        } catch (Exception e) {
            throw new IllegalArgumentException("not a G12Result: " + e.getMessage(), e);
        }
    }
}
