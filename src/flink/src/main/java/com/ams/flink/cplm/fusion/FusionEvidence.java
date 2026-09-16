package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;

import java.util.ArrayList;
import java.util.List;

/**
 * The qualification stage of fusion: detector scores, the evidence predicates (oscillation,
 * shape, actuator stress, geometry), the multi-evidence stiction rule (never geometry alone,
 * never asymmetry alone - R07), the disturbance soft-block, and the per-family scores with the
 * class priors. Split out of CplmGateFusionEngine in v2.5 (1E.1). Writes the detector scores
 * and the early disqualifiers/flags onto the result exactly where the engine used to.
 */
public final class FusionEvidence {
    /** v2.5 R07: corner score below which qualified geometry is not SHAPE evidence for stiction. */
    public static final double SHAPE_CORNER_MIN = 0.5;

    public double oscillationScore;
    public double fftScore;
    public double effortScore;
    public double stictionScore;
    public double horchScore;
    public double geometryScore;

    public boolean oscillationQualified;
    public boolean oscillationEvidence;
    public boolean harmonicOrShape;
    public boolean actuatorStress;

    public boolean geometryEvidenceOk;
    public boolean geometryPrereqsMet;
    public boolean geometrySelectable;
    public final List<String> geometryReasons = new ArrayList<>();

    public boolean shapeEvidence;
    public boolean asymmetrySupport;
    public boolean stictionQualified;
    public boolean effortQualified;
    public boolean disturbanceContext;
    /** The legacy link flag (display only; never a verdict). */
    public boolean hasPeerLinks;
    /** v2.5 (2F.1): the long tier's aligned analysis found a coherent, correlated peer. */
    public boolean interactionDetected;

    public double familyStiction;
    public double familyOscillation;
    public double familyEffort;
    public double familyGeometry;
    public double weightedRaw;

    private FusionEvidence() {
    }

