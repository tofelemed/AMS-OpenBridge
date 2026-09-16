package com.ams.flink.cplm.fusion;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The v2 structure of a fused verdict (v2.5 Task 1E.1, spec v6 §1.4 / §3.4 G15): symptoms,
 * mechanisms and the fault-scoped confirmation kept apart, with the score semantics stated
 * (these are evidence scores, not probabilities). Rides every CplmGateResult beside the
 * legacy fields, which stay for old readers.
 */
public final class FusionVerdictV2 implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final String SCORE_SEMANTICS = "EVIDENCE_SCORE_UNCALIBRATED";

    public Map<String, Observation> observations = new LinkedHashMap<>();
    public Map<String, Hypothesis> hypotheses = new LinkedHashMap<>();
    /** The hypothesis the legacy family selection maps to, or NONE. */
    public String leadingHypothesis = "NONE";
    public Confirmation confirmation = new Confirmation();
    public String scoreSemantics = SCORE_SEMANTICS;

    public FusionVerdictV2() {
    }

    public void observe(Observation o) {
        observations.put(o.id, o);
    }

    public Hypothesis hypothesis(String id) {
        return hypotheses.computeIfAbsent(id, k -> Hypothesis.of(k, 0, false));
    }

    public void writeTo(ObjectNode out, ObjectMapper m) {
        ObjectNode obs = out.putObject("observations");
        for (Map.Entry<String, Observation> e : observations.entrySet()) obs.set(e.getKey(), e.getValue().toJson(m));
        ObjectNode hyp = out.putObject("hypotheses");
        for (Map.Entry<String, Hypothesis> e : hypotheses.entrySet()) hyp.set(e.getKey(), e.getValue().toJson(m));
        out.put("leading_hypothesis", leadingHypothesis);
        out.set("confirmation", confirmation.toJson(m));
        out.put("score_semantics", scoreSemantics);
    }
}
