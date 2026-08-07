package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * CPLM gate calculation engine — Gates 0–15 per
 * CPLM_Flink_PID_Loop_Gate_Calculation_Reference_Manual (SYN_TIC_001 golden set).
 * Uses population standard deviation (ddof=0) for streaming KPIs.
 */
public final class CplmGateEngine implements Serializable {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final double GOOD_ERROR_BAND = 0.5;
    private static final double SP_CHANGE_THRESHOLD = 1e-6;
    private static final double OP_REVERSAL_EPS = 1e-9;
    private static final double PV_FREEZE_EPS = 1e-9;
    private static final int HORCH_MAX_LAG = 200;
    /** Legacy default; dynamics-aware path uses profile.cornerAngleDeg. */
    private static final double CORNER_ANGLE_THRESHOLD = Math.toRadians(45);
    private static final double PHASE_STRONG_THRESHOLD = 0.30;

    private CplmGateEngine() {
    }

    public static CplmGateResult compute(List<CplmNormalizedSample> rawSamples, long windowStartMs, long windowEndMs) {
        return CplmGateFusionEngine.fuseFromSamples(rawSamples, windowStartMs, windowEndMs, "24h");
    }

    public static CplmGateResult compute(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            CplmLoopDynamicsProfile profile) {
        return CplmGateFusionEngine.fuseFromSamples(rawSamples, windowStartMs, windowEndMs, "24h", false, false, profile);
    }

    /** Stage 1 — short-window features (Gates 0–4 + G2r). Used by CplmShortFeatureStreamJob. */
    public static CplmShortFeatureResult computeShortFeatures(
            List<CplmNormalizedSample> rawSamples, long windowStartMs, long windowEndMs, String windowKind) {
        return computeShortFeatures(rawSamples, windowStartMs, windowEndMs, windowKind, null);
    }

    public static CplmShortFeatureResult computeShortFeatures(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            CplmLoopDynamicsProfile profileOrNull) {
        CplmShortFeatureResult result = new CplmShortFeatureResult();
        result.windowKind = windowKind;
        result.windowStartMs = windowStartMs;
        result.windowEndMs = windowEndMs;

        // Strict event-time [start, end) boundary — never include the end sample.
        List<CplmNormalizedSample> samples = filterHalfOpen(rawSamples, windowStartMs, windowEndMs);
        result.loopId = samples.isEmpty()
                ? (rawSamples.isEmpty() ? "UNKNOWN" : rawSamples.get(0).loopId)
                : samples.get(0).loopId;

        String loopType = firstNonBlank(samples, rawSamples, s -> s.loopType);
        String assetUuid = firstNonBlank(samples, rawSamples, s -> s.assetUuid);
        CplmLoopDynamicsProfile carriedProfile = firstResolvedProfile(samples, rawSamples);
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : carriedProfile != null
                ? carriedProfile
                : CplmDynamicsParameterSetSupport.resolveFromSpine(result.loopId, loopType, assetUuid);
        result.calculationVersion = profile.calculationVersion;
        result.dynamicsProfileVersion = profile.dynamicsProfileVersion;
        result.dynamicsClass = profile.loopClass.name();
        result.gateProfileId = profile.gateProfileId;
        result.loopType = loopType != null ? loopType : "";
        result.assetUuid = assetUuid != null ? assetUuid : "";

        int n = samples.size();

        double tsSec = inferSamplePeriodSec(samples);
        result.samplePeriodSec = tsSec;
        long windowSec = Math.max(1, (windowEndMs - windowStartMs) / 1000);
        // Gate 0: never allow expectedSamples to truncate to 0 on micro-batches.
        int expectedSamples = tsSec > 0 ? (int) Math.max(1, Math.round((double) windowSec / tsSec)) : Math.max(1, n);
        result.expectedSampleCount = expectedSamples;
        result.sampleCount = n;
        result.completeness = (double) n / expectedSamples;

        int badQuality = 0;
        int duplicateTs = 0;
        Set<Long> seenTs = new HashSet<>();
        for (CplmNormalizedSample s : samples) {
            if (!s.isGoodQuality()) badQuality++;
            if (!seenTs.add(s.eventTsMs)) duplicateTs++;
        }
        result.badQualityPct = n > 0 ? (double) badQuality / n : 0.0;
        result.duplicateTimestamps = duplicateTs;
        result.samplingJitter = computeSamplingJitter(samples);

        // Gap evidence: intervals > 1.5 * median sample period, and the maximum interval.
        int gapCount = 0;
        double maxGapS = 0.0;
        for (int i = 1; i < n; i++) {
            double dt = (samples.get(i).eventTsMs - samples.get(i - 1).eventTsMs) / 1000.0;
            if (tsSec > 0 && dt > 1.5 * tsSec) gapCount++;
            maxGapS = Math.max(maxGapS, dt);
        }
        result.gapCount = gapCount;
        result.maxGapS = maxGapS;

        // Gate 0 — data_quality: >=0.98 PASS, >=0.95 WARN, else FAIL (build prompt §2.3)
        if (result.badQualityPct >= 0.50) {
            // P1-11: bad quality previously had NO path to FAIL - it could only
            // downgrade PASS to WARN, and fusion blocks on FAIL alone. A failed
            // transmitter holding its last-good value at full rate therefore
            // gave completeness 1.0, G0 WARN, and a full confident diagnosis
            // computed over dead data - dispatching an engineer to a valve
            // because a sensor died.
            result.gate0Status = "FAIL";
        } else if (result.completeness >= 0.98 && result.badQualityPct < 0.05 && duplicateTs == 0) {
            result.gate0Status = "PASS";
        } else if (result.completeness >= 0.95) {
            result.gate0Status = "WARN";
        } else {
            result.gate0Status = "FAIL";
        }
        boolean gate0Pass = !"FAIL".equals(result.gate0Status);

        if (!gate0Pass || n < 10) {
            result.sufficientData = false;
            result.pvStd = 0.0;
            result.opStd = 0.0;
            result.freezeIndexS = 0.0;
            result.saturationPct = 0.0;
            return result;
        }

        double[] pv = new double[n];
        double[] sp = new double[n];
        double[] op = new double[n];
        double[] err = new double[n];
        int autoCount = 0;
        int regionOut = 0;
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = samples.get(i);
            pv[i] = s.pv;
            sp[i] = s.sp;
            op[i] = s.op;
            err[i] = sp[i] - pv[i];
            if (s.isAutoMode()) autoCount++;
            boolean pvOk = pv[i] >= profile.regionPvMin && pv[i] <= profile.regionPvMax;
            boolean opOk = op[i] >= profile.regionOpMin && op[i] <= profile.regionOpMax;
            if (!pvOk || !opOk) regionOut++;
        }

