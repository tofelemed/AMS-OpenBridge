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
 * Stage 1 - short-window features (Gates 0-4 + G2r). Used by CplmShortFeatureStreamJob via CplmGateEngine.
 *
 * Moved verbatim out of CplmGateEngine in v2.5 (Task 1D.1, 400-line file rule);
 * no formula changed - the SYN-TIC-001 golden tests pin the numbers.
 */
public final class ShortFeatureCalculator {
    private ShortFeatureCalculator() {
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
        List<CplmNormalizedSample> samples = SignalMath.filterHalfOpen(rawSamples, windowStartMs, windowEndMs);
        result.loopId = samples.isEmpty()
                ? (rawSamples.isEmpty() ? "UNKNOWN" : rawSamples.get(0).loopId)
                : samples.get(0).loopId;

        String loopType = SignalMath.firstNonBlank(samples, rawSamples, s -> s.loopType);
        String assetUuid = SignalMath.firstNonBlank(samples, rawSamples, s -> s.assetUuid);
        CplmLoopDynamicsProfile carriedProfile = SignalMath.firstResolvedProfile(samples, rawSamples);
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

        double tsSec = SignalMath.inferSamplePeriodSec(samples);
        result.samplePeriodSec = tsSec;
        long windowSec = Math.max(1, (windowEndMs - windowStartMs) / 1000);
        // Gate 0: never allow expectedSamples to truncate to 0 on micro-batches.
        int expectedSamples = tsSec > 0 ? (int) Math.max(1, Math.round((double) windowSec / tsSec)) : Math.max(1, n);
        result.expectedSampleCount = expectedSamples;
        result.sampleCount = n;
        result.completeness = (double) n / expectedSamples;

        int badQuality = 0;
        int unknownQuality = 0;
        int duplicateTs = 0;
        Set<Long> seenTs = new HashSet<>();
        for (CplmNormalizedSample s : samples) {
            String nq = s.normalizedQuality();
            if (!"GOOD".equals(nq)) badQuality++;          // not-good share (UNKNOWN included, v2.5 R04)
            if ("UNKNOWN".equals(nq)) unknownQuality++;    // of which: no usable verdict at all
            if (!seenTs.add(s.eventTsMs)) duplicateTs++;
        }
        result.badQualityPct = n > 0 ? (double) badQuality / n : 0.0;
        result.unknownQualityPct = n > 0 ? (double) unknownQuality / n : 0.0;
        result.duplicateTimestamps = duplicateTs;
        result.samplingJitter = SignalMath.computeSamplingJitter(samples);

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
        // v2.5: say WHY. "No quality information" (QUALITY_UNKNOWN) is a different
        // operator action from "the source says the data is bad" (BAD_QUALITY).
        if ("FAIL".equals(result.gate0Status)) {
            if (result.badQualityPct >= 0.50) {
                result.gate0Reason = unknownQuality * 2 >= badQuality ? "QUALITY_UNKNOWN" : "BAD_QUALITY";
            } else {
                result.gate0Reason = "INCOMPLETE";
            }
        } else {
            result.gate0Reason = "";
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
            op[i] = profile.normalizeOp(s.op); // P3-8: identity unless a range is declared
            err[i] = sp[i] - pv[i];
            if (s.isAutoMode()) autoCount++;
            boolean pvOk = pv[i] >= profile.regionPvMin && pv[i] <= profile.regionPvMax;
            boolean opOk = op[i] >= profile.regionOpMin && op[i] <= profile.regionOpMax;
            if (!pvOk || !opOk) regionOut++;
        }

        result.autoPct = (double) autoCount / n;
        result.manualPct = 1.0 - result.autoPct;
        result.modeChangesPerHour = SignalMath.computeModeChangesPerHour(samples, windowSec);
        // Gate 1 — mode_service: >=0.90 PASS, >=0.70 WARN, else EXCLUDED (build prompt §2.3)
        if (result.autoPct >= 0.90) {
            result.gate1Status = "PASS";
        } else if (result.autoPct >= 0.70) {
            result.gate1Status = "WARN";
        } else {
            result.gate1Status = "EXCLUDED";
        }

        result.spMin = SignalMath.min(sp);
        result.spMax = SignalMath.max(sp);
        result.spRange = result.spMax - result.spMin;
        result.spChangesPerHour = SignalMath.computeSpChangesPerHour(sp, tsSec, windowSec);
        // v2.5 R06: the band is a policy (EU objective or fraction of the DECLARED span),
        // published with its provenance so a LEGACY_DEFAULT band is never mistaken for one.
        result.gate2BandEu = profile.spStabilityBandEu();
        result.gate2BandSource = profile.spStabilityBandSource();
        result.gate2Status = result.spRange < result.gate2BandEu ? "PASS" : "WARN";

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

        double mae = SignalMath.meanAbs(err);
        double rmse = Math.sqrt(SignalMath.meanSq(err));
        // P3-2 - integrate over the actual inter-sample intervals (zero-order
        // hold across gaps, the historian's own recording assumption), not the
        // median dt applied uniformly: that made IAE/ISE/ITAE scale with sample
        // COUNT, so a 95%-complete window reported ~95% of the true integral
        // while being labelled a full-window IAE. The final sample, which has
        // no successor, contributes one median interval - on gap-free data the
        // totals are identical to the previous formula. ITAE's time weight is
        // anchored to windowStart, not the first present sample, so a late-
        // starting window no longer shifts every weight toward zero.
        double iae = 0, ise = 0, itae = 0;
        // Half-width of the "good error" band in EU. Was the hardcoded 0.5 for every
        // loop regardless of range; now a fraction of the declared PV span, with the
        // 0-100 default reproducing 0.5 exactly for any loop that declares nothing.
        final double goodErrorBand = profile.goodErrorBand();
        int goodErrorCount = 0;
        for (int i = 0; i < n; i++) {
            double dtSec = i < n - 1
                    ? (samples.get(i + 1).eventTsMs - samples.get(i).eventTsMs) / 1000.0
                    : tsSec;
            double tSec = (samples.get(i).eventTsMs - windowStartMs) / 1000.0;
            iae += Math.abs(err[i]) * dtSec;
            ise += err[i] * err[i] * dtSec;
            itae += tSec * Math.abs(err[i]) * dtSec;
            if (Math.abs(err[i]) <= goodErrorBand) goodErrorCount++;
        }
        result.mae = mae;
        result.rmse = rmse;
        result.iae = iae;
        result.ise = ise;
        result.itae = itae;
        result.goodErrorPct = n > 0 ? (double) goodErrorCount / n : 0.0;
        result.saturationPct = LimitMath.computeSaturationPct(op, profile.satLowPct, profile.satHighPct);
        result.oce = result.autoPct * result.goodErrorPct * (1.0 - result.saturationPct);
        // Gate 3 — base_performance (class-aware floor for averaging level loops)
        result.gate3Status = result.goodErrorPct >= profile.goodErrorPctPassMin ? "PASS" : "WARN";

        double opMean = SignalMath.mean(op);
        double pvMean = SignalMath.mean(pv);
        double stdOp = SignalMath.popStd(op, opMean);
        double stdPv = SignalMath.popStd(pv, pvMean);
        result.pvStd = stdPv;
        result.opStd = stdOp;
        result.effortRatio = stdPv > 1e-12 ? stdOp / stdPv : 0.0;
        // P2-3 - scale-free variant: each std normalized by its own observed
        // span, so the ratio is comparable across loops regardless of PV units.
        double pvSpan = SignalMath.max(pv) - SignalMath.min(pv);
        double opSpan = SignalMath.max(op) - SignalMath.min(op);
        result.effortRatioNormalized = (pvSpan > 1e-12 && opSpan > 1e-12 && stdPv > 1e-12)
                ? (stdOp / opSpan) / (stdPv / pvSpan) : 0.0;
        result.opTravel = SignalMath.computeOpTravel(op);
        result.travelPerDay = SignalMath.computeTravelPerDay(op, tsSec, windowSec);
        result.reversalCount = SignalMath.computeReversalCount(op);
        result.reversalsPerHour = SignalMath.computeReversalsPerHour(op, tsSec, windowSec);
        result.freezeIndexS = LimitMath.computeFreezeIndex(pv, tsSec);
        // Gate 4 - activity (v2.5 R06): thresholds from the profile; judged on the
        // dimensionless (sigma_u/span_u)/(sigma_pv/span_pv) when the PV span is DECLARED
        // (unit-invariant, NR-018), else on the legacy observed ratio, and the record says
        // which. OP is already normalised to 0-100 pp above, so span_u = 100.
        result.gate4WarnRatio = profile.g4ActivityWarnRatio;
        result.gate4HighRatio = profile.g4ActivityHighRatio;
        double activity;
        double pvSpanDeclared = profile.pvEngMax - profile.pvEngMin;
        if (profile.pvRangeDeclared && pvSpanDeclared > 1e-12) {
            if (stdPv > 1e-12) {
                result.activityRatioNorm = (stdOp / 100.0) / (stdPv / pvSpanDeclared);
                result.activityBasis = "NORMALIZED_DECLARED_SPAN";
                result.activityReason = "";
                activity = result.activityRatioNorm;
            } else {
                result.activityRatioNorm = null;
                result.activityBasis = "OBSERVED_RATIO_LEGACY";
                result.activityReason = "NO_PV_VARIATION";
                activity = result.effortRatio;
            }
        } else {
            result.activityRatioNorm = null;
            result.activityBasis = "OBSERVED_RATIO_LEGACY";
            result.activityReason = "NO_PV_SPAN";
            activity = result.effortRatio;
        }
        if (activity > result.gate4HighRatio) {
            result.gate4Status = "STRONG";
        } else if (activity > result.gate4WarnRatio) {
            result.gate4Status = "WARN";
        } else {
            result.gate4Status = "PASS";
        }
        result.sufficientData = true;
        return result;
    }
}
