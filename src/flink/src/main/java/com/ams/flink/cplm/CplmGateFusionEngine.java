package com.ams.flink.cplm;

import com.ams.flink.cplm.condition.OpenConditions;
import com.ams.flink.cplm.fusion.BlockingExclusions;
import com.ams.flink.cplm.fusion.Confirmation;
import com.ams.flink.cplm.fusion.DiagnosisBands;
import com.ams.flink.cplm.fusion.FusionEvidence;
import com.ams.flink.cplm.fusion.FusionInputs;
import com.ams.flink.cplm.fusion.FusionVerdictV2;
import com.ams.flink.cplm.fusion.VerdictAssembly;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Stage 3 - Gate fusion (Gates 12-15): join of short + long feature records.
 *
 * <p>Calculation v3.0.0 - loop-type / dynamic-class aware decision grammar: blocking
 * exclusions first, multi-evidence stiction rule, geometry never alone on FAST_SELF_REG,
 * optional temporal persistence.
 *
 * <p>v2.5 (1E.1, spec v6 R02/R07): the verdict separates what was OBSERVED
 * ({@link FusionEvidence} / observations), what is HYPOTHESISED (hypotheses) and what is
 * CONFIRMED ({@link Confirmation}, a fault-scoped claim needing positive evidence). VP presence
 * confirms nothing; the confirmation cap applies to a final-element claim only. This class is
 * the orchestrator; the stages live in {@code com.ams.flink.cplm.fusion}.
 */
public final class CplmGateFusionEngine implements Serializable {

    private CplmGateFusionEngine() {
    }

    public static CplmGateResult fuse(CplmShortFeatureResult shortF, CplmLongDiagnosticsResult longD) {
        return fuse(shortF, longD, false, false, null);
    }

    public static CplmGateResult fuse(
            CplmShortFeatureResult shortF,
            CplmLongDiagnosticsResult longD,
            boolean hasStepTestEvidence,
            boolean hasPeerLinks) {
        return fuse(shortF, longD, hasStepTestEvidence, hasPeerLinks, null);
    }

    /**
     * @param hasStepTestEvidence true when approved step-test metadata is bound to the loop
     * @param hasPeerLinks        true when peer/upstream tags or graph links exist
     * @param profileOrNull       optional dynamics profile; resolved from loopId/loopType when null
     */
    public static CplmGateResult fuse(
            CplmShortFeatureResult shortF,
            CplmLongDiagnosticsResult longD,
            boolean hasStepTestEvidence,
            boolean hasPeerLinks,
            CplmLoopDynamicsProfile profileOrNull) {
        return fuse(shortF, longD, hasStepTestEvidence, hasPeerLinks, profileOrNull, null);
    }

