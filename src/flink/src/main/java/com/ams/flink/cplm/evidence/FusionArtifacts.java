package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.fusion.Confirmation;
import com.ams.flink.cplm.fusion.FusionVerdictV2;
import com.ams.flink.cplm.fusion.Hypothesis;
import com.ams.flink.cplm.fusion.Observation;
import com.ams.flink.cplm.health.LoopHealthContextRecord;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 2C.1c (spec §3.1, xlsx_Gate_evidence.tsv): the fused verdict's evidence - G13 as an
 * UNAVAILABLE capability record until the interaction analysis ships (2F), G14 as the confirmation
 * record (claim, positive evidence, contradictions, scope - no numeric certainty curve), G15 as the
 * decision record (observations, hypotheses in the form fusion actually uses, states, revision),
 * and G11's health lanes as eligibility intervals per role (absence of health is NOT_CONFIGURED,
 * never OK). Records carry their fields in provenance; only the lanes are a series.
 */
public final class FusionArtifacts {
    /** The fused row's G13 record when the long row carried no analysis (a jar without 2F.1). */
    public static final String G13_CAPABILITY_REASON = "INTERACTION_NOT_ANALYSED_BY_LONG_TIER";

    private FusionArtifacts() {}

    public static List<EvidenceArtifact> artifacts(CplmGateResult r) {
        List<EvidenceArtifact> out = new ArrayList<>();
        if (r == null || r.methodRunIds == null) return out;
        String g11 = r.methodRunIds.get("G11");
        if (g11 != null) out.add(stamp(eligibilityIntervals(g11, r), r));
        // v2.5 (2F.1): G13's evidence (record + per-peer series) is written by the long tier under the
        // SAME method run id (deterministic per loop/support/bundle); the fused row adds a record only
        // when the long row carried no analysis, so a manifest never holds two G13 records.
        String g13 = r.methodRunIds.get("G13");
        if (g13 != null && r.interaction == null) out.add(stamp(interactionUnavailable(g13, r), r));
        String g14 = r.methodRunIds.get("G14");
        if (g14 != null) out.add(stamp(confirmationRecord(g14, r), r));
        String g15 = r.methodRunIds.get("G15");
        if (g15 != null) out.add(stamp(decisionRecord(g15, r), r));
        return out;
    }

    private static EvidenceArtifact stamp(EvidenceArtifact a, CplmGateResult r) {
        ArtifactSupport.stamp(a, r.loopId, r.windowKind, r.windowStartMs, r.windowEndMs, r.bundleHash, r.datasetHash);
        a.provenance.put("result_revision", r.resultRevision);
        return a;
    }

