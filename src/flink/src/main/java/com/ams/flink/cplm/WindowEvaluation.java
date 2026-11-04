package com.ams.flink.cplm;

import java.util.ArrayList;
import java.util.List;

/**
 * One bounded window evaluated the way {@link CplmHistoricalReplayJob#computeWindow} always has, with the stage results
 * kept: source samples materialized on the window's median period, the profile resolved under the registry's parameter
 * set (plus the run's bundle when it carries one), short features + long diagnostics computed with that profile, fused,
 * and persistence applied with an empty history (a bounded run is a first-seen family, audit-jobs.md C-F1).
 *
 * <p>CHG-102 5c: the replay job's computeWindow and the on-demand evaluation job both go through here, so an evaluated
 * window carries the same method run ids as a replay of the same window; the evaluation also needs the short and long
 * stage results for their evidence artifacts.
 */
public final class WindowEvaluation {
    public final List<CplmNormalizedSample> evaluationSamples;
    public final CplmLoopDynamicsProfile profile;
    public final CplmShortFeatureResult shortFeatures;
    public final CplmLongDiagnosticsResult longDiagnostics;
    public final CplmGateResult fused;

    private WindowEvaluation(List<CplmNormalizedSample> evaluationSamples, CplmLoopDynamicsProfile profile,
                             CplmShortFeatureResult shortFeatures, CplmLongDiagnosticsResult longDiagnostics, CplmGateResult fused) {
        this.evaluationSamples = evaluationSamples;
        this.profile = profile;
        this.shortFeatures = shortFeatures;
        this.longDiagnostics = longDiagnostics;
        this.fused = fused;
    }

    public static WindowEvaluation evaluate(List<CplmNormalizedSample> samples, long windowStart, long windowEnd, String windowKind,
                                            boolean hasStepTest, boolean hasPeerLinks,
                                            CplmDynamicsParameterSetSupport.Lookup lookup,
                                            com.ams.flink.cplm.replay.BoundedBundle bundle) {
        // audit-jobs.md C-F7: the window's own median inter-sample period, clamped, design default as fallback
        long periodMs = CplmHistoricalReplayJob.medianPeriodMs(samples, CplmHistoricalReplayJob.EVALUATION_PERIOD_MS);
        List<CplmNormalizedSample> evaluationSamples = CplmHistoricalReplayJob.materializeEvaluationSamples(
                samples, windowStart, windowEnd, periodMs);
        CplmNormalizedSample first = evaluationSamples.isEmpty() ? null : evaluationSamples.get(0);
        CplmLoopDynamicsProfile profile = CplmDynamicsParameterSetSupport.resolve(
                first == null ? null : first.loopId,
                first == null ? null : first.loopType,
                first == null ? null : first.assetUuid,
                lookup);
        if (bundle != null) profile = bundle.apply(profile);
        for (CplmNormalizedSample s : evaluationSamples) s.resolvedProfile = profile;
        // exactly CplmGateFusionEngine.fuseFromSamples with a resolved profile: both stages computed unconditionally (P2-5)
        CplmShortFeatureResult shortF = CplmGateEngine.computeShortFeatures(
                evaluationSamples, windowStart, windowEnd, windowKind, profile);
        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(
                evaluationSamples, windowStart, windowEnd, windowKind, profile);
        CplmGateResult result = CplmGateFusionEngine.fuse(shortF, longD, hasStepTest, hasPeerLinks, profile);
        CplmGateFusionEngine.applyPersistence(result, new ArrayList<>(), profile);
        return new WindowEvaluation(evaluationSamples, profile, shortF, longD, result);
    }
}
