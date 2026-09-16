package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateResult;

/**
 * Calc v3 blocking exclusions: the record is finished here, with confidence 0 and G15
 * INSUFFICIENT_EVIDENCE, and a recommendation a person can act on (P2-8). Split out of
 * CplmGateFusionEngine in v2.5 (1E.1); no rule changed.
 */
public final class BlockingExclusions {
    private BlockingExclusions() {
    }

    /** The short stage never ran: nothing can be said about this window. */
    public static CplmGateResult insufficientData(CplmGateResult result) {
        result.diagnosis = "INSUFFICIENT_DATA";
        result.severity = "LOW";
        result.confidence = 0.0;
        result.observabilityFlags.add("INSUFFICIENT_SAMPLES");
        result.gate12Status = "NOT_EVALUATED";
        result.gate13Status = "NOT_EVALUATED";
        result.gate14Status = "INSUFFICIENT_EVIDENCE";
        result.gate15Status = "INSUFFICIENT_EVIDENCE";
        result.selectedFamily = "NONE";
        return result;
    }

    public static CplmGateResult block(CplmGateResult result, String diagnosis, String reason) {
        result.selectedFamily = "NONE";
        result.familyScore = 0;
        result.confidence = 0;
        result.diagnosis = diagnosis;
        result.gate15Status = "INSUFFICIENT_EVIDENCE";
        result.severity = "LOW";
        result.insufficientEvidenceReason = reason;
        // P2-8: recommendation is surfaced by the UI as "Next-best action";
        // echoing the gate code ("G1 mode/service EXCLUDED") told the operator
        // nothing actionable. Map each blocking exclusion to what a person can
        // actually do about it. The machine reason stays in
        // insufficient_evidence_reason / status_reason.
        result.recommendation = recommendationFor(diagnosis, reason);
        result.statusReason = reason;
        result.gate12Status = result.gate12Status == null || "PENDING".equals(result.gate12Status)
                ? "NOT_EVALUATED" : result.gate12Status;
        result.gate13Status = result.gate13Status == null || "PENDING".equals(result.gate13Status)
                ? "NOT_EVALUATED" : result.gate13Status;
        if (result.gate14Status == null || "PENDING".equals(result.gate14Status)) {
            result.gate14Status = "INSUFFICIENT_EVIDENCE";
        }
        return result;
    }

    /** P2-8 - what a person can DO about each blocking exclusion. */
    static String recommendationFor(String diagnosis, String reason) {
        if ("EXCLUDED_DATA_QUALITY".equals(diagnosis)) {
            return "Data quality blocked evaluation: check historian collection and "
                    + "transmitter health for this loop's PV/SP/OP feeds.";
        }
        if ("EXCLUDED_MODE".equals(diagnosis)) {
            return "The loop spent too little time in closed-loop control this window. If "
                    + "manual operation was intentional, no action; otherwise check why the "
                    + "operator or logic dropped it out of auto/cascade.";
        }
        if ("EXCLUDED_OPERATING_REGION".equals(diagnosis)) {
            return "PV/OP ran outside the loop's declared operating region. Verify the region "
                    + "limits in the loop's dynamics profile, or investigate the process excursion.";
        }
        if ("EXCLUDED_SENSOR".equals(diagnosis)) {
            return "The PV signal froze for a material share of the window. Check the "
                    + "transmitter and the historian scan/compression settings before trusting "
                    + "any diagnosis on this loop.";
        }
        return "Evaluation was blocked (" + reason + "); resolve the exclusion before acting "
                + "on any metric from this window.";
    }
}
