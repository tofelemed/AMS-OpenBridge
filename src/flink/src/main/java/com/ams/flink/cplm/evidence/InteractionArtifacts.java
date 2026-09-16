package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.engine.InteractionMath;
import com.ams.flink.cplm.engine.InteractionSummary;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 2F.1 (spec §3.1 G13 row): the aligned peer analysis as evidence with the workbook's
 * field names - per peer an {@code aligned_series} (own and peer values on the loop's instants
 * with the shared support mask), a {@code cross_correlation} over lag_s and a {@code coherence}
 * over frequency_hz; plus one {@code interaction} record carrying peer_ids, relationship_revision,
 * the state and reason, and the alternative explanations. A peer that was not analysed has no
 * series - its state is on the record, never a picture of an uncomputed method.
 */
public final class InteractionArtifacts {
    private InteractionArtifacts() {}

    public static List<EvidenceArtifact> artifacts(String runId, InteractionMath.Result r, InteractionSummary summary) {
        List<EvidenceArtifact> out = new ArrayList<>();
        if (runId == null || r == null) return out;
        out.add(record(runId, r, summary));
        for (InteractionMath.Peer p : r.peers) {
            if (!"ANALYSED".equals(p.state)) continue;
            double[] t = new double[p.alignedTsMs.length];
            for (int i = 0; i < t.length; i++) t[i] = p.alignedTsMs[i];
            EvidenceArtifact aligned = EvidenceArtifact.series(runId, "G13", "aligned_series", p.peerId, "sample_time", ArtifactSupport.MS_EPOCH,
                    "peer_pv", "peer_EU", t, p.peer, p.supportMask);
            aligned.column("own_pv", "EU", p.own);
            aligned.provenance.put("peer_id", p.peerId);
            aligned.provenance.put("support_s", p.supportS);
            aligned.provenance.put("support_fraction", p.supportFraction);
            aligned.provenance.put("alignment", "NEAREST_WITHIN_0.75_GRID");
            out.add(aligned);
            EvidenceArtifact xc = EvidenceArtifact.series(runId, "G13", "cross_correlation", p.peerId, "lag_s", "s", "xcorr", "1", p.lagAxisS, p.xcorr, null);
            xc.provenance.put("peer_id", p.peerId);
            xc.provenance.put("peak_xcorr", p.peakXcorr);
            xc.provenance.put("lag_at_peak_s", p.lagS);
            xc.provenance.put("direction", p.direction);
            xc.provenance.put("lag_sign_convention", "POSITIVE_WHEN_PEER_FOLLOWS_LOOP");
            out.add(xc);
            EvidenceArtifact coh = EvidenceArtifact.series(runId, "G13", "coherence", p.peerId, "frequency_hz", "Hz", "coherence", "1", p.freqHz, p.coherence, null);
            coh.provenance.put("peer_id", p.peerId);
            coh.provenance.put("band_low_hz", r.bandLowHz);
            coh.provenance.put("band_high_hz", r.bandHighHz);
            coh.provenance.put("coherence_band_max", p.coherenceBandMax);
            coh.provenance.put("coherence_band_mean", p.coherenceBandMean);
            coh.provenance.put("estimator", "WELCH_MSC_HANN");
            out.add(coh);
        }
        return out;
    }

    /** The G13 record: state, reason, peers with their states, alternatives - and the capability fields the workbook names. */
    static EvidenceArtifact record(String runId, InteractionMath.Result r, InteractionSummary summary) {
        EvidenceArtifact a = ArtifactSupport.record(runId, "G13", "interaction", "PEERS");
        a.provenance.put("method_id", InteractionMath.METHOD_ID);
        a.provenance.put("capability_state", r.state);
        a.provenance.put("capability_reason", r.reason);
        a.provenance.put("state", r.state);
        a.provenance.put("reason", r.reason);
        List<String> ids = new ArrayList<>();
        List<String> states = new ArrayList<>();
        List<String> lags = new ArrayList<>();
        List<String> cohs = new ArrayList<>();
        for (InteractionMath.Peer p : r.peers) {
            ids.add(p.peerId);
            states.add(p.peerId + ":" + p.state + (p.associated ? ":ASSOCIATED:" + p.direction : ""));
            lags.add(p.peerId + ":" + (Double.isFinite(p.lagS) ? String.valueOf(p.lagS) : "NA"));
            cohs.add(p.peerId + ":" + (Double.isFinite(p.coherenceBandMax) ? String.valueOf(p.coherenceBandMax) : "NA"));
        }
        a.provenance.put("peer_ids", String.join(";", ids));
        a.provenance.put("peer_states", String.join(";", states));
        a.provenance.put("lag_s", String.join(";", lags));
        a.provenance.put("coherence", String.join(";", cohs));
        a.provenance.put("frequency_hz", r.bandLowHz + ";" + r.bandHighHz);
        a.provenance.put("relationship_revision", summary == null ? 0 : summary.relationshipRevision);
        a.provenance.put("aligned_series", r.peers.isEmpty() ? "NONE" : "PER_PEER_ARTIFACT");
        a.provenance.put("cross_correlation", r.peers.isEmpty() ? "NONE" : "PER_PEER_ARTIFACT");
        a.provenance.put("support_mask", r.peers.isEmpty() ? "NONE" : "ON_ALIGNED_SERIES");
        a.provenance.put("alternative_explanations", String.join(";", r.alternativeExplanations));
        return a;
    }
}
