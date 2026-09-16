package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.condition.OpenConditions;

import static com.ams.flink.cplm.fusion.FusionEvidence.clamp01;
import static com.ams.flink.cplm.fusion.FusionEvidence.isStrongOrWarn;

/**
 * v2.5 R02: writes the SYMPTOMS (observations, with the method that produced each) and the
 * MECHANISMS (hypotheses, each with its evidence groups, contradictions and disqualifiers)
 * onto the v2 verdict. The confirmation is a separate, fault-scoped claim set by the engine
 * once the family is known.
 */
public final class VerdictAssembly {
    private VerdictAssembly() {
    }

    public static void assemble(FusionVerdictV2 v2, FusionEvidence e, CplmGateResult result,
                                CplmLongDiagnosticsResult longD, OpenConditions oc, CplmLoopDynamicsProfile profile) {
        boolean freezeSeen = longD.freezeMaterial
                || (longD.freezeEvents != null && !longD.freezeEvents.isEmpty())
                || oc.hasOpenFreeze;

        v2.observe(Observation.of("OSCILLATION", e.oscillationQualified || e.oscillationEvidence,
                Math.max(e.oscillationScore, e.fftScore), "G5.ACF_OSCILLATION|G6.FFT_SPECTRAL", "PRIMARY",
                "G5=" + result.gate5Status + ",G6=" + result.gate6Status + ",period=" + result.periodStatus));
        v2.observe(Observation.of("SHAPE_TRIANGULARITY",
                isStrongOrWarn(result.gate7Status) || e.stictionScore >= 0.55, e.stictionScore,
                "G7.SINE_TRIANGLE_SHAPE", "PRIMARY", "G7=" + result.gate7Status));
        v2.observe(Observation.of("LAG_ASYMMETRY", e.asymmetrySupport, e.horchScore,
                "XCORR_ASYMMETRY_V1", "SUPPORTING", "G8=" + result.gate8Status));
        v2.observe(Observation.of("PHASE_GEOMETRY", e.geometryEvidenceOk, e.geometryScore,
                "G9.PHASE_GEOMETRY", profile.geometryRole.name(), "G9=" + result.gate9Status));
        v2.observe(Observation.of("ACTUATOR_STRESS", e.actuatorStress, e.effortScore,
                "G4.ACTUATOR_EFFORT|G10.SATURATION", "SUPPORTING",
                "G4=" + result.gate4Status + ",G10=" + result.gate10Status));
        v2.observe(Observation.of("LIMIT_OCCUPANCY",
                isStrongOrWarn(result.gate10Status) || oc.hasOpenLimit, clamp01(result.saturationPct * 2),
                "G10.SATURATION", "SUPPORTING", "G10=" + result.gate10Status));
        v2.observe(Observation.of("FREEZE", freezeSeen, longD.freezeMaterial ? 1.0 : 0.5,
                "G11.SENSOR_FREEZE", "PRIMARY", "G11=" + result.gate11Status));
        if (result.interaction != null) {
            double best = 0;
            for (com.ams.flink.cplm.engine.InteractionSummary.PeerRow p : result.interaction.peers) {
                if (p.associated && Double.isFinite(p.coherenceBandMax)) best = Math.max(best, p.coherenceBandMax);
            }
            v2.observe(Observation.of("PEER_INTERACTION", e.interactionDetected, best,
                    result.interaction.methodId, "SUPPORTING", "G13=" + result.gate13Status + ":" + result.interaction.state));
        } else {
            v2.observe(Observation.of("PEER_LINKS", e.hasPeerLinks, e.hasPeerLinks ? 1.0 : 0.0,
                    "G13.PEER_LINK_FLAG", "DISPLAY_ONLY", "LEGACY_FLAG_ONLY"));
        }

        Hypothesis stiction = Hypothesis.of("STICTION", e.stictionQualified ? e.familyStiction : 0, e.stictionQualified);
        if (e.shapeEvidence) stiction.evidenceGroups.add("SHAPE_TRIANGULARITY");
        if (e.asymmetrySupport) stiction.evidenceGroups.add("LAG_ASYMMETRY");
        if (e.geometryEvidenceOk) stiction.evidenceGroups.add("PHASE_GEOMETRY");
        if (e.actuatorStress) stiction.evidenceGroups.add("ACTUATOR_STRESS");
        if (e.oscillationEvidence) stiction.evidenceGroups.add("OSCILLATION");
        if (!e.shapeEvidence && e.asymmetrySupport) stiction.disqualifiers.add("NO_SHAPE_EVIDENCE");
        if (e.disturbanceContext) stiction.contradictions.add("DISTURBANCE_CONTEXT");
        v2.hypotheses.put("STICTION", stiction);

        boolean tuning = e.oscillationQualified && !e.disturbanceContext;
        Hypothesis oscillationTuning = Hypothesis.of("OSCILLATION_TUNING", tuning ? e.familyOscillation : 0, tuning);
        oscillationTuning.evidenceGroups.add("OSCILLATION");
        v2.hypotheses.put("OSCILLATION_TUNING", oscillationTuning);

        Hypothesis disturbance = Hypothesis.of("EXTERNAL_DISTURBANCE",
                e.disturbanceContext ? e.familyOscillation : 0, e.disturbanceContext);
        disturbance.evidenceGroups.add("OSCILLATION");
        if (e.interactionDetected) disturbance.evidenceGroups.add("PEER_INTERACTION");
        v2.hypotheses.put("EXTERNAL_DISTURBANCE", disturbance);

        Hypothesis effort = Hypothesis.of("EXCESSIVE_EFFORT", e.effortQualified ? e.familyEffort : 0, e.effortQualified);
        effort.evidenceGroups.add("ACTUATOR_STRESS");
        v2.hypotheses.put("EXCESSIVE_EFFORT", effort);

        boolean limit = isStrongOrWarn(result.gate10Status) || oc.hasOpenLimit;
        Hypothesis actuatorLimit = Hypothesis.of("ACTUATOR_LIMIT",
                limit ? clamp01(result.saturationPct * 2 + (oc.hasOpenLimit ? 0.3 : 0)) : 0, limit);
        actuatorLimit.evidenceGroups.add("LIMIT_OCCUPANCY");
        v2.hypotheses.put("ACTUATOR_LIMIT", actuatorLimit);

        double sensorScore = longD.freezeMaterial ? 0.8 : freezeSeen ? 0.5 : 0;
        Hypothesis sensor = Hypothesis.of("SENSOR", sensorScore, sensorScore > 0);
        sensor.evidenceGroups.add("FREEZE");
        v2.hypotheses.put("SENSOR", sensor);
    }
}
