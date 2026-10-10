package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * G14 v2 - a FAULT-SCOPED confirmation (v2.5 Task 1E.1, spec v6 R02 / §3.4 G14). The only
 * claim this release can confirm is FINAL_ELEMENT_NON_FOLLOWING: the measured valve position
 * did not follow the controller output for at least the commissioned dwell. It requires
 * POSITIVE evidence (a measured non-following dwell); the mere presence of a VP signal
 * confirms nothing, and healthy tracking is a contradiction. A confirmed subtype never
 * exceeds this scope.
 */
public final class Confirmation implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final String CLAIM_FINAL_ELEMENT_NON_FOLLOWING = "FINAL_ELEMENT_NON_FOLLOWING";

    public String claimType = CLAIM_FINAL_ELEMENT_NON_FOLLOWING;
    /** CONFIRMED | NOT_CONFIRMED | CONTRADICTED | NOT_APPLICABLE */
    public String state = "NOT_APPLICABLE";
    /** NO_VP | VP_NOT_APPLICABLE | NO_POSITIVE_EVIDENCE | VP_TRACKING_HEALTHY | NON_FOLLOWING_DWELL | NOT_A_FINAL_ELEMENT_CLAIM */
    public String reason = "";
    public List<String> positiveEvidenceIds = new ArrayList<>();
    public List<String> contradictions = new ArrayList<>();
    public String scope = "VP tracking of OP demand over the evaluated support";
    public double nonFollowingDwellS;
    public double trackingErrorP95Pp;
    public long confirmedAtMs;

    public Confirmation() {
    }

    /** Evaluate the non-following claim from the long stage's measured VP tracking. */
    public static Confirmation evaluate(CplmLongDiagnosticsResult longD, CplmLoopDynamicsProfile profile) {
        Confirmation c = new Confirmation();
        c.nonFollowingDwellS = longD.vpNonFollowingDwellS;
        c.trackingErrorP95Pp = longD.vpTrackingErrorP95Pp;
        if (!longD.hasVp && profile != null && profile.vpDeclaredAbsent()) {
            // CHG-082: the loop has no VP by declaration - nothing to confirm with. The final-element cap stays
            // 0.89 (capForFinalElement default): a valve claim on such a loop tops out at SUSPECTED.
            c.state = "NOT_APPLICABLE";
            c.reason = "VP_NOT_APPLICABLE";
            return c;
        }
        if (!longD.hasVp || longD.vpEligibleSamples <= 0) {
            c.state = "NOT_CONFIRMED";
            c.reason = "NO_VP";
            return c;
        }
        if (longD.vpNonFollowingDwellS >= profile.nonfollowingDwellS && longD.vpNonFollowingDwellS > 0) {
            c.state = "CONFIRMED";
            c.reason = "NON_FOLLOWING_DWELL";
            c.positiveEvidenceIds.add("G10.VP_NONFOLLOWING_DWELL");
            c.confirmedAtMs = longD.windowEndMs;
            return c;
        }
        if (longD.vpTrackingHealthy) {
            c.state = "CONTRADICTED";
            c.reason = "VP_TRACKING_HEALTHY";
            c.contradictions.add("VP_TRACKING_HEALTHY");
            return c;
        }
        c.state = "NOT_CONFIRMED";
        c.reason = "NO_POSITIVE_EVIDENCE";
        return c;
    }

    /** The confidence cap this confirmation state imposes on a final-element hypothesis. */
    public double capForFinalElement() {
        switch (state) {
            case "CONFIRMED": return 1.0;
            case "CONTRADICTED": return 0.54;
            default: return 0.89;
        }
    }

    public Confirmation notApplicable() {
        Confirmation c = new Confirmation();
        c.claimType = claimType;
        c.state = "NOT_APPLICABLE";
        c.reason = "NOT_A_FINAL_ELEMENT_CLAIM";
        c.nonFollowingDwellS = nonFollowingDwellS;
        c.trackingErrorP95Pp = trackingErrorP95Pp;
        c.contradictions = new ArrayList<>(contradictions);
        return c;
    }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("claim_type", claimType);
        n.put("state", state);
        n.put("reason", reason);
        ArrayNode p = n.putArray("positive_evidence_ids");
        for (String s : positiveEvidenceIds) p.add(s);
        ArrayNode c = n.putArray("contradictions");
        for (String s : contradictions) c.add(s);
        n.put("scope", scope);
        n.put("non_following_dwell_s", nonFollowingDwellS);
        n.put("tracking_error_p95_pp", trackingErrorP95Pp);
        n.put("confirmed_at_ms", confirmedAtMs);
        return n;
    }
}
