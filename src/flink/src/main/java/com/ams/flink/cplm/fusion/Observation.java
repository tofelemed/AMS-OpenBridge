package com.ams.flink.cplm.fusion;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;

/**
 * One SYMPTOM the gates observed (v2.5 Task 1E.1, spec v6 R02/R07): what the signal did,
 * scored by the method that measured it, with the role that method may play. An
 * observation is never a mechanism - "OP is triangular" is not "the valve is sticking".
 */
public final class Observation implements Serializable {
    private static final long serialVersionUID = 1L;

    public String id;
    public boolean present;
    /** 0-1 evidence score from the measuring gate (uncalibrated). */
    public double score;
    /** The method that produced it, e.g. G7.SINE_TRIANGLE_SHAPE, XCORR_ASYMMETRY_V1. */
    public String methodId = "";
    /** PRIMARY | SUPPORTING | DISPLAY_ONLY - what the observation may do in a hypothesis. */
    public String role = "SUPPORTING";
    /** The gate statuses it came from, e.g. "G7=STRONG". */
    public String basis = "";

    public Observation() {
    }

    public static Observation of(String id, boolean present, double score, String methodId, String role, String basis) {
        Observation o = new Observation();
        o.id = id;
        o.present = present;
        o.score = Double.isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
        o.methodId = methodId;
        o.role = role;
        o.basis = basis;
        return o;
    }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("present", present);
        n.put("score", score);
        n.put("method_id", methodId);
        n.put("role", role);
        n.put("basis", basis);
        return n;
    }
}