        result.autoPct = (double) autoCount / n;
        result.manualPct = 1.0 - result.autoPct;
        result.modeChangesPerHour = computeModeChangesPerHour(samples, windowSec);
        // Gate 1 — mode_service: >=0.90 PASS, >=0.70 WARN, else EXCLUDED (build prompt §2.3)
        if (result.autoPct >= 0.90) {
            result.gate1Status = "PASS";
        } else if (result.autoPct >= 0.70) {
            result.gate1Status = "WARN";
        } else {
            result.gate1Status = "EXCLUDED";
        }

        result.spMin = min(sp);
        result.spMax = max(sp);
        result.spRange = result.spMax - result.spMin;
        result.spChangesPerHour = computeSpChangesPerHour(sp, tsSec, windowSec);
        result.gate2Status = result.spRange < profile.spRangePassMax ? "PASS" : "WARN";

        // G2r — operating region validity
        result.regionOutOfBandPct = (double) regionOut / n;
        if (result.regionOutOfBandPct <= 0.05) {
            result.gate2rStatus = "PASS";
            result.operatingRegionValid = true;
        } else if (result.regionOutOfBandPct <= 0.20) {
            result.gate2rStatus = "WARN";
            result.operatingRegionValid = true;
        } else {
            result.gate2rStatus = "FAIL";
            result.operatingRegionValid = false;
        }

        double mae = meanAbs(err);
        double rmse = Math.sqrt(meanSq(err));
        double iae = 0, ise = 0, itae = 0;
        int goodErrorCount = 0;
        for (int i = 0; i < n; i++) {
            iae += Math.abs(err[i]) * tsSec;
            ise += err[i] * err[i] * tsSec;
            double tSec = (samples.get(i).eventTsMs - samples.get(0).eventTsMs) / 1000.0;
            itae += tSec * Math.abs(err[i]) * tsSec;
            if (Math.abs(err[i]) <= GOOD_ERROR_BAND) goodErrorCount++;
        }
        result.mae = mae;
        result.rmse = rmse;
        result.iae = iae;
        result.ise = ise;
        result.itae = itae;
        result.goodErrorPct = n > 0 ? (double) goodErrorCount / n : 0.0;
        result.saturationPct = computeSaturationPct(op, profile.satLowPct, profile.satHighPct);
        result.oce = result.autoPct * result.goodErrorPct * (1.0 - result.saturationPct);
        // Gate 3 — base_performance (class-aware floor for averaging level loops)
        result.gate3Status = result.goodErrorPct >= profile.goodErrorPctPassMin ? "PASS" : "WARN";

