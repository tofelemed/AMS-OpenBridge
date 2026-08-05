package com.ams.flink.cplm;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Stage 3 - Gate fusion (Gates 12-15): join of short + long feature records.
 *
 * <p>Calculation v3.0.0 - loop-type / dynamic-class aware decision grammar:
 * blocking exclusions first, multi-evidence stiction rule, geometry never alone
 * on FAST_SELF_REG, G14 0.89 no-VP cap, optional temporal persistence.
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
        CplmGateResult result = new CplmGateResult();
        result.loopId = longD.loopId != null ? longD.loopId : shortF.loopId;
        String loopType = firstNonEmpty(longD.loopType, shortF.loopType);
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : CplmDynamicsParameterSetSupport.resolveFromSpine(result.loopId, loopType, null);
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

        result.windowKind = longD.windowKind != null ? longD.windowKind : shortF.windowKind;
        result.windowStartMs = longD.windowStartMs > 0 ? longD.windowStartMs : shortF.windowStartMs;
        result.windowEndMs = longD.windowEndMs > 0 ? longD.windowEndMs : shortF.windowEndMs;
        result.samplePeriodSec = longD.samplePeriodSec > 0 ? longD.samplePeriodSec : shortF.samplePeriodSec;
        result.expectedSampleCount = shortF.expectedSampleCount;
        result.sampleCount = longD.sampleCount > 0 ? longD.sampleCount : shortF.sampleCount;

        // Gates 0-4 from short-feature stage
        result.completeness = shortF.completeness;
        result.badQualityPct = shortF.badQualityPct;
        result.duplicateTimestamps = shortF.duplicateTimestamps;
        result.samplingJitter = shortF.samplingJitter;
        result.gapCount = shortF.gapCount;
        result.maxGapS = shortF.maxGapS;
        result.gate0Status = shortF.gate0Status;
        result.autoPct = shortF.autoPct;
        result.manualPct = shortF.manualPct;
        result.modeChangesPerHour = shortF.modeChangesPerHour;
        result.gate1Status = shortF.gate1Status;
        result.spMin = shortF.spMin;
        result.spMax = shortF.spMax;
        result.spRange = shortF.spRange;
        result.spChangesPerHour = shortF.spChangesPerHour;
        result.gate2Status = shortF.gate2Status;
        result.gate2rStatus = shortF.gate2rStatus;
        result.operatingRegionValid = shortF.operatingRegionValid;
        result.mae = shortF.mae;
        result.rmse = shortF.rmse;
        result.iae = shortF.iae;
        result.ise = shortF.ise;
        result.itae = shortF.itae;
        result.goodErrorPct = shortF.goodErrorPct;
        result.oce = shortF.oce;
        result.pvStd = shortF.pvStd;
        result.opStd = shortF.opStd;
        result.effortRatio = shortF.effortRatio > 0 ? shortF.effortRatio : longD.effortRatio;
        result.opTravel = shortF.opTravel;
        result.travelPerDay = shortF.travelPerDay;
        result.reversalCount = shortF.reversalCount;
        result.reversalsPerHour = shortF.reversalsPerHour;
        result.saturationPct = shortF.saturationPct > 0 ? shortF.saturationPct : longD.saturationPct;
        result.gate3Status = shortF.gate3Status;
        result.gate4Status = shortF.gate4Status;

        // Gates 5-11 from long-diagnostics stage
        result.acfPeriodS = longD.acfPeriodS;
        result.acfRegularity = longD.acfRegularity;
        result.acfGamma0 = longD.acfGamma0;
        result.acfZeroCrossingCount = longD.acfZeroCrossingCount;
        result.acfPeriodCandidateCount = longD.acfPeriodCandidateCount;
        result.gate5Status = longD.gate5Status;
        result.fftPeakBin = longD.fftPeakBin;
        result.fftMaxBin = longD.fftMaxBin;
        result.fftPeakAmplitude = longD.fftPeakAmplitude;
        result.fftPeakFreqHz = longD.fftPeakFreqHz;
        result.fftPeakPeriodS = longD.fftPeakPeriodS;
        result.fftPeakToMedian = longD.fftPeakToMedian;
        result.fftPeakRatio = longD.fftPeakRatio;
        result.fftTotalEnergy = longD.fftTotalEnergy;
        result.fftH2Amp = longD.fftH2Amp;
        result.fftH3Amp = longD.fftH3Amp;
        result.fftH5Amp = longD.fftH5Amp;
        result.harmonicAmplitudeRatio = longD.harmonicAmplitudeRatio;
        result.harmonicEnergyRatio = longD.harmonicEnergyRatio;
        result.spectralEntropyBinCount = longD.spectralEntropyBinCount;
        result.spectralEntropy = longD.spectralEntropy;
        result.gate6Status = longD.gate6Status;
        result.triangularity = longD.triangularity;
        result.cycleSamples = longD.cycleSamples;
        result.cycleSource = longD.cycleSource;
        result.completedCycles = longD.completedCycles;
        result.validCycles = longD.validCycles;
        result.firstCycleSseSine = longD.firstCycleSseSine;
        result.firstCycleSseTriangle = longD.firstCycleSseTriangle;
        result.gate7Status = longD.gate7Status;
        result.horchOddness = longD.horchOddness;
        result.horchOddSum = longD.horchOddSum;
        result.horchEvenSum = longD.horchEvenSum;
        result.gate8Status = longD.gate8Status;
        result.phaseAreaNormPerCycle = longD.phaseAreaNormPerCycle;
        result.phaseBboxArea = longD.phaseBboxArea;
        result.phasePathArea = longD.phasePathArea;
        result.windowAreaNorm = longD.windowAreaNorm;
        result.cornerScoreRaw = longD.cornerScoreRaw > 0 ? longD.cornerScoreRaw : longD.cornerScore;
        result.cornerScoreQualified = longD.cornerScoreQualified;
        result.cornerScore = result.cornerScoreRaw;
        result.validTurningAngles = longD.validTurningAngles;
        result.gate9Status = longD.gate9Status;
        result.gate9Reason = longD.gate9Reason;
        result.periodStatus = longD.periodStatus != null ? longD.periodStatus : "NO_VALID_CYCLE";
        result.validatedPeriodS = longD.validatedPeriodS;
        result.periodRejectReason = longD.periodRejectReason;
        result.opRangePct = longD.opRangePct > 0 ? longD.opRangePct : 0;
        result.gate10Status = longD.gate10Status;
        result.freezeRunSamples = longD.freezeRunSamples;
        result.freezeIndexS = longD.freezeIndexS > 0 ? longD.freezeIndexS : shortF.freezeIndexS;
        result.pvQuantizationCount = longD.pvQuantizationCount;
        result.pvDriftPerDay = longD.pvDriftPerDay;
        result.deltaPvMean = longD.deltaPvMean;
        result.deltaPvStd = longD.deltaPvStd;
        result.spikeCount = longD.spikeCount;
        result.gate11Status = longD.gate11Status;
        result.observabilityFlags.addAll(longD.observabilityFlags);
        // Preserve every decision input even when fusion exits early for
        // insufficient data or a blocking exclusion.
        result.regionOutOfBandPct = shortF.regionOutOfBandPct;
        result.satLimitDwellSamples = longD.satLimitDwellSamples;
        result.satCyclingPattern = longD.satCyclingPattern;

        if (!shortF.sufficientData) {
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

        // --- BLOCKING exclusions (calc v3) ---
        if ("FAIL".equalsIgnoreCase(shortF.gate0Status)) {
            return blockDiagnosis(result, "EXCLUDED_DATA_QUALITY", "G0 data quality FAIL");
        }
        if ("EXCLUDED".equalsIgnoreCase(shortF.gate1Status)) {
            return blockDiagnosis(result, "EXCLUDED_MODE", "G1 mode/service EXCLUDED");
        }
        if (!shortF.operatingRegionValid || "FAIL".equalsIgnoreCase(shortF.gate2rStatus)) {
            return blockDiagnosis(result, "EXCLUDED_OPERATING_REGION", "G2r operating region invalid");
        }
        if ("WARN".equalsIgnoreCase(longD.gate11Status) && longD.freezeIndexS >= 60) {
            return blockDiagnosis(result, "EXCLUDED_SENSOR", "G11 sensor freeze dominant");
        }

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

        boolean hasVp = longD.hasVp;
        result.vpAvailable = hasVp;
        result.gate14Status = hasVp ? "CONFIRMED_CAPABLE" : "INSUFFICIENT_EVIDENCE";
        if (!hasVp && !result.observabilityFlags.contains("NO_VP")) {
            result.observabilityFlags.add("NO_VP");
        }
        double g14Cap = hasVp ? 1.0 : 0.89;
        result.g14ConfidenceCap = g14Cap;

        double oscillationScore = clamp01(result.acfRegularity);
        double fftScore = clamp01(result.fftPeakRatio);
        double effortScore = clamp01(result.effortRatio / 8.0);
        double stictionScore = clamp01(result.triangularity);
        double horchScore = clamp01(result.horchOddness);
        double geometryScore = clamp01(result.cornerScoreQualified > 0 || "VALID".equals(result.periodStatus)
                ? result.cornerScoreQualified
                : 0);
        result.oscillationScore = oscillationScore;
        result.fftScore = fftScore;
        result.effortScore = effortScore;
        result.stictionScore = stictionScore;
        result.horchScore = horchScore;
        result.geometryScore = geometryScore;

        boolean oscillationQualified = isQualified(Math.max(oscillationScore, fftScore),
                result.gate5Status, result.gate6Status)
                || (profile.dynamicClass == CplmLoopDynamicsProfile.DynamicClass.SLOW_SELF_REG
                && isStrongOrWarn(result.gate8Status)
                && "VALID".equals(result.periodStatus)
                && result.completedCycles >= profile.minValidCycles);
        boolean oscillationEvidence = oscillationQualified;
        boolean harmonicOrShape = isStrongOrWarn(result.gate6Status) && result.harmonicAmplitudeRatio > 0.15
                || isStrongOrWarn(result.gate7Status)
                || isStrongOrWarn(result.gate8Status)
                || stictionScore >= 0.55
                || horchScore >= 0.55;
        boolean actuatorStress = isStrongOrWarn(result.gate4Status)
                || isStrongOrWarn(result.gate10Status)
                || result.effortRatio >= profile.effortRatioFloor * 2
                || result.opRangePct >= profile.opTravelFloorPct
                || longD.satCyclingPattern
                || result.reversalCount >= 3;

        List<String> geoReasons = new ArrayList<>();
        boolean geometryEvidenceOk = evaluateGeometryEvidence(result, profile, geoReasons);
        // Geometry may contribute to family score only when prerequisites are met on FAST classes.
        boolean geometryPrereqsMet = oscillationEvidence && harmonicOrShape && actuatorStress;
        boolean geometrySelectable = geometryEvidenceOk
                && profile.geometryFamilyEnabled
                && profile.geometryRole != CplmLoopDynamicsProfile.GateRole.DISPLAY_ONLY
                && (profile.geometryRole == CplmLoopDynamicsProfile.GateRole.PRIMARY
                || geometryPrereqsMet);

        double familyGeometry = geometrySelectable
                ? clamp01(result.cornerScoreQualified) * profile.priorGeometry
                : 0;

        // Multi-evidence stiction path (never geometry alone).
        boolean stictionMultiEvidence = (!profile.requireOscillationForStiction || oscillationEvidence)
                && harmonicOrShape
                && actuatorStress;
        int nonGeoEvidence = 0;
        if (oscillationEvidence) nonGeoEvidence++;
        if (harmonicOrShape) nonGeoEvidence++;
        if (actuatorStress) nonGeoEvidence++;
        boolean stictionQualified = stictionMultiEvidence
                && nonGeoEvidence >= Math.max(2, profile.minNonGeometryEvidences)
                && (isStrongOrWarn(result.gate7Status) || isStrongOrWarn(result.gate8Status)
                || stictionScore >= 0.55 || horchScore >= 0.55);

        // Disturbance soft-block: peer links + oscillation without actuator stress.
        if (hasPeerLinks && oscillationEvidence && !actuatorStress) {
            stictionQualified = false;
            result.familyDisqualifiers.add("stiction:DISTURBANCE_CONTEXT");
            result.observabilityFlags.add("DISTURBANCE_CONTEXT");
        }

        double familyStiction = stictionQualified
                ? Math.max(stictionScore, horchScore) * profile.priorStiction
                : Math.max(stictionScore, horchScore);
        double familyOscillation = oscillationQualified
                ? Math.max(oscillationScore, fftScore) * profile.priorOscillation
                : Math.max(oscillationScore, fftScore);
        boolean effortQualified = isQualified(effortScore, result.gate4Status, result.gate10Status);
        double familyEffort = effortQualified
                ? effortScore * profile.priorEffort
                : effortScore;

        double weightedRaw =
                0.15 * oscillationScore
                + 0.15 * fftScore
                + 0.15 * effortScore
                + 0.20 * stictionScore
                + 0.20 * horchScore
                + 0.15 * geometryScore;
        result.rawFinalElementScore = weightedRaw;

        result.stictionFamilyScore = familyStiction;
        result.oscillationFamilyScore = familyOscillation;
        result.effortFamilyScore = familyEffort;
        result.geometryFamilyScore = familyGeometry;
        result.stictionQualified = stictionQualified;
        result.oscillationQualified = oscillationQualified || oscillationEvidence;
        result.effortQualified = effortQualified;
        result.geometryQualified = geometrySelectable;

        result.familyDisqualifiers = result.familyDisqualifiers == null ? new ArrayList<>() : result.familyDisqualifiers;
        if (!stictionQualified) result.familyDisqualifiers.add("stiction:FAMILY_DISQUALIFIED");
        if (!oscillationQualified) result.familyDisqualifiers.add("oscillation:FAMILY_DISQUALIFIED");
        if (!effortQualified) result.familyDisqualifiers.add("effort:FAMILY_DISQUALIFIED");
        if (!geometrySelectable) {
            if (geometryEvidenceOk && profile.isGeometryDecisiveForbidden() && !geometryPrereqsMet) {
                result.familyDisqualifiers.add("geometry:GEOMETRY_ALONE_FORBIDDEN");
            } else {
                String joined = geoReasons.isEmpty() ? "FAMILY_DISQUALIFIED" : String.join(",", geoReasons);
                result.familyDisqualifiers.add("geometry:" + joined);
            }
        }

        String[] names = {"stiction", "oscillation", "effort", "geometry"};
        double[] scores = {familyStiction, familyOscillation, familyEffort, familyGeometry};
        boolean[] qualified = {stictionQualified, oscillationQualified, effortQualified, geometrySelectable};

        boolean anyQualified = false;
        for (boolean q : qualified) {
            if (q) {
                anyQualified = true;
                break;
            }
        }

        if (!anyQualified) {
            result.selectedFamily = "NONE";
            result.familyScore = 0;
            result.confidence = 0;
            result.diagnosis = "INSUFFICIENT_EVIDENCE";
            result.gate15Status = "INSUFFICIENT_EVIDENCE";
            result.severity = "LOW";
            result.insufficientEvidenceReason = buildInsufficientEvidenceReason(result, hasVp);
            result.recommendation = result.insufficientEvidenceReason
                    + " Bind VP or obtain a valid oscillation period before diagnosing.";
            result.statusReason = String.format(
                    "selected_family=NONE, family_score=0.000, weighted=%.3f, confidence=0.000, G14_cap=%.2f, reasons=%s",
                    weightedRaw, g14Cap, String.join("; ", result.familyDisqualifiers));
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
            if (!geometryPrereqsMet || !stictionQualified) {
                result.selectedFamily = "NONE";
                result.familyScore = 0;
                result.confidence = 0;
                result.diagnosis = "INSUFFICIENT_EVIDENCE";
                result.gate15Status = "INSUFFICIENT_EVIDENCE";
                result.severity = "LOW";
                result.familyDisqualifiers.add("geometry:GEOMETRY_ALONE_FORBIDDEN");
                result.insufficientEvidenceReason = buildInsufficientEvidenceReason(result, hasVp);
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
        double finalConfidence = Math.min(familyScore, g14Cap);
        result.confidence = finalConfidence;

        applyDiagnosisBands(result, finalConfidence, hasVp);

        result.recommendation = hasVp
                ? "Review positioner/HART data and perform controlled bump test before retuning."
                : "Check VP/positioner data or perform an approved bump/stroke test before retuning.";

        result.statusReason = String.format(
                "selected_family=%s, family_score=%.3f, weighted=%.3f, confidence=%.3f, G14_cap=%.2f, class=%s, profile=%s",
                selected, familyScore, weightedRaw, finalConfidence, g14Cap,
                profile.loopClass.name(), profile.gateProfileId);

        return result;
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
            result.diagnosis = "DETECTED_FINAL_ELEMENT_NONLINEARITY";
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

    private static CplmGateResult blockDiagnosis(CplmGateResult result, String diagnosis, String reason) {
        result.selectedFamily = "NONE";
        result.familyScore = 0;
        result.confidence = 0;
        result.diagnosis = diagnosis;
        result.gate15Status = "INSUFFICIENT_EVIDENCE";
        result.severity = "LOW";
        result.insufficientEvidenceReason = reason;
        result.recommendation = reason;
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

    private static boolean evaluateGeometryEvidence(
            CplmGateResult result, CplmLoopDynamicsProfile profile, List<String> reasons) {
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

    private static boolean isQualified(double score, String statusA, String statusB) {
        if (score >= 0.55) return true;
        if (isStrongOrWarn(statusA)) return true;
        return isStrongOrWarn(statusB);
    }

    private static boolean isStrongOrWarn(String status) {
        if (status == null) return false;
        return "STRONG".equalsIgnoreCase(status) || "WARN".equalsIgnoreCase(status);
    }

    private static double clamp01(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return 0;
        return Math.max(0, Math.min(1.0, v));
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a;
        if (b != null && !b.trim().isEmpty()) return b;
        return null;
    }

    private static void applyDiagnosisBands(CplmGateResult result, double confidence, boolean hasVp) {
        if (confidence < 0.35) {
            result.diagnosis = "NO_CALL";
            result.gate15Status = "INSUFFICIENT_EVIDENCE";
            result.severity = "LOW";
        } else if (confidence < 0.55) {
            result.diagnosis = "DETECTED_FINAL_ELEMENT_NONLINEARITY";
            result.gate15Status = "SUSPECTED";
            result.severity = "LOW";
        } else if (confidence < 0.75) {
            result.diagnosis = "CLASSIFIED_FINAL_ELEMENT_NONLINEARITY";
            result.gate15Status = "SUSPECTED";
            result.severity = "MEDIUM";
        } else if (confidence < 0.90) {
            result.diagnosis = "SUSPECTED_FINAL_ELEMENT_NONLINEARITY";
            result.gate15Status = "SUSPECTED";
            result.severity = "HIGH";
        } else {
            if (hasVp) {
                result.diagnosis = "CONFIRMED_FINAL_ELEMENT_NONLINEARITY";
                result.gate15Status = "CONFIRMED";
                result.severity = "HIGH";
            } else {
                result.confidence = Math.min(confidence, 0.89);
                result.diagnosis = "SUSPECTED_FINAL_ELEMENT_NONLINEARITY";
                result.gate15Status = "SUSPECTED";
                result.severity = "HIGH";
            }
        }
    }

    /** Human-readable zero-dead-end copy for G15 INSUFFICIENT_EVIDENCE (UI / KPI aggregation). */
    static String buildInsufficientEvidenceReason(CplmGateResult result, boolean hasVp) {
        java.util.LinkedHashSet<String> parts = new java.util.LinkedHashSet<>();
        if (!"VALID".equals(result.periodStatus) || result.completedCycles < 1) {
            parts.add("no valid oscillation cycle");
        }
        if (!hasVp) {
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
        if (!shortF.sufficientData) {
            CplmLongDiagnosticsResult empty = new CplmLongDiagnosticsResult();
            empty.loopId = shortF.loopId;
            empty.windowKind = windowKind;
            return fuse(shortF, empty, hasStepTestEvidence, hasPeerLinks, profile);
        }
        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(
                samples, windowStartMs, windowEndMs, windowKind, profile);
        return fuse(shortF, longD, hasStepTestEvidence, hasPeerLinks, profile);
    }
}
