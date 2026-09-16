package com.ams.flink.cplm.engine;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 2F.1: the scalar outcome of the G13 aligned peer analysis as it travels on the long
 * results topic to fusion and the API - state, reason, one row per configured peer (state, lag,
 * peak cross-correlation, coherence in band, shared support), the alternative explanations, the
 * method id. The arrays stay in {@link LongIntermediates} for the evidence artifacts.
 */
public final class InteractionSummary implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final class PeerRow implements Serializable {
        private static final long serialVersionUID = 1L;
        public String peerId = "";
        public String state = "PEER_UNOBSERVED";
        public boolean associated;
        public double lagS = Double.NaN, peakXcorr = Double.NaN, coherenceBandMax = Double.NaN, supportS;
        public String direction = "NONE";
    }

    public String methodId = InteractionMath.METHOD_ID;
    /** INTERACTION_DETECTED | NO_INTERACTION | UNAVAILABLE | NOT_CONFIGURED. */
    public String state = "NOT_CONFIGURED";
    public String reason = "NO_PEER_LINKS";
    public double bandLowHz, bandHighHz;
    public List<PeerRow> peers = new ArrayList<>();
    public List<String> alternativeExplanations = new ArrayList<>();
    /** The registry's relationship revision the peer list was taken from (0 when the legacy evidence attribute carried none). */
    public long relationshipRevision;

    public static InteractionSummary of(InteractionMath.Result r, long relationshipRevision) {
        InteractionSummary s = new InteractionSummary();
        s.state = r.state;
        s.reason = r.reason;
        s.bandLowHz = r.bandLowHz;
        s.bandHighHz = r.bandHighHz;
        s.relationshipRevision = relationshipRevision;
        for (InteractionMath.Peer p : r.peers) {
            PeerRow row = new PeerRow();
            row.peerId = p.peerId;
            row.state = p.state;
            row.associated = p.associated;
            row.lagS = p.lagS;
            row.peakXcorr = p.peakXcorr;
            row.coherenceBandMax = p.coherenceBandMax;
            row.supportS = p.supportS;
            row.direction = p.direction;
            s.peers.add(row);
        }
        s.alternativeExplanations.addAll(r.alternativeExplanations);
        return s;
    }

    public boolean detected() {
        return "INTERACTION_DETECTED".equals(state);
    }

    public List<String> peerIds() {
        List<String> ids = new ArrayList<>();
        for (PeerRow p : peers) ids.add(p.peerId);
        return ids;
    }

    public void write(ObjectNode out) {
        out.put("method_id", methodId);
        out.put("state", state);
        out.put("reason", reason);
        out.put("band_low_hz", bandLowHz);
        out.put("band_high_hz", bandHighHz);
        out.put("relationship_revision", relationshipRevision);
        ArrayNode ps = out.putArray("peers");
        for (PeerRow p : peers) {
            ObjectNode o = ps.addObject();
            o.put("peer_id", p.peerId);
            o.put("state", p.state);
            o.put("associated", p.associated);
            putFinite(o, "lag_s", p.lagS);
            putFinite(o, "peak_xcorr", p.peakXcorr);
            putFinite(o, "coherence_band_max", p.coherenceBandMax);
            o.put("support_s", p.supportS);
            o.put("direction", p.direction);
        }
        ArrayNode alt = out.putArray("alternative_explanations");
        for (String a : alternativeExplanations) alt.add(a);
    }

    private static void putFinite(ObjectNode o, String field, double v) {
        if (Double.isFinite(v)) o.put(field, v); else o.putNull(field);
    }

    public static InteractionSummary read(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        InteractionSummary s = new InteractionSummary();
        s.methodId = node.path("method_id").asText(InteractionMath.METHOD_ID);
        s.state = node.path("state").asText("NOT_CONFIGURED");
        s.reason = node.path("reason").asText("");
        s.bandLowHz = node.path("band_low_hz").asDouble(0);
        s.bandHighHz = node.path("band_high_hz").asDouble(0);
        s.relationshipRevision = node.path("relationship_revision").asLong(0);
        for (JsonNode p : node.path("peers")) {
            PeerRow row = new PeerRow();
            row.peerId = p.path("peer_id").asText("");
            row.state = p.path("state").asText("PEER_UNOBSERVED");
            row.associated = p.path("associated").asBoolean(false);
            row.lagS = p.path("lag_s").isNumber() ? p.path("lag_s").asDouble() : Double.NaN;
            row.peakXcorr = p.path("peak_xcorr").isNumber() ? p.path("peak_xcorr").asDouble() : Double.NaN;
            row.coherenceBandMax = p.path("coherence_band_max").isNumber() ? p.path("coherence_band_max").asDouble() : Double.NaN;
            row.supportS = p.path("support_s").asDouble(0);
            row.direction = p.path("direction").asText("NONE");
            s.peers.add(row);
        }
        for (JsonNode a : node.path("alternative_explanations")) s.alternativeExplanations.add(a.asText());
        return s;
    }
}
