package com.ams.flink.cplm.ondemand;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmHistoricalReplayJob;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.WindowEvaluation;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.evidence.FusionArtifacts;
import com.ams.flink.cplm.evidence.LongArtifacts;
import com.ams.flink.cplm.evidence.ShortArtifacts;
import com.ams.flink.cplm.replay.BoundedBundle;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * CHG-102 5c: the pure part of an on-demand evaluation - one window of historian samples evaluated exactly as the
 * bounded replay evaluates it ({@link WindowEvaluation}, so the method run ids equal a replay's), then the WHOLE
 * evidence set of that window (short G0-G4, long G5-G11/G13, fusion G13-G15) under the evaluation's analysis run.
 *
 * <p>Fused result: the replay's lineage (purpose EVALUATE, the analysis run, calculation_source
 * flink-on-demand-evaluation, input "iotdb:&lt;device&gt;", HISTORIAN_QUALITY_ASSUMED). Artifacts: provenance purpose
 * EVALUATE, analysis_run_id, evaluation_window_kind - cplm-api files them as STANDARD beside any evidence already held
 * for the same run (CHG-099), never over it.
 */
public final class OnDemandEvaluator {
    public static final String PURPOSE = "EVALUATE";
    public static final String CALCULATION_SOURCE = "flink-on-demand-evaluation";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private OnDemandEvaluator() {}

    /** What one evaluation produced. */
    public static final class Outcome {
        public final String resultJson;
        public final List<String> evidenceRecords;
        public final Map<String, String> methodRunIds;
        public final int artifacts;
        public final int samples;

        Outcome(String resultJson, List<String> evidenceRecords, Map<String, String> methodRunIds, int artifacts, int samples) {
            this.resultJson = resultJson;
            this.evidenceRecords = evidenceRecords;
            this.methodRunIds = methodRunIds;
            this.artifacts = artifacts;
            this.samples = samples;
        }
    }

    /**
     * @param samples the historian samples of the request's support (any order; outside [from, to) is ignored)
     * @param lookup  the registry's parameter set, as the streaming jobs resolve profiles
     * @throws IllegalArgumentException a bundle that does not decode or apply (the status says why)
     */
    public static Outcome evaluate(EvaluationRequest r, List<CplmNormalizedSample> samples, CplmDynamicsParameterSetSupport.Lookup lookup,
                                   int maxCycles, String device, long nowMs) throws Exception {
        BoundedBundle bundle = BoundedBundle.fromArgs(r.bundleHash, r.bundlePropertiesB64);
        List<CplmNormalizedSample> support = new ArrayList<>();
        for (CplmNormalizedSample s : samples) if (s != null && s.eventTsMs >= r.fromMs && s.eventTsMs < r.toMs) support.add(s);
        support.sort((a, b) -> Long.compare(a.eventTsMs, b.eventTsMs));
        WindowEvaluation ev = WindowEvaluation.evaluate(support, r.fromMs, r.toMs, r.windowKind,
                r.hasStepTest, r.hasPeerLinks, lookup, bundle);
        String result = CplmHistoricalReplayJob.withLineage(ev.fused, r.analysisRunId, "iotdb:" + device,
                PURPOSE, r.analysisRunId, true, CALCULATION_SOURCE);

        List<EvidenceArtifact> all = new ArrayList<>(ShortArtifacts.artifacts(ev.shortFeatures));
        all.addAll(LongArtifacts.artifacts(ev.longDiagnostics, maxCycles));
        all.addAll(FusionArtifacts.artifacts(ev.fused));
        List<String> records = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int artifacts = 0;
        for (EvidenceArtifact a : all) {
            if (a == null || !seen.add(a.evidenceId)) continue;   // one record per evidence id (by design no tier repeats one)
            a.provenance.put("purpose", PURPOSE);
            a.provenance.put("analysis_run_id", r.analysisRunId);
            a.provenance.put("evaluation_window_kind", r.windowKind);
            records.addAll(EvidenceKafkaRecords.records(a, MAPPER, nowMs));
            artifacts++;
        }
        Map<String, String> runs = ev.fused.methodRunIds == null ? new LinkedHashMap<>() : new LinkedHashMap<>(ev.fused.methodRunIds);
        return new Outcome(result, records, runs, artifacts, support.size());
    }
}