    /**
     * v2.5 (Task 1D.5, R11): as above, plus the fast-path conditions open as of this slice
     * (see {@link FusionInputs#applyOpenConditions}).
     *
     * @param openConditions summary of the conditions open for this loop; null/none = no fast evidence
     */
    public static CplmGateResult fuse(
            CplmShortFeatureResult shortF,
            CplmLongDiagnosticsResult longD,
            boolean hasStepTestEvidence,
            boolean hasPeerLinks,
            CplmLoopDynamicsProfile profileOrNull,
            OpenConditions openConditions) {
        CplmGateResult result = new CplmGateResult();
        result.loopId = longD.loopId != null ? longD.loopId : shortF.loopId;
        String loopType = firstNonEmpty(longD.loopType, shortF.loopType);
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : CplmDynamicsParameterSetSupport.resolveFromSpine(result.loopId, loopType, null);
        stampProfile(result, profile, longD);
        stampWindow(result, shortF, longD);

        FusionInputs.copyShort(result, shortF, longD);
        FusionInputs.copyLong(result, shortF, longD);
        OpenConditions oc = openConditions != null ? openConditions : OpenConditions.none();
        FusionInputs.applyOpenConditions(result, longD, oc);

        // P1-10: stamp the provenance of the long-tier metrics copied above
        // BEFORE any early return, so every row carries it.
        result.longMetricsQualified =
                shortF.sufficientData && !"FAIL".equalsIgnoreCase(shortF.gate0Status);

        if (!shortF.sufficientData) {
            return BlockingExclusions.insufficientData(result);
        }

        // --- BLOCKING exclusions (calc v3) ---
        if ("FAIL".equalsIgnoreCase(shortF.gate0Status)) {
            return BlockingExclusions.block(result, "EXCLUDED_DATA_QUALITY", "G0 data quality FAIL");
        }
        if ("EXCLUDED".equalsIgnoreCase(shortF.gate1Status)) {
            return BlockingExclusions.block(result, "EXCLUDED_MODE", "G1 mode/service EXCLUDED");
        }
        if (!shortF.operatingRegionValid || "FAIL".equalsIgnoreCase(shortF.gate2rStatus)) {
            return BlockingExclusions.block(result, "EXCLUDED_OPERATING_REGION", "G2r operating region invalid");
        }
        // v2.5 R08: a freeze EPISODE is evidence (G11 WARN, retained); only a MATERIAL freeze
        // (>= 60 s AND >= 10 % of the window - the P1-1 rule) excludes the window.
        if (longD.freezeMaterial) {
            return BlockingExclusions.block(result, "EXCLUDED_SENSOR", "G11 sensor freeze dominant");
        }

        stampContextGates(result, hasStepTestEvidence, hasPeerLinks);

        boolean hasVp = longD.hasVp;
        result.vpAvailable = hasVp;
        if (!hasVp && !result.observabilityFlags.contains("NO_VP")) {
            result.observabilityFlags.add("NO_VP");
        }
        // v2.5 R02: G14 is a fault-scoped confirmation from MEASURED VP tracking, never from
        // VP presence. Its cap applies to a final-element claim only; the status is set once
        // the family is known (NOT_APPLICABLE for symptom families).
        Confirmation conf = Confirmation.evaluate(longD, profile);
        double g14Cap = conf.capForFinalElement();
        result.g14ConfidenceCap = g14Cap;
        FusionVerdictV2 v2 = result.verdictV2;

        FusionEvidence ev = FusionEvidence.evaluate(result, longD, profile, hasPeerLinks);
        VerdictAssembly.assemble(v2, ev, result, longD, oc, profile);
        result.stictionQualified = ev.stictionQualified;
        result.oscillationQualified = ev.oscillationQualified || ev.oscillationEvidence;
        result.effortQualified = ev.effortQualified;
        result.geometryQualified = ev.geometrySelectable;
        recordDisqualifiers(result, ev, profile);

        String[] names = {"stiction", "oscillation", "effort", "geometry"};
        double[] scores = {ev.familyStiction, ev.familyOscillation, ev.familyEffort, ev.familyGeometry};
        boolean[] qualified = {ev.stictionQualified, ev.oscillationQualified, ev.effortQualified, ev.geometrySelectable};

        boolean anyQualified = false;
        for (boolean q : qualified) {
            if (q) {
                anyQualified = true;
                break;
            }
        }

        if (!anyQualified) {
            noFamily(result, v2, conf, hasVp);
            result.recommendation = result.insufficientEvidenceReason
                    + " Bind VP or obtain a valid oscillation period before diagnosing.";
            result.statusReason = String.format(
                    "selected_family=NONE, family_score=0.000, weighted=%.3f, confidence=0.000, G14_cap=%.2f, reasons=%s",
                    ev.weightedRaw, g14Cap, String.join("; ", result.familyDisqualifiers));
            return result;
        }

        String selected = "NONE";
        double familyScore = 0;
        double best = -1;
        for (int i = 0; i < names.length; i++) {
            if (!qualified[i]) continue;
            if (scores[i] > best) {
                best = scores[i];
                selected = names[i];
                familyScore = scores[i];
            }
        }

        // Hard rule: never allow geometry as sole selected family when forbidden.
        if ("geometry".equals(selected) && profile.isGeometryDecisiveForbidden()) {
            if (!ev.geometryPrereqsMet || !ev.stictionQualified) {
                result.familyDisqualifiers.add("geometry:GEOMETRY_ALONE_FORBIDDEN");
                noFamily(result, v2, conf, hasVp);
                result.recommendation = result.insufficientEvidenceReason
                        + " Geometry alone cannot diagnose valve nonlinearity on this loop class.";
                result.statusReason = String.format(
                        "selected_family=NONE, GEOMETRY_ALONE_FORBIDDEN, class=%s, G14_cap=%.2f",
                        profile.loopClass.name(), g14Cap);
                return result;
            }
        }

        result.selectedFamily = selected;
        result.familyScore = familyScore;
        // v2.5 R02: the confirmation (and its cap) applies to a FINAL-ELEMENT claim only.
        boolean finalElementClaim = "stiction".equals(selected) || "geometry".equals(selected);
        double finalConfidence = Math.min(familyScore, finalElementClaim ? g14Cap : 1.0);
        result.confidence = finalConfidence;
        result.gate14Status = finalElementClaim ? conf.state : "NOT_APPLICABLE";
        v2.confirmation = finalElementClaim ? conf : conf.notApplicable();
        if (finalElementClaim && "CONTRADICTED".equals(conf.state)) {
            result.observabilityFlags.add("VP_TRACKING_CONTRADICTS");
            v2.hypothesis("STICTION").contradictions.add("VP_TRACKING_HEALTHY");
        }
        v2.leadingHypothesis = DiagnosisBands.leadingHypothesisFor(selected, ev.disturbanceContext);

        DiagnosisBands.apply(result, finalConfidence, DiagnosisBands.familyLabel(selected), result.gate14Status);

        result.recommendation = hasVp
                ? "Review positioner/HART data and perform controlled bump test before retuning."
                : "Check VP/positioner data or perform an approved bump/stroke test before retuning.";

        result.statusReason = String.format(
                "selected_family=%s, family_score=%.3f, weighted=%.3f, confidence=%.3f, G14_cap=%.2f, class=%s, profile=%s",
                selected, familyScore, ev.weightedRaw, finalConfidence, g14Cap,
                profile.loopClass.name(), profile.gateProfileId);

        return result;
    }

