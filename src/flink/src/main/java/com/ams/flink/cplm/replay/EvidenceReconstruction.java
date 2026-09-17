package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmGateEngine;
import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.evidence.FusionArtifacts;
import com.ams.flink.cplm.evidence.LongArtifacts;
import com.ams.flink.cplm.evidence.ShortArtifacts;
import org.apache.flink.api.common.state.ListState;
import org.apache.flink.api.common.state.ListStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * v2.5 Task 2C.2 (spec §3.3, NR-057): EVIDENCE_RECONSTRUCTION - rebuild ONE method run's
 * artifacts over exactly its support. The same calculators run over the same window with the
 * same profile, so the run identity (loop | window | bundle hash | revisions) is the original
 * one and the artifacts attach to the original verdict, which is never rewritten. The tier is
 * chosen from the gate; G12 is event-keyed and refused (its job owns its evidence).
 */
public final class EvidenceReconstruction extends KeyedProcessFunction<String, CplmNormalizedSample, String> {
    private static final long serialVersionUID = 1L;
    private static final List<String> SHORT = Arrays.asList("G0", "G1", "G2", "G2r", "G3", "G4");
    private static final List<String> LONG = Arrays.asList("G5", "G6", "G7", "G8", "G9", "G10", "G11");
    private static final List<String> FUSION = Arrays.asList("G13", "G14", "G15");

    /** What to rebuild: the run's id, gate, window kind and exact support. */
    public static final class Target implements Serializable {
        private static final long serialVersionUID = 1L;
        public final String methodRunId, gate, windowKind;
        public final long fromMs, toMs;

        public Target(String methodRunId, String gate, String windowKind, long fromMs, long toMs) {
            this.methodRunId = methodRunId;
            this.gate = gate;
            this.windowKind = windowKind;
            this.fromMs = fromMs;
            this.toMs = toMs;
        }
    }

    private final Target target;
    private final String analysisRunId;
    /** The registry's parameter-set updates (compacted metadata topic) so profiles resolve exactly as in streaming. */
    private final List<String> parameterUpdates;
    private final BoundedBundle bundle;
    private transient com.ams.flink.cplm.CplmDynamicsParameterSetSupport.MapLookup lookup;
    private transient ListState<CplmNormalizedSample> buffer;
    private transient ValueState<Boolean> armed;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public EvidenceReconstruction(Target target, String analysisRunId) {
        this(target, analysisRunId, new ArrayList<>());
    }

    public EvidenceReconstruction(Target target, String analysisRunId, List<String> parameterUpdates) {
        this(target, analysisRunId, parameterUpdates, null);
    }

    /** With the bundle the original run carried (3C.1): the reconstruction evaluates under the same configuration. */
    public EvidenceReconstruction(Target target, String analysisRunId, List<String> parameterUpdates, BoundedBundle bundle) {
        this.bundle = bundle;
        this.target = target;
        this.analysisRunId = analysisRunId == null ? "" : analysisRunId;
        this.parameterUpdates = parameterUpdates == null ? new ArrayList<>() : new ArrayList<>(parameterUpdates);
    }

    /** short | long | fusion; G12 -> IllegalArgumentException("NOT_RECONSTRUCTABLE_EVENT_KEYED"). */
    public static String tierOf(String gate) {
        if (SHORT.contains(gate)) return "short";
        if (LONG.contains(gate)) return "long";
        if (FUSION.contains(gate)) return "fusion";
        if ("G12".equals(gate)) throw new IllegalArgumentException("NOT_RECONSTRUCTABLE_EVENT_KEYED: G12 evidence is owned by the response job");
        throw new IllegalArgumentException("UNKNOWN_GATE: " + gate);
    }

    /** The pure rebuild: the requested gate's tier over [from, to) with the artifacts of that gate only. */
    public static List<EvidenceArtifact> rebuild(List<CplmNormalizedSample> samples, Target t) {
        String tier = tierOf(t.gate);
        List<EvidenceArtifact> all;
        switch (tier) {
            case "short": {
                CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(samples, t.fromMs, t.toMs, t.windowKind);
                all = ShortArtifacts.artifacts(r);
                break;
            }
            case "long": {
                CplmLongDiagnosticsResult r = CplmGateEngine.computeLongDiagnostics(samples, t.fromMs, t.toMs, t.windowKind);
                all = LongArtifacts.artifacts(r);
                break;
            }
            default: {
                CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(samples, t.fromMs, t.toMs, t.windowKind);
                CplmShortFeatureResult shortF = CplmGateEngine.computeShortFeatures(samples, t.fromMs, t.toMs, t.windowKind);
                CplmGateResult fused = CplmGateFusionEngine.fuse(shortF, longD);
                all = FusionArtifacts.artifacts(fused);
            }
        }
        List<EvidenceArtifact> out = new ArrayList<>();
        for (EvidenceArtifact a : all) {
            if (!t.gate.equals(a.gate)) continue;
            a.provenance.put("purpose", "EVIDENCE_RECONSTRUCTION");
            a.provenance.put("reconstructs", t.methodRunId);
            out.add(a);
        }
        return out;
    }

    @Override
    public void open(Configuration parameters) {
        // the identity of a run includes its bundle hash: the profile must resolve as the streaming job resolved it,
        // i.e. with the registry's parameter set (engineering ranges, overrides) applied, not the bare spine
        lookup = com.ams.flink.cplm.CplmParameterUpdateReader.lookupFrom(parameterUpdates);
        buffer = getRuntimeContext().getListState(new ListStateDescriptor<>("reconstruction-buffer", TypeInformation.of(CplmNormalizedSample.class)));
        armed = getRuntimeContext().getState(new ValueStateDescriptor<>("reconstruction-armed", Boolean.class));
    }

    @Override
    public void processElement(CplmNormalizedSample s, Context ctx, Collector<String> out) throws Exception {
        if (s.eventTsMs < target.fromMs || s.eventTsMs >= target.toMs) return;
        buffer.add(s);
        if (armed.value() == null) {
            // BATCH runtime: the timer fires once this key's input is exhausted (watermark -> MAX)
            ctx.timerService().registerEventTimeTimer(target.toMs);
            armed.update(Boolean.TRUE);
        }
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext ctx, Collector<String> out) throws Exception {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (CplmNormalizedSample s : buffer.get()) samples.add(s);
        samples.sort((a, b) -> Long.compare(a.eventTsMs, b.eventTsMs));
        buffer.clear();
        if (!samples.isEmpty()) {
            // the profile as the streaming job resolved it (registry attributes), plus the run's bundle when it carried one
            CplmNormalizedSample first = samples.get(0);
            com.ams.flink.cplm.CplmLoopDynamicsProfile profile = com.ams.flink.cplm.CplmDynamicsParameterSetSupport.resolve(first.loopId, first.loopType, first.assetUuid, lookup);
            if (bundle != null) profile = bundle.apply(profile);
            for (CplmNormalizedSample s : samples) s.resolvedProfile = profile;
        }
        long nowMs = System.currentTimeMillis();
        for (EvidenceArtifact a : rebuild(samples, target)) {
            if (!analysisRunId.isEmpty()) a.provenance.put("analysis_run_id", analysisRunId);
            for (String record : EvidenceKafkaRecords.records(a, MAPPER, nowMs)) out.collect(record);
        }
    }
}
