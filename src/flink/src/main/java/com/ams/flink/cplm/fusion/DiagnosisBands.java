package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateResult;

import java.util.LinkedHashSet;

/**
 * Diagnosis labelling: the family -> label map (v2.5 R02: an oscillation is labelled as an
 * oscillation, never as a valve fault), the confidence bands (unchanged: 0.35 / 0.55 / 0.75 /
 * 0.90), and the zero-dead-end copy for INSUFFICIENT_EVIDENCE.
 */
public final class DiagnosisBands {
    private DiagnosisBands() {
    }

    /** The diagnosis names what the selected family actually is. */
    public static String familyLabel(String family) {
        if (family == null) return "NONE";
        switch (family) {
            case "stiction":
            case "geometry": return "FINAL_ELEMENT_NONLINEARITY";
            case "oscillation": return "OSCILLATION";
            case "effort": return "EXCESSIVE_EFFORT";
            default: return "NONE";
        }
    }

    public static String leadingHypothesisFor(String family, boolean disturbanceContext) {
        if (family == null) return "NONE";
        switch (family) {
            case "stiction":
            case "geometry": return "STICTION";
            case "oscillation": return disturbanceContext ? "EXTERNAL_DISTURBANCE" : "OSCILLATION_TUNING";
            case "effort": return "EXCESSIVE_EFFORT";
            default: return "NONE";
        }
    }

    /**
     * CONFIRMED for a final-element claim requires the fault-scoped confirmation; without it
     * the top band is SUSPECTED at 0.89. Symptom families confirm on the band alone.
     */
    public static void apply(CplmGateResult result, double confidence, String label, String confirmationState) {
        if (confidence < 0.35) {
            result.diagnosis = "NO_CALL";
            result.gate15Status = "INSUFFICIENT_EVIDENCE";
            result.severity = "LOW";
        } else if (confidence < 0.55) {
            result.diagnosis = "DETECTED_" + label;
            result.gate15Status = "SUSPECTED";
            result.severity = "LOW";
        } else if (confidence < 0.75) {
            result.diagnosis = "CLASSIFIED_" + label;
            result.gate15Status = "SUSPECTED";
            result.severity = "MEDIUM";
        } else if (confidence < 0.90) {
            result.diagnosis = "SUSPECTED_" + label;
            result.gate15Status = "SUSPECTED";
            result.severity = "HIGH";
        } else {
            boolean finalElement = "FINAL_ELEMENT_NONLINEARITY".equals(label);
            if (!finalElement || "CONFIRMED".equals(confirmationState)) {
                result.diagnosis = "CONFIRMED_" + label;
                result.gate15Status = "CONFIRMED";
                result.severity = "HIGH";
            } else {
                result.confidence = Math.min(confidence, 0.89);
                result.diagnosis = "SUSPECTED_" + label;
                result.gate15Status = "SUSPECTED";
                result.severity = "HIGH";
            }
        }
    }

    /**
     * Human-readable zero-dead-end copy for G15 INSUFFICIENT_EVIDENCE (UI / KPI aggregation).
     * {@code vpOk}: a VP is present, or the loop is declared without one (CHG-088) - only a missing EXPECTED VP is named.
     */
    public static String insufficientEvidenceReason(CplmGateResult result, boolean vpOk) {
        LinkedHashSet<String> parts = new LinkedHashSet<>();
        if (!"VALID".equals(result.periodStatus) || result.completedCycles < 1) {
            parts.add("no valid oscillation cycle");
        }
        if (!vpOk) {
            parts.add("valve position unavailable");
        }
        for (String d : result.familyDisqualifiers) {
            if (d.contains("EFFORT_BELOW_FLOOR")) parts.add("actuator effort below floor");
            if (d.contains("OP_TRAVEL_BELOW_FLOOR")) parts.add("OP travel below floor");
            if (d.contains("AREA_BELOW_BAND")) parts.add("phase-portrait area below geometry band");
            if (d.contains("AREA_OUT_OF_BAND")) parts.add("phase-portrait area out of band (artifact)");
            if (d.contains("CORNER_NOISE_FLOOR")) parts.add("corner score not OP-qualified");
            if (d.contains("NO_VALID_CYCLE")) parts.add("no valid oscillation cycle");
            if (d.contains("GEOMETRY_ALONE_FORBIDDEN")) parts.add("geometry alone forbidden for this loop class");
            if (d.contains("DISTURBANCE_CONTEXT")) parts.add("disturbance/interaction context");
        }
        if (parts.isEmpty()) {
            parts.add("no diagnosis family qualified");
        }
        return "Insufficient evidence: " + String.join("; ", parts);
    }
}
