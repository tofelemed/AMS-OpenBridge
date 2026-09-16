package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.condition.OpenConditions;

/**
 * Stage 3 input carry-over. Every short-stage (G0-G4) and long-stage (G5-G11) decision input
 * is copied onto the fused record BEFORE any early exit, so a blocked or insufficient row still
 * carries what was measured (P1-10, P2-6). Split out of CplmGateFusionEngine in v2.5 (1E.1);
 * no field mapping changed.
 */
public final class FusionInputs {
    private FusionInputs() {
    }

    /** Gates 0-4 from the short-feature stage. */
    public static void copyShort(CplmGateResult result, CplmShortFeatureResult shortF, CplmLongDiagnosticsResult longD) {
        result.completeness = shortF.completeness;
        result.badQualityPct = shortF.badQualityPct;
        result.unknownQualityPct = shortF.unknownQualityPct;
        result.gate0Reason = shortF.gate0Reason;
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
        // P2-6: "> 0" treated a genuine zero as missing and silently spliced in
        // another stage's value computed on a different sample set. The honest
        // predicate is whether the short stage actually ran.
        result.effortRatio = shortF.sufficientData ? shortF.effortRatio : longD.effortRatio;
        result.effortRatioNormalized = shortF.effortRatioNormalized; // P2-3
        result.gate2BandEu = shortF.gate2BandEu;
        result.gate2BandSource = shortF.gate2BandSource;
        result.activityRatioNorm = shortF.activityRatioNorm;
        result.activityBasis = shortF.activityBasis;
        result.activityReason = shortF.activityReason;
        result.gate4WarnRatio = shortF.gate4WarnRatio;
        result.gate4HighRatio = shortF.gate4HighRatio;
        result.opTravel = shortF.opTravel;
        result.travelPerDay = shortF.travelPerDay;
        result.reversalCount = shortF.reversalCount;
        result.reversalsPerHour = shortF.reversalsPerHour;
        result.saturationPct = shortF.sufficientData ? shortF.saturationPct : longD.saturationPct; // P2-6
        result.gate3Status = shortF.gate3Status;
        result.gate4Status = shortF.gate4Status;
    }

    /** Gates 5-11 from the long-diagnostics stage, plus every long-tier decision input. */
    public static void copyLong(CplmGateResult result, CplmShortFeatureResult shortF, CplmLongDiagnosticsResult longD) {
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
        result.cornerScore = result.cornerScoreRaw; // P2-4 reverted - see CplmGateEngine
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
        result.satLimitDwellS = longD.satLimitDwellS;
        result.limitSource = longD.limitSource;
        result.limitDwellWarnS = longD.limitDwellWarnS;
        result.dwellEvents = longD.dwellEvents;
        result.freezeEvents = longD.freezeEvents;
        result.freezeMaterial = longD.freezeMaterial;
        result.gate11Reason = longD.gate11Reason;
    }

    /**
     * v2.5 R11: fast-path conditions observed since the last long slice. An open limit raises
     * G10 to at least WARN; an open freeze makes G11 WARN - as evidence, never as an exclusion
     * (only a MATERIAL freeze excludes) and never as a confirmation.
     */
    public static void applyOpenConditions(CplmGateResult result, CplmLongDiagnosticsResult longD, OpenConditions oc) {
        result.openConditions = oc;
        if (oc.hasOpenLimit) {
            if (!"WARN".equalsIgnoreCase(result.gate10Status) && !"STRONG".equalsIgnoreCase(result.gate10Status)) {
                result.gate10Status = "WARN";
            }
            result.observabilityFlags.add("OPEN_LIMIT_CONDITION");
        }
        if (oc.hasOpenFreeze) {
            if (!"WARN".equalsIgnoreCase(result.gate11Status)) result.gate11Status = "WARN";
            if (!longD.freezeMaterial) result.gate11Reason = "OPEN_FREEZE_CONDITION";
            result.observabilityFlags.add("OPEN_FREEZE_CONDITION");
        }
    }
}