    private static void stampProfile(CplmGateResult result, CplmLoopDynamicsProfile profile, CplmLongDiagnosticsResult longD) {
        result.calculationVersion = profile.calculationVersion;
        result.dynamicsProfileVersion = profile.dynamicsProfileVersion;
        result.dynamicsClass = profile.loopClass.name();
        result.profileSource = profile.profileSource.name();
        result.gateProfileId = profile.gateProfileId;
        result.dynamicClass = profile.dynamicClass.name();
        result.stictionSignal = longD.stictionSignal != null && !longD.stictionSignal.isEmpty()
                ? longD.stictionSignal
                : profile.stictionSignal();
        result.persistenceWindowsRequired = profile.persistenceWindows;
        if (longD.configurationVersion != null && !longD.configurationVersion.isEmpty()) {
            result.configurationVersion = longD.configurationVersion;
        }
    }

    private static void stampWindow(CplmGateResult result, CplmShortFeatureResult shortF, CplmLongDiagnosticsResult longD) {
        result.windowKind = longD.windowKind != null ? longD.windowKind : shortF.windowKind;
        result.windowStartMs = longD.windowStartMs > 0 ? longD.windowStartMs : shortF.windowStartMs;
        result.windowEndMs = longD.windowEndMs > 0 ? longD.windowEndMs : shortF.windowEndMs;
        result.samplePeriodSec = longD.samplePeriodSec > 0 ? longD.samplePeriodSec : shortF.samplePeriodSec;
        result.expectedSampleCount = shortF.expectedSampleCount;
        result.sampleCount = longD.sampleCount > 0 ? longD.sampleCount : shortF.sampleCount;
    }

    /** G12 / G13 are still legacy flags in this release (LEGACY_FLAG_ONLY; Phase 2 replaces them). */
    private static void stampContextGates(CplmGateResult result, boolean hasStepTestEvidence, boolean hasPeerLinks) {
        if (hasStepTestEvidence) {
            result.gate12Status = "PASS";
            result.hasStepTestEvidence = true;
        } else {
            result.gate12Status = "NOT_EVALUATED";
            result.hasStepTestEvidence = false;
            if (!result.observabilityFlags.contains("NO_STEP_TEST")) {
                result.observabilityFlags.add("NO_STEP_TEST");
            }
        }
        if (hasPeerLinks) {
            result.gate13Status = "PASS";
            result.hasPeerLinks = true;
            // When peer links exist and oscillation is present without actuator stress,
            // treat as potential victim / disturbance context (soft block of stiction later).
        } else {
            result.gate13Status = "NOT_EVALUATED";
            result.hasPeerLinks = false;
            if (!result.observabilityFlags.contains("NO_UPSTREAM_LINKS")) {
                result.observabilityFlags.add("NO_UPSTREAM_LINKS");
            }
        }
    }

    private static void recordDisqualifiers(CplmGateResult result, FusionEvidence ev, CplmLoopDynamicsProfile profile) {
        result.familyDisqualifiers = result.familyDisqualifiers == null ? new ArrayList<>() : result.familyDisqualifiers;
        if (!ev.stictionQualified) result.familyDisqualifiers.add("stiction:FAMILY_DISQUALIFIED");
        if (!ev.oscillationQualified) result.familyDisqualifiers.add("oscillation:FAMILY_DISQUALIFIED");
        if (!ev.effortQualified) result.familyDisqualifiers.add("effort:FAMILY_DISQUALIFIED");
        if (!ev.geometrySelectable) {
            if (ev.geometryEvidenceOk && profile.isGeometryDecisiveForbidden() && !ev.geometryPrereqsMet) {
                result.familyDisqualifiers.add("geometry:GEOMETRY_ALONE_FORBIDDEN");
            } else {
                String joined = ev.geometryReasons.isEmpty() ? "FAMILY_DISQUALIFIED" : String.join(",", ev.geometryReasons);
                result.familyDisqualifiers.add("geometry:" + joined);
            }
        }
    }

