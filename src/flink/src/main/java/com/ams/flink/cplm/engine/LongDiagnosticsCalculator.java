package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Stage 2 - long-window diagnostics (Gates 5-11). Used by CplmLongDiagnosticsStreamJob via CplmGateEngine.
 *
 * Moved verbatim out of CplmGateEngine in v2.5 (Task 1D.1, 400-line file rule);
 * no formula changed - the SYN-TIC-001 golden tests pin the numbers.
 */
public final class LongDiagnosticsCalculator {
    public static final double PHASE_STRONG_THRESHOLD = 0.30;

    private LongDiagnosticsCalculator() {
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
        return computeLongDiagnostics(rawSamples, windowStartMs, windowEndMs, windowKind, profileOrNull, null);
    }

    /**
     * v2.5 (2F.1): as above with the G13 peer context - the peers' samples keyed by peer id (as the
     * long job's fan-out delivered them) and the registry's configured peer list. A null context
     * evaluates G13 as NOT_CONFIGURED.
     */
    public static CplmLongDiagnosticsResult computeLongDiagnostics(
            List<CplmNormalizedSample> rawSamples,
            long windowStartMs,
            long windowEndMs,
            String windowKind,
            CplmLoopDynamicsProfile profileOrNull,
            PeerContext peers) {
        CplmLongDiagnosticsResult result = new CplmLongDiagnosticsResult();
        result.windowKind = windowKind;
        result.windowStartMs = windowStartMs;
        result.windowEndMs = windowEndMs;
        result.loopId = rawSamples.isEmpty() ? "UNKNOWN" : rawSamples.get(0).loopId;

        String loopType = SignalMath.firstNonBlank(rawSamples, rawSamples, s -> s.loopType);
        String assetUuid = SignalMath.firstNonBlank(rawSamples, rawSamples, s -> s.assetUuid);
        CplmLoopDynamicsProfile carriedProfile = SignalMath.firstResolvedProfile(rawSamples, rawSamples);
        CplmLoopDynamicsProfile profile = profileOrNull != null
                ? profileOrNull
                : carriedProfile != null
                ? carriedProfile
                : CplmDynamicsParameterSetSupport.resolveFromSpine(result.loopId, loopType, assetUuid);
        stampProfile(result, profile);
        result.loopType = loopType != null ? loopType : "";
        result.assetUuid = assetUuid != null ? assetUuid : "";
        result.stictionSignal = profile.stictionSignal();

        List<CplmNormalizedSample> samples = SignalMath.filterHalfOpen(rawSamples, windowStartMs, windowEndMs);
        int n = samples.size();
        result.sampleCount = n;
        if (n < 10) {
            com.ams.flink.cplm.identity.ResultIdentity.stamp(result, samples, profile);
            return result;
        }

        double tsSec = SignalMath.inferSamplePeriodSec(samples);
        result.samplePeriodSec = tsSec;
        result.methodEligibility = MethodEligibility.evaluate(profile, tsSec);              // v2.5 (2G.1, NR-016)
        long windowSec = Math.max(1, (windowEndMs - windowStartMs) / 1000);

        double[] pv = new double[n];
        double[] sp = new double[n];
        double[] op = new double[n];
        boolean hasVp = false;
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = samples.get(i);
            pv[i] = s.pv;
            sp[i] = s.sp;
            op[i] = profile.normalizeOp(s.op); // P3-8: identity unless a range is declared
            if (s.vp != null) hasVp = true;
        }
        result.hasVp = hasVp;
        if (!hasVp) result.observabilityFlags.add("NO_VP");
        // v2.5 R02: MEASURE how VP followed the demand - the positive evidence or the
        // contradiction that G14 v2 needs. Presence alone is not evidence.
        VpTrackingMath.VpTracking vt = VpTrackingMath.compute(samples, op, profile, tsSec * 1000.0);
        result.vpEligibleSamples = vt.eligibleSamples;
        result.vpTrackingErrorMeanPp = vt.errorMeanPp;
        result.vpTrackingErrorP95Pp = vt.errorP95Pp;
        result.vpNonFollowingDwellS = vt.nonFollowingDwellS;
        result.vpTrackingHealthy = vt.healthy;

        // First integrating component after the valve: OP (self-reg) or PV (integrating).
        double[] shapeSignal = profile.integrating ? pv : op;