        double opMean = mean(op);
        double pvMean = mean(pv);
        double stdOp = popStd(op, opMean);
        double stdPv = popStd(pv, pvMean);
        result.pvStd = stdPv;
        result.opStd = stdOp;
        result.effortRatio = stdPv > 1e-12 ? stdOp / stdPv : 0.0;
        result.opTravel = computeOpTravel(op);
        result.travelPerDay = computeTravelPerDay(op, tsSec, windowSec);
        result.reversalCount = computeReversalCount(op);
        result.reversalsPerHour = computeReversalsPerHour(op, tsSec, windowSec);
        result.freezeIndexS = computeFreezeIndex(pv, tsSec);
        // Gate 4 — effort: ratio > 8 STRONG, > 3 WARN, else PASS
        if (result.effortRatio > 8.0) {
            result.gate4Status = "STRONG";
        } else if (result.effortRatio > 3.0) {
            result.gate4Status = "WARN";
        } else {
            result.gate4Status = "PASS";
        }
        result.sufficientData = true;
        return result;
    }

    private static String firstNonBlank(
            List<CplmNormalizedSample> primary,
            List<CplmNormalizedSample> fallback,
            java.util.function.Function<CplmNormalizedSample, String> getter) {
        for (CplmNormalizedSample s : primary) {
            String v = getter.apply(s);
            if (v != null && !v.trim().isEmpty()) return v;
        }
        if (fallback != null) {
            for (CplmNormalizedSample s : fallback) {
                String v = getter.apply(s);
                if (v != null && !v.trim().isEmpty()) return v;
            }
        }
        return null;
    }

    /** Stage 2 — long-window diagnostics (Gates 5–11). Used by CplmLongDiagnosticsStreamJob. */
    private static CplmLoopDynamicsProfile firstResolvedProfile(
            List<CplmNormalizedSample> primary,
            List<CplmNormalizedSample> fallback) {
        for (CplmNormalizedSample sample : primary) {
            if (sample != null && sample.resolvedProfile != null) return sample.resolvedProfile;
        }
        if (fallback != null && fallback != primary) {
            for (CplmNormalizedSample sample : fallback) {
                if (sample != null && sample.resolvedProfile != null) return sample.resolvedProfile;
            }
        }
        return null;
    }

    public static CplmLongDiagnosticsResult computeLongDiagnostics(
            List<CplmNormalizedSample> rawSamples, long windowStartMs, long windowEndMs, String windowKind) {
        return computeLongDiagnostics(rawSamples, windowStartMs, windowEndMs, windowKind, null);
    }

    public static CplmLongDiagnosticsResult computeLongDiagnostics(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            CplmLoopDynamicsProfile profileOrNull) {
        CplmLongDiagnosticsResult result = new CplmLongDiagnosticsResult();
        result.windowKind = windowKind;
        result.windowStartMs = windowStartMs;
        result.windowEndMs = windowEndMs;
        result.loopId = rawSamples.isEmpty() ? "UNKNOWN" : rawSamples.get(0).loopId;

        String loopType = firstNonBlank(rawSamples, rawSamples, s -> s.loopType);
        String assetUuid = firstNonBlank(rawSamples, rawSamples, s -> s.assetUuid);
        CplmLoopDynamicsProfile carriedProfile = firstResolvedProfile(rawSamples, rawSamples);
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : carriedProfile != null
                ? carriedProfile
                : CplmDynamicsParameterSetSupport.resolveFromSpine(result.loopId, loopType, assetUuid);
        stampProfile(result, profile);
        result.loopType = loopType != null ? loopType : "";
        result.assetUuid = assetUuid != null ? assetUuid : "";
        result.stictionSignal = profile.stictionSignal();

        List<CplmNormalizedSample> samples = filterHalfOpen(rawSamples, windowStartMs, windowEndMs);
        int n = samples.size();
        result.sampleCount = n;
        if (n < 10) return result;

        double tsSec = inferSamplePeriodSec(samples);
        result.samplePeriodSec = tsSec;
        long windowSec = Math.max(1, (windowEndMs - windowStartMs) / 1000);

        double[] pv = new double[n];
        double[] sp = new double[n];
        double[] op = new double[n];
        boolean hasVp = false;
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = samples.get(i);
            pv[i] = s.pv;
            sp[i] = s.sp;
            op[i] = s.op;
            if (s.vp != null) hasVp = true;
        }
        result.hasVp = hasVp;
        if (!hasVp) result.observabilityFlags.add("NO_VP");

        // First integrating component after the valve: OP (self-reg) or PV (integrating).
        double[] shapeSignal = profile.integrating ? pv : op;

        double opMin = min(op);
        double opMax = max(op);
        result.opRangePct = opMax - opMin;
        double pvMean = mean(pv);
        double opMean = mean(op);
        double stdPv = popStd(pv, pvMean);
        double stdOp = popStd(op, opMean);
        result.effortRatio = stdPv > 1e-12 ? stdOp / stdPv : 0.0;

        double[] shapeDetrended = linearDetrend(shapeSignal);
        double[] shapeCentered = subtractMean(shapeDetrended);
        AcfResult acf = computeAcfPeriod(shapeCentered, tsSec);
        result.acfPeriodS = acf.periodSec;
        result.acfRegularity = Math.min(1.0, acf.regularity);
        result.acfGamma0 = acf.gamma0;
        result.acfZeroCrossingCount = acf.zeroCrossingCount;
        result.acfPeriodCandidateCount = acf.periodCandidateCount;
        result.gate5Status = acf.periodSec > 0 ? "WARN" : "PASS";

        // Band-limited FFT: exclude periods > tauMax (kills near-DC cycle collapse).
        FftResult fft = computeFftBandLimited(shapeCentered, tsSec, profile);
        result.fftPeakBin = fft.peakBin;
        result.fftMaxBin = fft.maxBin;
        result.fftPeakAmplitude = fft.peakAmplitude;
        result.fftPeakFreqHz = fft.peakFreqHz;
        result.fftPeakPeriodS = fft.peakPeriodSec;
        result.fftPeakRatio = fft.peakRatio;
        result.fftTotalEnergy = fft.totalEnergy;
        result.fftH2Amp = fft.h2Amp;
        result.fftH3Amp = fft.h3Amp;
        result.fftH5Amp = fft.h5Amp;
        result.harmonicAmplitudeRatio = fft.harmonicAmplitudeRatio;
        result.harmonicEnergyRatio = fft.harmonicEnergyRatio;
        result.spectralEntropyBinCount = fft.entropyBinCount;
        result.spectralEntropy = fft.spectralEntropy;
        result.fftPeakToMedian = fft.peakToMedian;
        result.gate6Status = fft.peakRatio > 0.5 ? "WARN" : "PASS";

        ValidPeriod vp = resolveValidPeriod(acf, fft, tsSec, profile);
        result.periodStatus = vp.status;
        result.validatedPeriodS = vp.periodS;
        result.periodRejectReason = vp.rejectReason;
        if ("NO_VALID_CYCLE".equals(vp.status) && !result.observabilityFlags.contains("NO_VALID_CYCLE")) {
            result.observabilityFlags.add("NO_VALID_CYCLE");
        }

        int cycleSamples = 0;
        String cycleSource = "NONE";
        if ("VALID".equals(vp.status) && vp.periodS > 0) {
            cycleSamples = (int) Math.round(vp.periodS / tsSec);
            cycleSource = vp.source;
            result.periodRejectReason = "";
        }

        TriangularityResult tri = cycleSamples >= profile.minSamplesPerPeriod
                ? computeTriangularity(shapeSignal, cycleSamples)
                : new TriangularityResult();
        result.triangularity = tri.triangularity;
        result.cycleSamples = cycleSamples >= profile.minSamplesPerPeriod ? cycleSamples : 0;
        result.cycleSource = result.cycleSamples > 0 ? cycleSource : "NONE";
        // Never floor completedCycles on an invalid period.
        result.completedCycles = "VALID".equals(vp.status) ? tri.completedCycles : 0;
        result.validCycles = "VALID".equals(vp.status) ? tri.validCycles : 0;
        result.firstCycleSseSine = tri.firstCycleSseSine;
        result.firstCycleSseTriangle = tri.firstCycleSseTriangle;
        if (!"VALID".equals(vp.status)) {
            result.gate7Status = "NOT_EVALUATED";
        } else {
            result.gate7Status = tri.triangularity > 0.8 ? "STRONG" : "PASS";
        }

        HorchResult horch = computeHorch(op, pv);
        result.horchOddness = horch.oddness;
        result.horchOddSum = horch.oddSum;
        result.horchEvenSum = horch.evenSum;
        result.gate8Status = result.horchOddness > 0.7 ? "STRONG" : "PASS";

        GeometryResult geo = computeGeometry(pv, op, result.completedCycles, profile);
        result.phaseAreaNormPerCycle = geo.cycleNormalizedArea;
        result.phaseBboxArea = geo.bboxArea;
        result.phasePathArea = geo.pathArea;
        result.windowAreaNorm = geo.windowAreaNorm;
        result.cornerScoreRaw = geo.cornerScoreRaw;
        result.cornerScoreQualified = geo.cornerScoreQualified;
        // Legacy alias: corner_score remains raw for historical comparability.
        result.cornerScore = geo.cornerScoreRaw;
        result.validTurningAngles = geo.validTurningAngles;
        result.gate9Status = evaluateGate9(result, profile);
        if (result.gate9Reason != null && !result.gate9Reason.isEmpty()
                && !result.observabilityFlags.contains(result.gate9Reason)) {
            result.observabilityFlags.add(result.gate9Reason);
        }

        SaturationStats sat = computeSaturationStats(op, profile.satLowPct, profile.satHighPct);
        result.saturationPct = sat.occupancy;
        result.satLimitDwellSamples = sat.maxDwellSamples;
        result.satCyclingPattern = sat.cyclingPattern;
        if (sat.occupancy >= profile.satWarnOccupancy
                || sat.maxDwellSamples >= profile.satLimitDwellSamplesWarn
                || sat.cyclingPattern) {
            result.gate10Status = "WARN";
        } else {
            result.gate10Status = "PASS";
        }

        result.freezeRunSamples = computeFreezeRunSamples(pv);
        result.freezeIndexS = result.freezeRunSamples * tsSec;
        result.pvQuantizationCount = countUniqueRounded(pv, 3);
        result.pvDriftPerDay = computePvDriftPerDay(pv, samples, windowSec);
        DeltaPvResult deltaPv = computeDeltaPvStats(pv);
        result.deltaPvMean = deltaPv.mean;
        result.deltaPvStd = deltaPv.std;
        result.spikeCount = computeSpikeCount(pv);
        // P1-1: a freeze only means a stuck sensor if it is MATERIAL relative
        // to the window. Compressed historians (PI stores on change; we
        // forward-fill onto the 5 s grid) make the longest unchanged run equal
        // the archive deadband, so thresholding on absolute seconds alone
        // excluded entire days as EXCLUDED_SENSOR for a 70 s gap - 0.08% of a
        // 24 h window. Require both an absolute floor and a share of the window.
        result.freezeFraction = n > 0 ? (double) result.freezeRunSamples / n : 0.0;
        boolean materialFreeze = result.freezeIndexS >= 60 && result.freezeFraction >= 0.10;
        result.gate11Status = materialFreeze ? "WARN" : "PASS";

        return result;
    }

    private static void stampProfile(CplmLongDiagnosticsResult result, CplmLoopDynamicsProfile profile) {
        result.calculationVersion = profile.calculationVersion;
        result.dynamicsProfileVersion = profile.dynamicsProfileVersion;
        result.dynamicsClass = profile.loopClass.name();
        result.profileSource = profile.profileSource.name();
        result.gateProfileId = profile.gateProfileId;
        result.dynamicClass = profile.dynamicClass.name();
        result.stictionSignal = profile.stictionSignal();
    }

    private static String evaluateGate9(CplmLongDiagnosticsResult r, CplmLoopDynamicsProfile profile) {
        if (!"VALID".equals(r.periodStatus)) {
            r.gate9Reason = "NO_VALID_CYCLE";
            return "NOT_EVALUATED";
        }
        if (r.completedCycles < profile.minValidCycles) {
            r.gate9Reason = "NO_VALID_CYCLE";
            return "NOT_EVALUATED";
        }
        CplmLoopDynamicsProfile.PhaseAreaBand areaBand = profile.classifyPhaseArea(r.phaseAreaNormPerCycle);
        if (areaBand == CplmLoopDynamicsProfile.PhaseAreaBand.ABOVE_BAND) {
            r.gate9Reason = "AREA_OUT_OF_BAND";
            return "NOT_EVALUATED";
        }
        if (areaBand == CplmLoopDynamicsProfile.PhaseAreaBand.BELOW_BAND) {
            r.gate9Reason = "AREA_BELOW_BAND";
            return "PASS";
        }
        if (r.effortRatio < profile.effortRatioFloor) {
            r.gate9Reason = "EFFORT_BELOW_FLOOR";
            return "NOT_EVALUATED";
        }
        if (r.opRangePct < profile.opTravelFloorPct) {
            r.gate9Reason = "OP_TRAVEL_BELOW_FLOOR";
            return "NOT_EVALUATED";
        }
        r.gate9Reason = "";
        if (r.phaseAreaNormPerCycle > PHASE_STRONG_THRESHOLD) return "STRONG";
        return "PASS";
    }

    private static ValidPeriod resolveValidPeriod(
            AcfResult acf, FftResult fft, double tsSec, CplmLoopDynamicsProfile profile) {
        ValidPeriod out = new ValidPeriod();
        boolean acfOk = acf.periodSec > 0
                && profile.isPeriodInBand(acf.periodSec, tsSec)
                && acf.regularity >= profile.acfRegularityMin;
        if (acfOk) {
            out.status = "VALID";
            out.periodS = acf.periodSec;
            out.source = "ACF";
            return out;
        }
        boolean fftOk = fft.peakPeriodSec > 0
                && profile.isPeriodInBand(fft.peakPeriodSec, tsSec)
                && fft.peakToMedian >= profile.fftPeakToMedianMin;
        if (fftOk) {
            out.status = "VALID";
            out.periodS = fft.peakPeriodSec;
            out.source = "FFT";
            return out;
        }
        out.status = "NO_VALID_CYCLE";
        if (acf.periodSec > 0 && !profile.isPeriodInBand(acf.periodSec, tsSec)) {
            out.rejectReason = "PERIOD_OUT_OF_BAND";
        } else if (fft.unboundedPeakPeriodSec > profile.tauMaxS) {
            out.rejectReason = "PERIOD_OUT_OF_BAND";
        } else {
            out.rejectReason = "NO_VALID_CYCLE";
        }
        return out;
    }

    private static double[] linearDetrend(double[] x) {
        int n = x.length;
        double[] y = new double[n];
        if (n < 2) {
            System.arraycopy(x, 0, y, 0, n);
            return y;
        }
        double sumT = 0, sumV = 0, sumTV = 0, sumTT = 0;
        for (int i = 0; i < n; i++) {
            sumT += i;
            sumV += x[i];
            sumTV += i * x[i];
            sumTT += (double) i * i;
        }
        double denom = n * sumTT - sumT * sumT;
        double slope = Math.abs(denom) < 1e-15 ? 0 : (n * sumTV - sumT * sumV) / denom;
        double intercept = (sumV - slope * sumT) / n;
        for (int i = 0; i < n; i++) {
            y[i] = x[i] - (intercept + slope * i);
        }
        return y;
    }

    private static double[] ewma(double[] x, int window) {
        double[] y = new double[x.length];
        if (x.length == 0) return y;
        double alpha = 2.0 / (Math.max(1, window) + 1.0);
        y[0] = x[0];
        for (int i = 1; i < x.length; i++) {
            y[i] = alpha * x[i] + (1.0 - alpha) * y[i - 1];
        }
        return y;
    }

    /** Keep samples strictly inside the event-time half-open interval [start, end). */
    private static List<CplmNormalizedSample> filterHalfOpen(
            List<CplmNormalizedSample> raw, long windowStartMs, long windowEndMs) {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        if (raw == null) return samples;
        for (CplmNormalizedSample s : raw) {
            if (s == null) continue;
            if (s.eventTsMs >= windowStartMs && s.eventTsMs < windowEndMs) {
                samples.add(s);
            }
        }
        samples.sort((a, b) -> Long.compare(a.eventTsMs, b.eventTsMs));
        return samples;
    }

    private static double inferSamplePeriodSec(List<CplmNormalizedSample> samples) {
        if (samples.size() < 2) return 5.0;
        List<Double> diffs = new ArrayList<>();
        for (int i = 1; i < samples.size(); i++) {
            diffs.add((samples.get(i).eventTsMs - samples.get(i - 1).eventTsMs) / 1000.0);
        }
        Collections.sort(diffs);
        return diffs.get(diffs.size() / 2);
    }

    private static double computeSamplingJitter(List<CplmNormalizedSample> samples) {
        if (samples.size() < 3) return 0.0;
        List<Double> diffs = new ArrayList<>();
        for (int i = 1; i < samples.size(); i++) {
            diffs.add((samples.get(i).eventTsMs - samples.get(i - 1).eventTsMs) / 1000.0);
        }
        double median = median(diffs);
        if (median <= 0) return 0.0;
        double mean = mean(diffs.stream().mapToDouble(d -> d).toArray());
        double var = 0;
        for (double d : diffs) var += (d - mean) * (d - mean);
        var /= diffs.size();
        return Math.sqrt(var) / median;
    }

    private static double computeModeChangesPerHour(List<CplmNormalizedSample> samples, long windowSec) {
        if (samples.size() < 2) return 0.0;
        int changes = 0;
        for (int i = 1; i < samples.size(); i++) {
            if (!samples.get(i).mode.equals(samples.get(i - 1).mode)) changes++;
        }
        double hours = windowSec / 3600.0;
        return hours > 0 ? changes / hours : 0.0;
    }

    private static double computeSpChangesPerHour(double[] sp, double tsSec, long windowSec) {
        int changes = 0;
        for (int i = 1; i < sp.length; i++) {
            if (Math.abs(sp[i] - sp[i - 1]) > SP_CHANGE_THRESHOLD) changes++;
        }
        double hours = windowSec / 3600.0;
        return hours > 0 ? changes / hours : 0.0;
    }

    private static double computeOpTravel(double[] op) {
        double travel = 0;
        for (int i = 1; i < op.length; i++) {
            travel += Math.abs(op[i] - op[i - 1]);
        }
        return travel;
    }

    private static double computeTravelPerDay(double[] op, double tsSec, long windowSec) {
        double travel = computeOpTravel(op);
        double windowHours = windowSec / 3600.0;
        return windowHours > 0 ? travel * (24.0 / windowHours) : travel;
    }

    private static int computeReversalCount(double[] op) {
        int reversals = 0;
        double lastDirection = 0;
        for (int i = 1; i < op.length; i++) {
            double diff = op[i] - op[i - 1];
            if (Math.abs(diff) > OP_REVERSAL_EPS) {
                double currentDirection = Math.signum(diff);
                if (lastDirection != 0 && currentDirection != lastDirection) {
                    reversals++;
                }
                lastDirection = currentDirection;
            }
        }
        return reversals;
    }

    private static double computeReversalsPerHour(double[] op, double tsSec, long windowSec) {
        int reversals = computeReversalCount(op);
        double hours = windowSec / 3600.0;
        return hours > 0 ? reversals / hours : 0.0;
    }

    private static double computeSaturationPct(double[] op) {
        return computeSaturationPct(op, 5.0, 95.0);
    }

    private static double computeSaturationPct(double[] op, double lowPct, double highPct) {
        return computeSaturationStats(op, lowPct, highPct).occupancy;
    }

    private static SaturationStats computeSaturationStats(double[] op, double lowPct, double highPct) {
        SaturationStats s = new SaturationStats();
        if (op.length == 0) return s;
        int sat = 0;
        int dwell = 0;
        int maxDwell = 0;
        int exits = 0;
        boolean wasSat = false;
        for (double v : op) {
            boolean atLimit = v <= lowPct || v >= highPct;
            if (atLimit) {
                sat++;
                dwell++;
                maxDwell = Math.max(maxDwell, dwell);
                wasSat = true;
            } else {
                if (wasSat) exits++;
                dwell = 0;
                wasSat = false;
            }
        }
        s.occupancy = (double) sat / op.length;
        s.maxDwellSamples = maxDwell;
        // Limit cycling: repeated enter/exit of saturation band.
        s.cyclingPattern = exits >= 3 && s.occupancy >= 0.02;
        return s;
    }

    private static final class SaturationStats {
        double occupancy;
        int maxDwellSamples;
        boolean cyclingPattern;
    }

    private static AcfResult computeAcfPeriod(double[] x, double tsSec) {
        AcfResult r = new AcfResult();
        int n = x.length;
        if (n < 4) return r;

        double gamma0 = 0;
        for (double v : x) gamma0 += v * v;
        gamma0 /= n;
        r.gamma0 = gamma0;
        if (gamma0 < 1e-15) return r;

        int maxLag = Math.min(n / 2, 2000);
        double[] rho = new double[maxLag + 1];
        rho[0] = 1.0;
        for (int k = 1; k <= maxLag; k++) {
            double gk = 0;
            for (int i = 0; i < n - k; i++) gk += x[i] * x[i + k];
            gk /= (n - k);
            rho[k] = gk / gamma0;
        }

        List<Integer> zeroCrossings = new ArrayList<>();
        double lastSign = Math.signum(rho[0]);
        for (int k = 1; k < maxLag; k++) {
            if (Math.abs(rho[k]) > 1e-9) {
                double currentSign = Math.signum(rho[k]);
                if (lastSign != 0 && currentSign != lastSign) {
                    zeroCrossings.add(k);
                }
                lastSign = currentSign;
            }
        }

        List<Double> periods = new ArrayList<>();
        for (int j = 0; j + 1 < zeroCrossings.size(); j++) {
            int z1 = zeroCrossings.get(j);
            int z2 = zeroCrossings.get(j + 1);
            periods.add(2.0 * (z2 - z1) * tsSec);
        }
        r.zeroCrossingCount = zeroCrossings.size();
        r.periodCandidateCount = periods.size();

        if (!periods.isEmpty()) {
            Collections.sort(periods);
            r.periodSec = periods.get(periods.size() / 2);
            double mean = mean(periods.stream().mapToDouble(d -> d).toArray());
            double std = popStd(periods.stream().mapToDouble(d -> d).toArray(), mean);
            r.regularity = std > 1e-9 ? Math.min(1.0, r.periodSec / (3.0 * std)) : 1.0;
        }
        return r;
    }

    private static FftResult computeFft(double[] x, double tsSec) {
        CplmLoopDynamicsProfile wide = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.UNKNOWN);
        return computeFftBandLimited(x, tsSec, wide);
    }

    /**
     * FFT peak search restricted to periods in {@code [tauMinS, tauMaxS]} with peak-to-median quality.
     * Near-DC bins (period &gt; tauMax) are excluded by construction.
     */
    private static FftResult computeFftBandLimited(double[] x, double tsSec, CplmLoopDynamicsProfile profile) {
        FftResult r = new FftResult();
        int n = x.length;
        if (n < 8) return r;

        double fs = 1.0 / tsSec;
        double df = fs / n;
        int kMax = n / 2;
        double[] amplitudes = new double[kMax + 1];
        double bandEnergy = 0;
        int unboundedPeakBin = 1;
        double unboundedPeakAmp = 0;

        for (int k = 1; k <= kMax; k++) {
            double re = 0, im = 0;
            for (int t = 0; t < n; t++) {
                double angle = -2.0 * Math.PI * k * t / n;
                re += x[t] * Math.cos(angle);
                im += x[t] * Math.sin(angle);
            }
            double amp = 2.0 * Math.sqrt(re * re + im * im) / n;
            amplitudes[k] = amp;
            bandEnergy += amp * amp;
            if (amp > unboundedPeakAmp) {
                unboundedPeakAmp = amp;
                unboundedPeakBin = k;
            }
        }

        double unboundedPeriod = (unboundedPeakBin * df) > 1e-15 ? 1.0 / (unboundedPeakBin * df) : 0;
        r.unboundedPeakPeriodSec = unboundedPeriod;

        // Median of in-band amplitudes for quality ratio
        java.util.ArrayList<Double> inBandAmps = new java.util.ArrayList<>();
        int peakBin = -1;
        double peakAmp = 0;
        for (int k = 1; k <= kMax; k++) {
            double period = (k * df) > 1e-15 ? 1.0 / (k * df) : Double.POSITIVE_INFINITY;
            if (period < profile.tauMinS || period > profile.tauMaxS) continue;
            inBandAmps.add(amplitudes[k]);
            if (amplitudes[k] > peakAmp) {
                peakAmp = amplitudes[k];
                peakBin = k;
            }
        }
        double median = 0;
        if (!inBandAmps.isEmpty()) {
            java.util.Collections.sort(inBandAmps);
            median = inBandAmps.get(inBandAmps.size() / 2);
        }
        r.peakToMedian = median > 1e-15 ? peakAmp / median : 0;

        if (peakBin < 1) {
            // No in-band bin — report unbounded peak for diagnostics but zero usable period.
            r.peakBin = unboundedPeakBin;
            r.maxBin = kMax;
            r.peakAmplitude = unboundedPeakAmp;
            r.peakFreqHz = unboundedPeakBin * df;
            r.peakPeriodSec = 0;
            r.totalEnergy = bandEnergy;
            r.peakRatio = bandEnergy > 1e-15 ? (unboundedPeakAmp * unboundedPeakAmp) / bandEnergy : 0;
            return r;
        }

        r.peakBin = peakBin;
        r.maxBin = kMax;
        r.peakAmplitude = peakAmp;
        r.peakFreqHz = peakBin * df;
        r.peakPeriodSec = r.peakFreqHz > 1e-15 ? 1.0 / r.peakFreqHz : 0;
        double peakEnergy = peakAmp * peakAmp;
        r.totalEnergy = bandEnergy;
        r.peakRatio = bandEnergy > 1e-15 ? peakEnergy / bandEnergy : 0;

        double a1 = amplitudes[peakBin];
        double a2 = peakBin * 2 <= kMax ? amplitudes[peakBin * 2] : 0;
        double a3 = peakBin * 3 <= kMax ? amplitudes[peakBin * 3] : 0;
        double a5 = peakBin * 5 <= kMax ? amplitudes[peakBin * 5] : 0;
        r.h2Amp = a2;
        r.h3Amp = a3;
        r.h5Amp = a5;
        r.harmonicAmplitudeRatio = a1 > 1e-15 ? (a2 + a3 + a5) / a1 : 0;
        r.harmonicEnergyRatio = a1 > 1e-15 ? (a2 * a2 + a3 * a3 + a5 * a5) / (a1 * a1) : 0;

        int kBand = Math.min(kMax, Math.max(peakBin * 3, 32));
        r.entropyBinCount = kBand;
        double sumE = 0;
        for (int k = 1; k <= kBand; k++) sumE += amplitudes[k] * amplitudes[k];
        double entropy = 0;
        if (sumE > 1e-15) {
            for (int k = 1; k <= kBand; k++) {
                double p = (amplitudes[k] * amplitudes[k]) / sumE;
                if (p > 1e-15) entropy -= p * Math.log(p);
            }
            entropy /= Math.log(kBand);
        }
        r.spectralEntropy = entropy;
        return r;
    }

    /**
     * Gate 7 — OP-cycle triangularity (stiction shape).
     *
     * Previous win-rate ({@code SSE_tri < SSE_sin} per cycle) was brittle: noisy but clearly
     * triangular OP cycles often lost to the sine LS fit and scored 0, so visible triangles
     * in the stream produced near-zero triangularity.
     *
     * Corrected continuous score per valid cycle (then averaged):
     * <pre>
     *   s[i]     = min-max normalize OP cycle to [-1, 1]
     *   SSE_sin  = LS fit of a·sin(2πt)+b·cos(2πt)
     *   SSE_tri  = min over phase of LS-scaled template 1-4|t-0.5|
     *   score    = SSE_sin / (SSE_sin + SSE_tri)   ∈ [0,1]
     * </pre>
     * Perfect triangle → score ≈ 1; perfect sine → score ≈ 0.
     */
    private static TriangularityResult computeTriangularity(double[] op, int cycleSamples) {
        TriangularityResult r = new TriangularityResult();
        if (cycleSamples < 4 || op.length < cycleSamples) {
            r.triangularity = 0;
            return r;
        }
        int cycles = op.length / cycleSamples;
        r.completedCycles = cycles;
        double scoreSum = 0;
        int validCycles = 0;
        for (int c = 0; c < cycles; c++) {
            int start = c * cycleSamples;
            double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
            for (int i = 0; i < cycleSamples; i++) {
                double v = op[start + i];
                min = Math.min(min, v);
                max = Math.max(max, v);
            }
            double span = max - min;
            if (span < 1e-12) continue;

            double[] s = new double[cycleSamples];
            for (int i = 0; i < cycleSamples; i++) {
                s[i] = 2.0 * (op[start + i] - min) / span - 1.0;
            }

            double sinA = 0, sinB = 0;
            for (int i = 0; i < cycleSamples; i++) {
                double t = (double) i / cycleSamples;
                sinA += s[i] * Math.sin(2 * Math.PI * t);
                sinB += s[i] * Math.cos(2 * Math.PI * t);
            }
            sinA *= 2.0 / cycleSamples;
            sinB *= 2.0 / cycleSamples;
            double sseSin = 0;
            for (int i = 0; i < cycleSamples; i++) {
                double t = (double) i / cycleSamples;
                double sinFit = sinA * Math.sin(2 * Math.PI * t) + sinB * Math.cos(2 * Math.PI * t);
                double e = s[i] - sinFit;
                sseSin += e * e;
            }

            double minSseTri = Double.POSITIVE_INFINITY;
            for (int shift = 0; shift < cycleSamples; shift++) {
                double dot = 0, energy = 0;
                for (int i = 0; i < cycleSamples; i++) {
                    double t = (double) ((i + shift) % cycleSamples) / cycleSamples;
                    double tri = 1.0 - 4.0 * Math.abs(t - 0.5);
                    dot += s[i] * tri;
                    energy += tri * tri;
                }
                double scale = energy > 1e-15 ? dot / energy : 0;
                double currentSseTri = 0;
                for (int i = 0; i < cycleSamples; i++) {
                    double t = (double) ((i + shift) % cycleSamples) / cycleSamples;
                    double tri = scale * (1.0 - 4.0 * Math.abs(t - 0.5));
                    double e = s[i] - tri;
                    currentSseTri += e * e;
                }
                minSseTri = Math.min(minSseTri, currentSseTri);
            }

            double denom = sseSin + minSseTri;
            double cycleScore = denom > 1e-15 ? sseSin / denom : 0.5;
            scoreSum += cycleScore;
            if (validCycles == 0) {
                r.firstCycleSseSine = sseSin;
                r.firstCycleSseTriangle = minSseTri;
            }
            validCycles++;
        }
        r.validCycles = validCycles;
        r.triangularity = validCycles > 0 ? scoreSum / validCycles : 0;
        return r;
    }

    private static HorchResult computeHorch(double[] op, double[] pv) {
        HorchResult r = new HorchResult();
        int n = Math.min(op.length, pv.length);
        if (n < HORCH_MAX_LAG + 2) return r;

        double opMean = mean(op);
        double pvMean = mean(pv);
        double opStd = popStd(op, opMean);
        double pvStd = popStd(pv, pvMean);
        if (opStd < 1e-12 || pvStd < 1e-12) return r;

        double oddSum = 0, evenSum = 0;
        int maxLag = Math.min(HORCH_MAX_LAG, n / 4);
        for (int k = 1; k <= maxLag; k++) {
            double phiPos = 0, phiNeg = 0;
            int countPos = n - k;
            int countNeg = n - k;
            for (int i = 0; i < n - k; i++) {
                double u = (op[i] - opMean) / opStd;
                double y = (pv[i] - pvMean) / pvStd;
                double uL = (op[i + k] - opMean) / opStd;
                double yL = (pv[i + k] - pvMean) / pvStd;
                phiPos += u * yL;
                phiNeg += uL * y;
            }
            phiPos /= countPos;
            phiNeg /= countNeg;
            oddSum += Math.abs(phiPos - phiNeg);
            evenSum += Math.abs(phiPos + phiNeg);
        }
        r.oddSum = oddSum;
        r.evenSum = evenSum;
        double denom = oddSum + evenSum;
        r.oddness = denom > 1e-15 ? oddSum / denom : 0;
        return r;
    }

    private static GeometryResult computeGeometry(
            double[] pv, double[] op, int completedCycles, CplmLoopDynamicsProfile profile) {
        GeometryResult r = new GeometryResult();
        int n = Math.min(pv.length, op.length);
        if (n < 3) return r;

        double pvMin = min(pv), pvMax = max(pv);
        double opMin = min(op), opMax = max(op);
        double bbox = (pvMax - pvMin) * (opMax - opMin);
        r.bboxArea = bbox;
        if (bbox < 1e-12) return r;

        double area = 0;
        for (int i = 0; i < n - 1; i++) {
            area += pv[i] * op[i + 1] - pv[i + 1] * op[i];
        }
        area = 0.5 * Math.abs(area);
        r.pathArea = area;
        r.windowAreaNorm = area / bbox;
        // Only normalise by cycles when the period was validated (caller passes 0 otherwise).
        if (completedCycles > 0) {
            r.cycleNormalizedArea = r.windowAreaNorm / completedCycles;
        } else {
            r.cycleNormalizedArea = 0;
        }

        double[] pvForCorners = pv;
        if (profile != null && "ewma".equalsIgnoreCase(profile.pvFilterType) && profile.pvFilterWindow > 1) {
            pvForCorners = ewma(pv, profile.pvFilterWindow);
        }

        double cornerRad = profile != null
                ? Math.toRadians(profile.cornerAngleDeg)
                : CORNER_ANGLE_THRESHOLD;
        double opDeadband = profile != null ? profile.opDeadbandPct : 0;

        double sumAngleRaw = 0, sumSharpRaw = 0;
        double sumAngleQual = 0, sumSharpQual = 0;
        int validAngles = 0;
        int validQual = 0;
        for (int i = 1; i < n - 1; i++) {
            double dx1 = pvForCorners[i] - pvForCorners[i - 1];
            double dy1 = op[i] - op[i - 1];
            double dx2 = pvForCorners[i + 1] - pvForCorners[i];
            double dy2 = op[i + 1] - op[i];
            double mag1 = Math.hypot(dx1, dy1);
            double mag2 = Math.hypot(dx2, dy2);
            if (mag1 < 1e-12 || mag2 < 1e-12) continue;
            double dot = dx1 * dx2 + dy1 * dy2;
            double cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
            double angle = Math.acos(cos);
            sumAngleRaw += angle;
            validAngles++;
            if (angle >= cornerRad) sumSharpRaw += angle;

            // Qualified vertex: |ΔOP| at this step must exceed deadband (flat-OP zigzags score zero).
            double dOp = Math.max(Math.abs(dy1), Math.abs(dy2));
            if (dOp < opDeadband) continue;
            sumAngleQual += angle;
            validQual++;
            if (angle >= cornerRad) sumSharpQual += angle;
        }
        r.validTurningAngles = validAngles;
        r.cornerScoreRaw = sumAngleRaw > 1e-15 ? sumSharpRaw / sumAngleRaw : 0;
        r.cornerScoreQualified = sumAngleQual > 1e-15 ? sumSharpQual / sumAngleQual : 0;
        if (validQual == 0 && opDeadband > 0) {
            // Explicit noise-floor signal when OP never moves through a vertex.
            r.cornerScoreQualified = 0;
        }
        r.cornerScore = r.cornerScoreRaw;
        return r;
    }

    /**
     * Longest run of unchanged adjacent PV intervals (0 when PV always changes).
     * Freeze index = run * dt, per as-built formula register: a single sample is
     * not a freeze — only repeated unchanged intervals accumulate freeze time.
     */
    private static int computeFreezeRunSamples(double[] pv) {
        int maxRun = 0, run = 0;
        for (int i = 1; i < pv.length; i++) {
            if (Math.abs(pv[i] - pv[i - 1]) <= PV_FREEZE_EPS) {
                run++;
            } else {
                maxRun = Math.max(maxRun, run);
                run = 0;
            }
        }
        return Math.max(maxRun, run);
    }

    private static double computeFreezeIndex(double[] pv, double tsSec) {
        return computeFreezeRunSamples(pv) * tsSec;
    }

    private static int countUniqueRounded(double[] v, int decimals) {
        Set<Long> uniq = new HashSet<>();
        double scale = Math.pow(10, decimals);
        for (double d : v) {
            uniq.add(Math.round(d * scale));
        }
        return uniq.size();
    }

    private static double computePvDriftPerDay(double[] pv, List<CplmNormalizedSample> samples, long windowSec) {
        if (pv.length < 2) return 0;
        double t0 = samples.get(0).eventTsMs / 1000.0;
        double sumT = 0, sumV = 0, sumTV = 0, sumTT = 0;
        for (int i = 0; i < pv.length; i++) {
            double t = samples.get(i).eventTsMs / 1000.0 - t0;
            sumT += t;
            sumV += pv[i];
            sumTV += t * pv[i];
            sumTT += t * t;
        }
        double n = pv.length;
        double denom = n * sumTT - sumT * sumT;
        if (Math.abs(denom) < 1e-15) return 0;
        double slope = (n * sumTV - sumT * sumV) / denom;
        return slope * 86400.0;
    }

    private static DeltaPvResult computeDeltaPvStats(double[] pv) {
        DeltaPvResult r = new DeltaPvResult();
        if (pv.length < 2) return r;
        double[] d = new double[pv.length - 1];
        for (int i = 0; i < d.length; i++) d[i] = pv[i + 1] - pv[i];
        r.mean = mean(d);
        r.std = popStd(d, r.mean);
        return r;
    }

    private static int computeSpikeCount(double[] pv) {
        if (pv.length < 3) return 0;
        double[] d = new double[pv.length - 1];
        for (int i = 0; i < d.length; i++) d[i] = pv[i + 1] - pv[i];
        double mean = mean(d);
        double std = popStd(d, mean);
        if (std < 1e-12) return 0;
        int spikes = 0;
        for (double v : d) {
            if (Math.abs(v - mean) > 3 * std) spikes++;
        }
        return spikes;
    }

    // --- helpers ---
    private static double mean(double[] v) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) s += d;
        return s / v.length;
    }

    private static double meanAbs(double[] v) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) s += Math.abs(d);
        return s / v.length;
    }

    private static double meanSq(double[] v) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) s += d * d;
        return s / v.length;
    }

    private static double min(double[] v) {
        double m = Double.POSITIVE_INFINITY;
        for (double d : v) m = Math.min(m, d);
        return m;
    }

    private static double max(double[] v) {
        double m = Double.NEGATIVE_INFINITY;
        for (double d : v) m = Math.max(m, d);
        return m;
    }

    private static double popStd(double[] v, double mean) {
        if (v.length == 0) return 0;
        double s = 0;
        for (double d : v) {
            double diff = d - mean;
            s += diff * diff;
        }
        return Math.sqrt(s / v.length);
    }

    private static double[] subtractMean(double[] v) {
        double m = mean(v);
        double[] out = new double[v.length];
        for (int i = 0; i < v.length; i++) out[i] = v[i] - m;
        return out;
    }

    private static double median(List<Double> sorted) {
        if (sorted.isEmpty()) return 0;
        List<Double> copy = new ArrayList<>(sorted);
        Collections.sort(copy);
        return copy.get(copy.size() / 2);
    }

    private static class AcfResult {
        double periodSec;
        double regularity;
        double gamma0;
        int zeroCrossingCount;
        int periodCandidateCount;
    }

    private static class FftResult {
        int peakBin;
        int maxBin;
        double peakAmplitude;
        double peakFreqHz;
        double peakPeriodSec;
        double peakRatio;
        double totalEnergy;
        double h2Amp;
        double h3Amp;
        double h5Amp;
        int entropyBinCount;
        double harmonicAmplitudeRatio;
        double harmonicEnergyRatio;
        double spectralEntropy;
        double peakToMedian;
        double unboundedPeakPeriodSec;
    }

    private static class ValidPeriod {
        String status = "NO_VALID_CYCLE";
        double periodS;
        String source = "NONE";
        String rejectReason = "NO_VALID_CYCLE";
    }

    private static class TriangularityResult {
        int completedCycles;
        int validCycles;
        double firstCycleSseSine;
        double firstCycleSseTriangle;
        double triangularity;
    }

    private static class HorchResult {
        double oddness;
        double oddSum;
        double evenSum;
    }

    private static class DeltaPvResult {
        double mean;
        double std;
    }

    private static class GeometryResult {
        double windowAreaNorm;
        double cycleNormalizedArea;
        double bboxArea;
        double pathArea;
        int validTurningAngles;
        double cornerScore;
        double cornerScoreRaw;
        double cornerScoreQualified;
    }
}
