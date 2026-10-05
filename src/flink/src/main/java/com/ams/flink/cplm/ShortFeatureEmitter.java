package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.EvidenceKafkaRecords;
import com.ams.flink.cplm.evidence.EvidencePolicy;
import com.ams.flink.cplm.evidence.ShortArtifacts;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** One fired short window → its result and (per policy) its evidence records. Shared by every window kind. */
final class ShortFeatureEmitter {

    /** v2.5 (2C.1c): evidence records (EvidenceKafkaRecords JSON) leave through this side output. */
    static final OutputTag<String> EVIDENCE = new OutputTag<String>("cplm-short-evidence") {
    };
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ShortFeatureEmitter() {
    }

    /**
     * Computes the window {@code [start, end)} over its members and emits the result. Members are the
     * samples Flink assigned to the window by their record timestamp; the event-time filter below is the
     * one the v2.6.5 window function applied.
     */
    static void emit(long start, long end, String windowKind, EvidencePolicy policy,
                     Iterable<CplmNormalizedSample> members, Collector<CplmShortFeatureResult> out,
                     Consumer<String> evidence) {
        List<CplmNormalizedSample> batch = new ArrayList<>();
        for (CplmNormalizedSample s : members) {
            if (s != null && s.eventTsMs >= start && s.eventTsMs < end) batch.add(s);
        }
        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(batch, start, end, windowKind);
        // the intermediates are transient: build the artifacts HERE, before the result leaves the operator
        if (policy.emit(r)) {
            long nowMs = System.currentTimeMillis();
            for (EvidenceArtifact a : ShortArtifacts.artifacts(r)) {
                for (String record : EvidenceKafkaRecords.records(a, MAPPER, nowMs)) evidence.accept(record);
            }
        }
        out.collect(r);
    }
}
