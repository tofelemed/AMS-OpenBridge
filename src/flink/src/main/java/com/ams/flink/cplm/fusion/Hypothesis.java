package com.ams.flink.cplm.fusion;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * One MECHANISM that could explain the observations (v2.5 Task 1E.1, spec v6 R02): scored
 * from its evidence groups, with the contradictions and disqualifiers that argue against it.
 * Ids: STICTION, OSCILLATION_TUNING, EXTERNAL_DISTURBANCE, EXCESSIVE_EFFORT, ACTUATOR_LIMIT, SENSOR.
 * A hypothesis is never a confirmation: {@link Confirmation} is a separate, fault-scoped claim.
 */
public final class Hypothesis implements Serializable {
    private static final long serialVersionUID = 1L;

    public String id;
    /** 0-1 evidence score (uncalibrated); 0 when disqualified. */
    public double score;
    /** QUALIFIED | DISQUALIFIED (real evidence against) | NOT_ASSESSED (an input is missing) | NO_EVIDENCE */
    public String state = "NOT_ASSESSED";
    /** CHG-095: the observability-flag codes of the inputs it needed and did not have (e.g. NO_UPSTREAM_LINKS). */
    public List<String> missingInputs = new ArrayList<>();
    /** Observation ids that support it. */
    public List<String> evidenceGroups = new ArrayList<>();
    /** Evidence that argues against it (e.g. VP_TRACKING_HEALTHY, DISTURBANCE_CONTEXT). */
    public List<String> contradictions = new ArrayList<>();
    /** Why it was not qualified (e.g. NO_SHAPE_EVIDENCE). */
    public List<String> disqualifiers = new ArrayList<>();

    public Hypothesis() {
    }

    public static Hypothesis of(String id, double score, boolean qualified) {
        Hypothesis h = new Hypothesis();
        h.id = id;
        h.score = Double.isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
        h.state = qualified ? "QUALIFIED" : "DISQUALIFIED";
        return h;
    }

    /**
     * CHG-095 (SME review 2, #7): an unqualified hypothesis is DISQUALIFIED only on real contradictions or
     * disqualifiers; a missing input is NOT_ASSESSED (with the codes), not evidence against; otherwise NO_EVIDENCE.
     */
    public Hypothesis settle(String... missing) {
        for (String s : missing) if (!missingInputs.contains(s)) missingInputs.add(s);
        if ("QUALIFIED".equals(state)) return this;
        state = !contradictions.isEmpty() || !disqualifiers.isEmpty() ? "DISQUALIFIED"
                : !missingInputs.isEmpty() ? "NOT_ASSESSED"
                : "NO_EVIDENCE";
        return this;
    }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("score", score);
        n.put("state", state);
        ArrayNode g = n.putArray("evidence_groups");
        for (String s : evidenceGroups) g.add(s);
        ArrayNode c = n.putArray("contradictions");
        for (String s : contradictions) c.add(s);
        ArrayNode d = n.putArray("disqualifiers");
        for (String s : disqualifiers) d.add(s);
        ArrayNode mi = n.putArray("missing_inputs");
        for (String s : missingInputs) mi.add(s);
        return n;
    }
}
