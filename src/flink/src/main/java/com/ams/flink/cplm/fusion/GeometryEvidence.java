package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;

import java.util.List;

/**
 * G9 phase-geometry evidence prerequisites (valid cycle, area in the class band, effort and
 * travel above floor, corners not at the noise floor). Note this says the geometry is
 * WELL-FORMED, not that it has corners: a linear plant with delay traces an ellipse that passes
 * here - which is why FusionEvidence requires corners before geometry counts as SHAPE (R07).
 */
public final class GeometryEvidence {
    private GeometryEvidence() {
    }

    public static boolean evaluate(CplmGateResult result, CplmLoopDynamicsProfile profile, List<String> reasons) {
        if (!profile.geometryFamilyEnabled || profile.priorGeometry <= 0) {
            reasons.add("FAMILY_DISQUALIFIED");
            return false;
        }
        if (!"VALID".equals(result.periodStatus)) {
            reasons.add("NO_VALID_CYCLE");
            return false;
        }
        if (result.completedCycles < profile.minValidCycles) {
            reasons.add("NO_VALID_CYCLE");
            return false;
        }
        CplmLoopDynamicsProfile.PhaseAreaBand areaBand = profile.classifyPhaseArea(result.phaseAreaNormPerCycle);
        if (areaBand == CplmLoopDynamicsProfile.PhaseAreaBand.ABOVE_BAND) {
            reasons.add("AREA_OUT_OF_BAND");
            return false;
        }
        if (areaBand == CplmLoopDynamicsProfile.PhaseAreaBand.BELOW_BAND) {
            reasons.add("AREA_BELOW_BAND");
            return false;
        }
        if (result.effortRatio < profile.effortRatioFloor) {
            reasons.add("EFFORT_BELOW_FLOOR");
            return false;
        }
        if (result.opRangePct < profile.opTravelFloorPct) {
            reasons.add("OP_TRAVEL_BELOW_FLOOR");
            return false;
        }
        if (result.cornerScoreQualified <= 0 && result.cornerScoreRaw > 0.5) {
            reasons.add("CORNER_NOISE_FLOOR");
            return false;
        }
        return true;
    }
}