    /** No family qualified (or the only one is forbidden): INSUFFICIENT_EVIDENCE, G14 not applicable. */
    private static void noFamily(CplmGateResult result, FusionVerdictV2 v2, Confirmation conf, boolean hasVp) {
        result.selectedFamily = "NONE";
        result.familyScore = 0;
        result.confidence = 0;
        result.diagnosis = "INSUFFICIENT_EVIDENCE";
        result.gate15Status = "INSUFFICIENT_EVIDENCE";
        result.severity = "LOW";
        result.gate14Status = "NOT_APPLICABLE";
        v2.confirmation = conf.notApplicable();
        result.insufficientEvidenceReason = DiagnosisBands.insufficientEvidenceReason(result, hasVp);
    }

    /**
     * Apply temporal persistence: SUSPECTED/CONFIRMED require multi-window agreement.
     * Single-window evidence is capped at DETECTED unless persistence is satisfied.
     *
     * @param priorFamilies ordered oldest->newest selectedFamily values (excluding current)
     */
    public static CplmGateResult applyPersistence(
            CplmGateResult result,
            List<String> priorFamilies,
            CplmLoopDynamicsProfile profileOrNull) {
        if (result == null) return null;
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : CplmDynamicsParameterSetSupport.resolveFromSpine(result.loopId, null, null);
        int need = Math.max(1, profile.persistenceMinAgree);
        int window = Math.max(need, profile.persistenceWindows);
        result.persistenceWindowsRequired = window;

        String current = result.selectedFamily;
        if (current == null || "NONE".equals(current)) {
            result.persistenceAgreeCount = 0;
            result.persistenceSatisfied = true;
            return result;
        }

        int agree = 1; // current window
        if (priorFamilies != null) {
            int from = Math.max(0, priorFamilies.size() - (window - 1));
            for (int i = from; i < priorFamilies.size(); i++) {
                if (current.equals(priorFamilies.get(i))) agree++;
            }
        }
        result.persistenceAgreeCount = agree;
        boolean satisfied = agree >= need;
        result.persistenceSatisfied = satisfied;

        if (!satisfied
                && ("SUSPECTED".equals(result.gate15Status) || "CONFIRMED".equals(result.gate15Status))) {
            // Cap single-window calls at DETECTED.
            result.diagnosis = "DETECTED_" + DiagnosisBands.familyLabel(result.selectedFamily);
            result.gate15Status = "SUSPECTED";
            result.severity = "LOW";
            if (result.confidence > 0.54) {
                result.confidence = 0.54;
            }
            result.statusReason = (result.statusReason == null ? "" : result.statusReason)
                    + String.format("; persistence_cap agree=%d/%d", agree, need);
            result.observabilityFlags.add("PERSISTENCE_CAP");
        }
        return result;
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a;
        if (b != null && !b.trim().isEmpty()) return b;
        return null;
    }

    public static CplmGateResult fuseFromSamples(
            List<CplmNormalizedSample> samples, long windowStartMs, long windowEndMs, String windowKind) {
        return fuseFromSamples(samples, windowStartMs, windowEndMs, windowKind, false, false, null);
    }

    public static CplmGateResult fuseFromSamples(
            List<CplmNormalizedSample> samples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            boolean hasStepTestEvidence,
            boolean hasPeerLinks) {
        return fuseFromSamples(samples, windowStartMs, windowEndMs, windowKind, hasStepTestEvidence, hasPeerLinks, null);
    }

    public static CplmGateResult fuseFromSamples(
            List<CplmNormalizedSample> samples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            boolean hasStepTestEvidence,
            boolean hasPeerLinks,
            CplmLoopDynamicsProfile profileOrNull) {
        String loopId = samples == null || samples.isEmpty() ? "UNKNOWN" : samples.get(0).loopId;
        String loopType = null;
        String assetUuid = null;
        if (samples != null) {
            for (CplmNormalizedSample s : samples) {
                if (loopType == null && s.loopType != null && !s.loopType.trim().isEmpty()) loopType = s.loopType;
                if (assetUuid == null && s.assetUuid != null && !s.assetUuid.trim().isEmpty()) assetUuid = s.assetUuid;
            }
        }
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : CplmDynamicsParameterSetSupport.resolveFromSpine(loopId, loopType, assetUuid);
        CplmShortFeatureResult shortF = CplmGateEngine.computeShortFeatures(
                samples, windowStartMs, windowEndMs, windowKind, profile);
        // P2-5: previously an EMPTY long result was substituted when short data
        // was insufficient, while the streaming path passes the real one - so
        // the same window carried different metrics depending on which job wrote
        // it, and the row with LESS data reported MORE. Compute the long
        // diagnostics unconditionally, exactly like streaming; fuse() handles
        // insufficiency itself and P1-10's long_metrics_qualified flags the
        // provenance either way.
        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(
                samples, windowStartMs, windowEndMs, windowKind, profile);
        return fuse(shortF, longD, hasStepTestEvidence, hasPeerLinks, profile);
    }
}