    public static FusionEvidence evaluate(CplmGateResult result, CplmLongDiagnosticsResult longD,
                                          CplmLoopDynamicsProfile profile, boolean hasPeerLinks) {
        FusionEvidence e = new FusionEvidence();
        e.hasPeerLinks = hasPeerLinks;
        e.interactionDetected = result.interaction != null && result.interaction.detected();

        e.oscillationScore = clamp01(result.acfRegularity);
        e.fftScore = clamp01(result.fftPeakRatio);
        e.effortScore = clamp01(result.effortRatio / 8.0);
        e.stictionScore = clamp01(result.triangularity);
        e.horchScore = clamp01(result.horchOddness);
        e.geometryScore = clamp01(result.cornerScoreQualified > 0 || "VALID".equals(result.periodStatus)
                ? result.cornerScoreQualified
                : 0);
        result.oscillationScore = e.oscillationScore;
        result.fftScore = e.fftScore;
        result.effortScore = e.effortScore;
        result.stictionScore = e.stictionScore;
        result.horchScore = e.horchScore;
        result.geometryScore = e.geometryScore;

        e.oscillationQualified = isQualified(Math.max(e.oscillationScore, e.fftScore),
                result.gate5Status, result.gate6Status)
                || (profile.dynamicClass == CplmLoopDynamicsProfile.DynamicClass.SLOW_SELF_REG
                && isStrongOrWarn(result.gate8Status)
                && "VALID".equals(result.periodStatus)
                && result.completedCycles >= profile.minValidCycles);
        e.oscillationEvidence = e.oscillationQualified;
        e.harmonicOrShape = isStrongOrWarn(result.gate6Status) && result.harmonicAmplitudeRatio > 0.15
                || isStrongOrWarn(result.gate7Status)
                || isStrongOrWarn(result.gate8Status)
                || e.stictionScore >= 0.55
                || e.horchScore >= 0.55;
        e.actuatorStress = isStrongOrWarn(result.gate4Status)
                || isStrongOrWarn(result.gate10Status)
                || result.effortRatio >= profile.effortRatioFloor * 2
                || result.opRangePct >= profile.opTravelFloorPct
                || longD.satCyclingPattern
                || result.reversalCount >= 3;

        e.geometryEvidenceOk = GeometryEvidence.evaluate(result, profile, e.geometryReasons);
        // Geometry may contribute to family score only when prerequisites are met on FAST classes.
        e.geometryPrereqsMet = e.oscillationEvidence && e.harmonicOrShape && e.actuatorStress;
        e.geometrySelectable = e.geometryEvidenceOk
                && profile.geometryFamilyEnabled
                && profile.geometryRole != CplmLoopDynamicsProfile.GateRole.DISPLAY_ONLY
                && (profile.geometryRole == CplmLoopDynamicsProfile.GateRole.PRIMARY
                || e.geometryPrereqsMet);

        e.familyGeometry = e.geometrySelectable
                ? clamp01(result.cornerScoreQualified) * profile.priorGeometry
                : 0;

        // Multi-evidence stiction path (never geometry alone).
        boolean stictionMultiEvidence = (!profile.requireOscillationForStiction || e.oscillationEvidence)
                && e.harmonicOrShape
                && e.actuatorStress;
        int nonGeoEvidence = 0;
        if (e.oscillationEvidence) nonGeoEvidence++;
        if (e.harmonicOrShape) nonGeoEvidence++;
        if (e.actuatorStress) nonGeoEvidence++;
        // v2.5 R07: a final-element hypothesis needs SHAPE evidence: G7 triangularity, or
        // qualified geometry WITH CORNERS (a stick-slip trajectory has jump/slip corners; the
        // elliptical PV/OP loop of a linear plant with delay has area in band but no corners).
        // Cross-correlation asymmetry (G8, XCORR_ASYMMETRY_V1) SUPPORTS a shape finding but
        // never qualifies stiction on its own - that same linear plant produces the asymmetry.
        boolean geometryHasCorners = e.geometrySelectable && result.cornerScoreQualified >= SHAPE_CORNER_MIN;
        e.shapeEvidence = isStrongOrWarn(result.gate7Status) || e.stictionScore >= 0.55 || geometryHasCorners;
        e.asymmetrySupport = isStrongOrWarn(result.gate8Status) || e.horchScore >= 0.55;
        e.stictionQualified = stictionMultiEvidence
                && nonGeoEvidence >= Math.max(2, profile.minNonGeometryEvidences)
                && e.shapeEvidence;
        if (!e.shapeEvidence && e.asymmetrySupport) result.familyDisqualifiers.add("stiction:NO_SHAPE_EVIDENCE");

        // Disturbance soft-block (R09): a DETECTED peer interaction + oscillation without actuator
        // stress. A configured link alone (legacy flag) never blocks or supports anything.
        e.disturbanceContext = e.interactionDetected && e.oscillationEvidence && !e.actuatorStress;
        if (e.disturbanceContext) {
            e.stictionQualified = false;
            result.familyDisqualifiers.add("stiction:DISTURBANCE_CONTEXT");
            result.observabilityFlags.add("DISTURBANCE_CONTEXT");
        }

        e.familyStiction = e.stictionQualified
                ? Math.max(e.stictionScore, e.horchScore) * profile.priorStiction
                : Math.max(e.stictionScore, e.horchScore);
        e.familyOscillation = e.oscillationQualified
                ? Math.max(e.oscillationScore, e.fftScore) * profile.priorOscillation
                : Math.max(e.oscillationScore, e.fftScore);
        e.effortQualified = isQualified(e.effortScore, result.gate4Status, result.gate10Status);
        e.familyEffort = e.effortQualified
                ? e.effortScore * profile.priorEffort
                : e.effortScore;

        e.weightedRaw =
                0.15 * e.oscillationScore
                + 0.15 * e.fftScore
                + 0.15 * e.effortScore
                + 0.20 * e.stictionScore
                + 0.20 * e.horchScore
                + 0.15 * e.geometryScore;
        result.rawFinalElementScore = e.weightedRaw;

        result.stictionFamilyScore = e.familyStiction;
        result.oscillationFamilyScore = e.familyOscillation;
        result.effortFamilyScore = e.familyEffort;
        result.geometryFamilyScore = e.familyGeometry;
        return e;
    }

    static boolean isQualified(double score, String statusA, String statusB) {
        if (score >= 0.55) return true;
        if (isStrongOrWarn(statusA)) return true;
        return isStrongOrWarn(statusB);
    }

    public static boolean isStrongOrWarn(String status) {
        if (status == null) return false;
        return "STRONG".equalsIgnoreCase(status) || "WARN".equalsIgnoreCase(status);
    }

    public static double clamp01(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return 0;
        return Math.max(0, Math.min(1.0, v));
    }
}