    /** G11 lanes: F, C, S, M, health_state_id, source_verified_time, measurement_impact, eligibility_intervals - one row per role. */
    static EvidenceArtifact eligibilityIntervals(String runId, CplmGateResult r) {
        Map<String, LoopHealthContextRecord> roles = r.healthLanes == null ? new java.util.TreeMap<>() : r.healthLanes.roles();
        int n = roles.size();
        double[] from = new double[n], duration = new double[n], f = new double[n], c = new double[n], s = new double[n], m = new double[n], verified = new double[n];
        ArtifactSupport.Coder role = new ArtifactSupport.Coder(n), eligibility = new ArtifactSupport.Coder(n), impact = new ArtifactSupport.Coder(n), state = new ArtifactSupport.Coder(n);
        int i = 0;
        for (Map.Entry<String, LoopHealthContextRecord> e : roles.entrySet()) {
            LoopHealthContextRecord h = e.getValue();
            from[i] = h.hasInterval ? h.fromMs : Double.NaN;
            duration[i] = h.hasInterval ? ((h.toMs == null ? r.windowEndMs : h.toMs) - h.fromMs) / 1000.0 : Double.NaN;
            f[i] = h.activeFlags.contains("F") ? 1 : 0;
            c[i] = h.activeFlags.contains("C") ? 1 : 0;
            s[i] = h.activeFlags.contains("S") ? 1 : 0;
            m[i] = h.activeFlags.contains("M") ? 1 : 0;
            verified[i] = h.emittedAtMs > 0 ? h.emittedAtMs : Double.NaN;
            role.put(i, e.getKey());
            eligibility.put(i, h.eligibility);
            impact.put(i, h.measurementImpact);
            state.put(i, h.healthStateId == null || h.healthStateId.isEmpty() ? "NONE" : h.healthStateId);
            i++;
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G11", "eligibility_intervals", "HEALTH", "from_time", ArtifactSupport.MS_EPOCH, "duration", "s", from, duration, null);
        role.attach(a, "role");
        a.column("F", "boolean", f);
        a.column("C", "boolean", c);
        a.column("S", "boolean", s);
        a.column("M", "boolean", m);
        a.column("source_verified_time", ArtifactSupport.MS_EPOCH, verified);
        eligibility.attach(a, "eligibility");
        impact.attach(a, "measurement_impact");
        state.attach(a, "health_state_id");
        a.provenance.put("absence_semantics", n == 0 ? "NOT_CONFIGURED - no instrument binding; health absence is not OK" : "per-role lanes as of the verdict");
        return a;
    }

    /** G13: the workbook's fields are declared absent with the capability reason - an unmapped or uncomputed peer proves nothing. */
    static EvidenceArtifact interactionUnavailable(String runId, CplmGateResult r) {
        EvidenceArtifact a = ArtifactSupport.record(runId, "G13", "interaction", "PEERS");
        a.provenance.put("capability_state", "UNAVAILABLE");
        a.provenance.put("capability_reason", G13_CAPABILITY_REASON);
        for (String field : new String[] {"peer_ids", "relationship_revision", "aligned_series", "cross_correlation", "coherence", "frequency_hz", "lag_s", "support_mask", "alternative_explanations"}) {
            a.provenance.put(field, "UNAVAILABLE");
        }
        a.provenance.put("legacy_link_flag", r.hasPeerLinks ? "HAS_PEER_LINKS" : "NO_UPSTREAM_LINKS");
        a.provenance.put("gate13_method", r.gate13Method);
        return a;
    }

    /** G14: claim_type, positive_evidence_ids, contradictions, source_validity, test_id, review_record, scope, confirmed_at. */
    static EvidenceArtifact confirmationRecord(String runId, CplmGateResult r) {
        Confirmation c = r.verdictV2 == null || r.verdictV2.confirmation == null ? new Confirmation() : r.verdictV2.confirmation;
        EvidenceArtifact a = ArtifactSupport.record(runId, "G14", "confirmation_record", "FINAL_ELEMENT");
        a.provenance.put("claim_type", c.claimType);
        a.provenance.put("state", c.state);
        a.provenance.put("reason", c.reason);
        a.provenance.put("positive_evidence_ids", ArtifactSupport.join(c.positiveEvidenceIds));
        a.provenance.put("contradictions", ArtifactSupport.join(c.contradictions));
        a.provenance.put("source_validity", r.healthLanes == null || r.healthLanes.roles().isEmpty() ? "HEALTH_NOT_CONFIGURED" : "PER_ROLE_LANES");
        a.provenance.put("test_id", "NONE");
        a.provenance.put("review_record", "NONE");
        a.provenance.put("scope", c.scope);
        a.provenance.put("non_following_dwell_s", c.nonFollowingDwellS);
        a.provenance.put("confirmed_at", c.confirmedAtMs > 0 ? String.valueOf(c.confirmedAtMs) : "NOT_CONFIRMED");
        return a;
    }

    /** G15: observations, hypotheses, evidence_groups, score_semantics, explanations, qualified_support, condition_state, availability, case_state, result_revision. */
    static EvidenceArtifact decisionRecord(String runId, CplmGateResult r) {
        FusionVerdictV2 v = r.verdictV2 == null ? new FusionVerdictV2() : r.verdictV2;
        EvidenceArtifact a = ArtifactSupport.record(runId, "G15", "decision_record", "FUSION");
        StringBuilder obs = new StringBuilder(), hyp = new StringBuilder(), groups = new StringBuilder(), expl = new StringBuilder();
        for (Observation o : v.observations.values()) {
            obs.append(obs.length() == 0 ? "" : ";").append(o.id).append(':').append(o.present ? "PRESENT" : "ABSENT").append(':').append(o.score).append(':').append(o.role);
            if (!o.basis.isEmpty()) expl.append(expl.length() == 0 ? "" : ";").append(o.id).append('=').append(o.basis);
        }
        for (Hypothesis h : v.hypotheses.values()) {
            hyp.append(hyp.length() == 0 ? "" : ";").append(h.id).append(':').append(h.state).append(':').append(h.score);
            groups.append(groups.length() == 0 ? "" : ";").append(h.id).append('=').append(ArtifactSupport.join(h.evidenceGroups).replace(';', ','));
        }
        a.provenance.put("observations", obs.toString());
        a.provenance.put("hypotheses", hyp.toString());
        a.provenance.put("leading_hypothesis", v.leadingHypothesis);
        a.provenance.put("evidence_groups", groups.toString());
        a.provenance.put("score_semantics", v.scoreSemantics);
        a.provenance.put("selection_rule", "ARGMAX_RANKED - not an additive waterfall");
        a.provenance.put("explanations", expl.toString());
        a.provenance.put("qualified_support", r.qualifiedSupportMs);
        com.ams.flink.cplm.condition.OpenConditions oc = r.openConditions;
        a.provenance.put("condition_state", oc == null ? "NONE" : (oc.hasOpenLimit ? "LIMIT_" + oc.limitKind + "_OPEN" : "") + (oc.hasOpenFreeze ? (oc.hasOpenLimit ? ";" : "") + "FREEZE_OPEN" : "") + (!oc.hasOpenLimit && !oc.hasOpenFreeze ? "NONE_OPEN" : ""));
        a.provenance.put("availability", r.healthLanes == null || r.healthLanes.roles().isEmpty() ? "HEALTH_NOT_CONFIGURED" : "OBSERVED");
        a.provenance.put("case_state", r.diagnosis);
        a.provenance.put("legacy_confidence", r.confidence);
        return a;
    }
}
