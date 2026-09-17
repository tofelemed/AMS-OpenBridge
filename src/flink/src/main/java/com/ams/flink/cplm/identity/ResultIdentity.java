package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 1G.3 (R19 / R26): stamps the run identity on each result tier. The short stage
 * owns G0-G4, the long stage G5-G11 and G13 (aligned peer analysis, 2F.1), and the fused result is the run of record for all 17
 * gates; the fused ids for G0-G11 equal the stage ids (same loop, support, bundle, revision),
 * so evidence emitted by a stage attaches to the fused row's method_run_ids.
 */
public final class ResultIdentity {
    public static final List<String> SHORT_GATES = Arrays.asList("G0", "G1", "G2", "G2r", "G3", "G4");
    public static final List<String> LONG_GATES = Arrays.asList("G5", "G6", "G7", "G8", "G9", "G10", "G11", "G13");

    private ResultIdentity() {
    }

    public static void stamp(CplmShortFeatureResult r, List<CplmNormalizedSample> samples, CplmLoopDynamicsProfile profile) {
        r.bundleHash = ProfileHash.of(profile);
        r.contextRevision = profile == null ? 0 : profile.bundleEpoch;
        String warmup = warmup(profile, r.windowStartMs);
        if (warmup != null) { r.evaluationState = "WAITING"; r.evaluationReason = warmup; }
        r.datasetHash = DatasetHash.of(samples);
        r.methodRunIds = subset(RunIdentity.forGates(r.loopId, r.windowStartMs, r.windowEndMs, r.bundleHash,
                r.contextRevision, r.resultRevision), SHORT_GATES);
    }

    public static void stamp(CplmLongDiagnosticsResult r, List<CplmNormalizedSample> samples, CplmLoopDynamicsProfile profile) {
        r.bundleHash = ProfileHash.of(profile);
        r.contextRevision = profile == null ? 0 : profile.bundleEpoch;
        String warmup = warmup(profile, r.windowStartMs);
        if (warmup != null) {
            r.evaluationState = "WAITING";
            r.evaluationReason = warmup;
            if (r.observabilityFlags != null && !r.observabilityFlags.contains("WARMUP")) r.observabilityFlags.add("WARMUP");
        }
        r.datasetHash = DatasetHash.of(samples);
        r.methodRunIds = subset(RunIdentity.forGates(r.loopId, r.windowStartMs, r.windowEndMs, r.bundleHash,
                r.contextRevision, r.resultRevision), LONG_GATES);
    }

    /** The fused result inherits support identity from the long slice and names every gate. */
    public static void stamp(CplmGateResult r, CplmLongDiagnosticsResult longD, CplmLoopDynamicsProfile profile) {
        // the fused row is the run of record for the long tier's gates too, so its identity IS the long row's bundle
        // identity; the fusion job's own resolution must agree - when it does not (lab: the fusion job had no site and
        // selected no bundle while the long job had), the row says so instead of silently forking the method run ids
        String own = ProfileHash.of(profile);
        String inherited = longD.bundleHash == null || longD.bundleHash.isEmpty() ? own : longD.bundleHash;
        r.bundleHash = inherited;
        if (!own.equals(inherited) && r.observabilityFlags != null && !r.observabilityFlags.contains("BUNDLE_MISMATCH_FUSION")) {
            r.observabilityFlags.add("BUNDLE_MISMATCH_FUSION");
        }
        r.datasetHash = longD.datasetHash == null ? DatasetHash.EMPTY : longD.datasetHash;
        r.purpose = longD.purpose == null || longD.purpose.isEmpty() ? "LIVE" : longD.purpose;
        r.analysisRunId = longD.analysisRunId;
        r.contextRevision = longD.contextRevision;
        if ("WAITING".equals(longD.evaluationState)) {
            r.evaluationState = "WAITING";
            r.evaluationReason = longD.evaluationReason;
            if (r.observabilityFlags != null && !r.observabilityFlags.contains("WARMUP")) r.observabilityFlags.add("WARMUP");
        }
        r.methodRunIds = RunIdentity.forGates(r.loopId, r.windowStartMs, r.windowEndMs, r.bundleHash,
                r.contextRevision, r.resultRevision);
    }

    /**
     * v2.5 (3C.1, NR-053): a STATE_BOUNDARY bundle opens a new epoch; a window whose support began
     * before the bundle became effective still holds the old epoch's state and is WAITING (warm-up),
     * never a result computed under two epochs.
     */
    static String warmup(CplmLoopDynamicsProfile profile, long windowStartMs) {
        if (profile == null || profile.bundleHash == null || !"STATE_BOUNDARY".equals(profile.bundleChangeClass)) return null;
        if (windowStartMs >= profile.bundleEffectiveFromMs) return null;
        return "WARMUP: support began before the STATE_BOUNDARY bundle " + profile.bundleHash.substring(0, Math.min(12, profile.bundleHash.length()))
                + " became effective at " + java.time.Instant.ofEpochMilli(profile.bundleEffectiveFromMs) + " (epoch " + profile.bundleEpoch + ")";
    }

    private static Map<String, String> subset(Map<String, String> all, List<String> gates) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String g : gates) if (all.containsKey(g)) out.put(g, all.get(g));
        return out;
    }
}
