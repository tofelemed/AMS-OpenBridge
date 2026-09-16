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
 * owns G0-G4, the long stage G5-G11, and the fused result is the run of record for all 17
 * gates; the fused ids for G0-G11 equal the stage ids (same loop, support, bundle, revision),
 * so evidence emitted by a stage attaches to the fused row's method_run_ids.
 */
public final class ResultIdentity {
    public static final List<String> SHORT_GATES = Arrays.asList("G0", "G1", "G2", "G2r", "G3", "G4");
    public static final List<String> LONG_GATES = Arrays.asList("G5", "G6", "G7", "G8", "G9", "G10", "G11");

    private ResultIdentity() {
    }

    public static void stamp(CplmShortFeatureResult r, List<CplmNormalizedSample> samples, CplmLoopDynamicsProfile profile) {
        r.bundleHash = ProfileHash.of(profile);
        r.datasetHash = DatasetHash.of(samples);
        r.methodRunIds = subset(RunIdentity.forGates(r.loopId, r.windowStartMs, r.windowEndMs, r.bundleHash,
                r.contextRevision, r.resultRevision), SHORT_GATES);
    }

    public static void stamp(CplmLongDiagnosticsResult r, List<CplmNormalizedSample> samples, CplmLoopDynamicsProfile profile) {
        r.bundleHash = ProfileHash.of(profile);
        r.datasetHash = DatasetHash.of(samples);
        r.methodRunIds = subset(RunIdentity.forGates(r.loopId, r.windowStartMs, r.windowEndMs, r.bundleHash,
                r.contextRevision, r.resultRevision), LONG_GATES);
    }

    /** The fused result inherits support identity from the long slice and names every gate. */
    public static void stamp(CplmGateResult r, CplmLongDiagnosticsResult longD, CplmLoopDynamicsProfile profile) {
        r.bundleHash = ProfileHash.of(profile);
        r.datasetHash = longD.datasetHash == null ? DatasetHash.EMPTY : longD.datasetHash;
        r.purpose = longD.purpose == null || longD.purpose.isEmpty() ? "LIVE" : longD.purpose;
        r.analysisRunId = longD.analysisRunId;
        r.contextRevision = longD.contextRevision;
        r.methodRunIds = RunIdentity.forGates(r.loopId, r.windowStartMs, r.windowEndMs, r.bundleHash,
                r.contextRevision, r.resultRevision);
    }

    private static Map<String, String> subset(Map<String, String> all, List<String> gates) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String g : gates) if (all.containsKey(g)) out.put(g, all.get(g));
        return out;
    }
}