        double opMin = SignalMath.min(op);
        double opMax = SignalMath.max(op);
        result.opRangePct = opMax - opMin;
        double pvMean = SignalMath.mean(pv);
        double opMean = SignalMath.mean(op);
        double stdPv = SignalMath.popStd(pv, pvMean);
        double stdOp = SignalMath.popStd(op, opMean);
        result.effortRatio = stdPv > 1e-12 ? stdOp / stdPv : 0.0;

        double[] shapeDetrended = SignalMath.linearDetrend(shapeSignal);
        double[] shapeCentered = SignalMath.subtractMean(shapeDetrended);
        LongIntermediates keep = new LongIntermediates();
        result.intermediates = keep;
        keep.tsSec = tsSec;
        keep.pv = pv;
        keep.op = op;
        keep.shapeCentered = shapeCentered;
        keep.shapeRole = profile.integrating ? "PV" : "OP";
        OscillationMath.AcfResult acf = OscillationMath.computeAcfPeriod(shapeCentered, tsSec);
        keep.acf = acf;
        result.acfPeriodS = acf.periodSec;
        result.acfRegularity = Math.min(1.0, acf.regularity);
        result.acfGamma0 = acf.gamma0;
        result.acfZeroCrossingCount = acf.zeroCrossingCount;
        result.acfPeriodCandidateCount = acf.periodCandidateCount;
        result.gate5Status = acf.periodSec > 0 ? "WARN" : "PASS";

        // Band-limited FFT: exclude periods > tauMax (kills near-DC cycle collapse).
        OscillationMath.FftResult fft = OscillationMath.computeFftBandLimited(shapeCentered, tsSec, profile);
        keep.fft = fft;
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

        OscillationMath.ValidPeriod vp = OscillationMath.resolveValidPeriod(acf, fft, tsSec, profile);
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

        ShapeMath.TriangularityResult tri = cycleSamples >= profile.minSamplesPerPeriod
                ? ShapeMath.computeTriangularity(shapeSignal, cycleSamples)
                : new ShapeMath.TriangularityResult();
        keep.triangularity = tri;
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

        ShapeMath.HorchResult horch = ShapeMath.computeHorch(op, pv);
        keep.horch = horch;
        result.horchOddness = horch.oddness;
        result.horchOddSum = horch.oddSum;
        result.horchEvenSum = horch.evenSum;
        result.gate8Status = result.horchOddness > 0.7 ? "STRONG" : "PASS";

        ShapeMath.GeometryResult geo = ShapeMath.computeGeometry(pv, op, result.completedCycles, profile);
        keep.geometry = geo;
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

        // G10 (v2.5 R08): op[] is normalised to 0-100 pp of the DECLARED range when one exists,
        // so the declared min/max ARE the limits (an 80 % maximum is a limit, NR-024); without a
        // declaration the 0-100 assumption is a fallback and the record says so. The tolerance
        // default (5 pp) reproduces the historical 5 / 95 thresholds; dwell is judged in seconds.
        double tolPp = profile.limitTolerancePp;
        result.limitLowPp = tolPp;
        result.limitHighPp = 100.0 - tolPp;
        result.limitSource = profile.opRangeDeclared ? "DECLARED_RANGE" : "FALLBACK_0_100";
        LimitMath.SaturationStats sat = LimitMath.computeSaturationStats(op, result.limitLowPp, result.limitHighPp);
        keep.saturation = sat;
        long[] tsMs = new long[n];
        for (int i = 0; i < n; i++) tsMs[i] = samples.get(i).eventTsMs;
        keep.tsMs = tsMs;
        result.dwellEvents = LimitMath.computeLimitEpisodes(op, tsMs, tolPp, tsSec * 1000.0);
        double maxDwellS = 0;
        for (LimitMath.DwellEvent e : result.dwellEvents) maxDwellS = Math.max(maxDwellS, e.durationS);
        result.saturationPct = sat.occupancy;
        result.satLimitDwellSamples = sat.maxDwellSamples;
        result.satLimitDwellS = maxDwellS;
        result.satCyclingPattern = sat.cyclingPattern;
        result.limitDwellWarnS = profile.limitDwellWarnS > 0 ? profile.limitDwellWarnS : profile.satLimitDwellSamplesWarn * tsSec;
        if (sat.occupancy >= profile.satWarnOccupancy
                || maxDwellS >= result.limitDwellWarnS
                || sat.cyclingPattern) {
            result.gate10Status = "WARN";
        } else {
            result.gate10Status = "PASS";
        }

        result.freezeRunSamples = LimitMath.computeFreezeRunSamples(pv);
        result.freezeIndexS = result.freezeRunSamples * tsSec;
        result.pvQuantizationCount = LimitMath.countUniqueRounded(pv, 3);
        result.pvDriftPerDay = LimitMath.computePvDriftPerDay(pv, samples, windowSec);
        LimitMath.DeltaPvResult deltaPv = LimitMath.computeDeltaPvStats(pv);
        keep.deltaPv = deltaPv;
        result.deltaPvMean = deltaPv.mean;
        result.deltaPvStd = deltaPv.std;
        result.spikeCount = LimitMath.computeSpikeCount(pv);
        // P1-1: a freeze only means a stuck sensor if it is MATERIAL relative
        // to the window. Compressed historians (PI stores on change; we
        // forward-fill onto the 5 s grid) make the longest unchanged run equal
        // the archive deadband, so thresholding on absolute seconds alone
        // excluded entire days as EXCLUDED_SENSOR for a 70 s gap - 0.08% of a
        // 24 h window. Require both an absolute floor and a share of the window.
        result.freezeFraction = n > 0 ? (double) result.freezeRunSamples / n : 0.0;
        boolean materialFreeze = result.freezeIndexS >= 60 && result.freezeFraction >= 0.10;
        // v2.5 R08 / NR-025: every flat run >= freezeDwellS is a retained EPISODE and makes G11
        // WARN (visible in a 24 h window); only a MATERIAL freeze (the rule above) excludes the
        // window in fusion, so a compressed-historian hold cannot blank a whole day.
        result.freezeDwellS = profile.freezeDwellS;
        result.freezeToleranceEu = profile.freezeToleranceEu;
        result.freezeEvents = LimitMath.computeFreezeEpisodes(pv, tsMs, profile.freezeToleranceEu, profile.freezeDwellS, tsSec * 1000.0);
        result.freezeMaterial = materialFreeze;
        if (materialFreeze) {
            result.gate11Status = "WARN";
            result.gate11Reason = "MATERIAL_FREEZE";
        } else if (!result.freezeEvents.isEmpty()) {
            result.gate11Status = "WARN";
            result.gate11Reason = "FREEZE_EPISODE";
        } else {
            result.gate11Status = "PASS";
            result.gate11Reason = "";
        }

        InteractionGate.apply(result, samples, peers == null ? null : peers.samplesInWindow(windowStartMs, windowEndMs),
                peers == null ? java.util.Collections.emptyList() : peers.configuredPeers, peers == null ? 0 : peers.relationshipRevision, profile);
        com.ams.flink.cplm.identity.ResultIdentity.stamp(result, samples, profile);
        return result;
    }

    /** v2.5 (2F.1): the peers' samples and the configured peer list for one loop's G13 evaluation. */
    public static final class PeerContext implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        public final List<String> configuredPeers;
        public final java.util.Map<String, List<CplmNormalizedSample>> samples;
        public final long relationshipRevision;

        public PeerContext(List<String> configuredPeers, java.util.Map<String, List<CplmNormalizedSample>> samples, long relationshipRevision) {
            this.configuredPeers = configuredPeers == null ? java.util.Collections.emptyList() : configuredPeers;
            this.samples = samples == null ? java.util.Collections.emptyMap() : samples;
            this.relationshipRevision = relationshipRevision;
        }

        java.util.Map<String, List<CplmNormalizedSample>> samplesInWindow(long fromMs, long toMs) {
            java.util.Map<String, List<CplmNormalizedSample>> out = new java.util.HashMap<>();
            for (java.util.Map.Entry<String, List<CplmNormalizedSample>> e : samples.entrySet()) {
                out.put(e.getKey(), SignalMath.filterHalfOpen(e.getValue(), fromMs, toMs));
            }
            return out;
        }
    }

    public static void stampProfile(CplmLongDiagnosticsResult result, CplmLoopDynamicsProfile profile) {
        result.calculationVersion = profile.calculationVersion;
        result.dynamicsProfileVersion = profile.dynamicsProfileVersion;
        result.dynamicsClass = profile.loopClass.name();
        result.profileSource = profile.profileSource.name();
        result.gateProfileId = profile.gateProfileId;
        result.dynamicClass = profile.dynamicClass.name();
        result.stictionSignal = profile.stictionSignal();
    }

    public static String evaluateGate9(CplmLongDiagnosticsResult r, CplmLoopDynamicsProfile profile) {
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
}
