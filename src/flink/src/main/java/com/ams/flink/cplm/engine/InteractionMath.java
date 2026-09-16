package com.ams.flink.cplm.engine;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 2F.1 (spec §2.13 / R09; NR-028): G13 aligned peer analysis. For each configured peer
 * (bounded by max_peers) the peer's accepted samples are aligned onto the loop's own accepted
 * instants, the shared valid support is masked, the normalised cross-correlation is computed over
 * ±lag_max_s and the magnitude-squared coherence (Welch) is read in the loop's oscillation band.
 * A peer is INTERACTION-associated only when both the coherence in band and the peak
 * cross-correlation clear their thresholds on enough shared support. Everything else is a stated
 * state: PEER_UNOBSERVED, INSUFFICIENT_SUPPORT, NOT_ANALYSED_MAX_PEERS. A configured link with no
 * analysable peer is UNAVAILABLE - never a verdict either way. Pairwise association is not
 * causality: the alternative explanations are listed with the result.
 */
public final class InteractionMath {
    public static final String METHOD_ID = "G13.ALIGNED_PEER_ANALYSIS_V1";

    public static final class Config implements Serializable {
        private static final long serialVersionUID = 1L;
        public double lagMaxS = 600;
        public double coherenceMin = 0.6;
        public double xcorrMin = 0.5;
        public double minCompatibleSupportS = 1800;
        public int maxPeers = 12;
        public int segmentSamples = 256;
        public double overlapFraction = 0.5;
        public double bandLowHz = 1.0 / 3600, bandHighHz = 1.0 / 60;
    }

    /** One loop's accepted PV samples (sorted by time) with the validity of each. */
    public static final class Series implements Serializable {
        private static final long serialVersionUID = 1L;
        public final String loopId;
        public final long[] tsMs;
        public final double[] value;
        public final boolean[] valid;
        public final double tsSec;

        public Series(String loopId, long[] tsMs, double[] value, boolean[] valid, double tsSec) {
            this.loopId = loopId;
            this.tsMs = tsMs;
            this.value = value;
            this.valid = valid;
            this.tsSec = tsSec;
        }
    }

    public static final class Peer implements Serializable {
        private static final long serialVersionUID = 1L;
        public String peerId;
        /** ANALYSED | PEER_UNOBSERVED | INSUFFICIENT_SUPPORT | NOT_ANALYSED_MAX_PEERS. */
        public String state = "PEER_UNOBSERVED";
        public boolean associated;
        /** Lag (s) at the cross-correlation peak: positive when the peer follows the loop. */
        public double lagS = Double.NaN;
        public double peakXcorr = Double.NaN;
        public double coherenceBandMax = Double.NaN, coherenceBandMean = Double.NaN;
        /** PEER_FOLLOWS_LOOP | PEER_LEADS_LOOP | SIMULTANEOUS | NONE - the sign of the lag, not a causal claim. */
        public String direction = "NONE";
        public double supportS;
        public double supportFraction;
        public long[] alignedTsMs = new long[0];
        public double[] own = new double[0], peer = new double[0];
        public boolean[] supportMask = new boolean[0];
        public double[] lagAxisS = new double[0], xcorr = new double[0];
        public double[] freqHz = new double[0], coherence = new double[0];
    }

    public static final class Result implements Serializable {
        private static final long serialVersionUID = 1L;
        /** INTERACTION_DETECTED | NO_INTERACTION | UNAVAILABLE | NOT_CONFIGURED. */
        public String state = "NOT_CONFIGURED";
        public String reason = "NO_PEER_LINKS";
        public List<Peer> peers = new ArrayList<>();
        public List<String> alternativeExplanations = new ArrayList<>();
        public double bandLowHz, bandHighHz;
    }

    private InteractionMath() {}

    public static Result analyse(Series own, List<Series> peers, Config cfg) {
        Result r = new Result();
        r.bandLowHz = cfg.bandLowHz;
        r.bandHighHz = cfg.bandHighHz;
        if (peers == null || peers.isEmpty()) return r;                     // NOT_CONFIGURED / NO_PEER_LINKS
        int analysed = 0, unobserved = 0, insufficient = 0;
        List<String> associatedIds = new ArrayList<>();
        for (int i = 0; i < peers.size(); i++) {
            Series s = peers.get(i);
            Peer p = new Peer();
            p.peerId = s.loopId;
            r.peers.add(p);
            if (i >= cfg.maxPeers) {
                p.state = "NOT_ANALYSED_MAX_PEERS";
                continue;
            }
            if (s.tsMs == null || s.tsMs.length == 0) {
                p.state = "PEER_UNOBSERVED";
                unobserved++;
                continue;
            }
            align(own, s, p);
            int shared = 0;
            for (boolean b : p.supportMask) if (b) shared++;
            p.supportS = shared * own.tsSec;
            p.supportFraction = own.tsMs.length == 0 ? 0 : shared / (double) own.tsMs.length;
            if (p.supportS < cfg.minCompatibleSupportS || shared < 16) {
                p.state = "INSUFFICIENT_SUPPORT";
                insufficient++;
                continue;
            }
            p.state = "ANALYSED";
            analysed++;
            crossCorrelation(p, own.tsSec, cfg.lagMaxS);
            coherence(p, own.tsSec, cfg);
            p.associated = p.coherenceBandMax >= cfg.coherenceMin && Math.abs(p.peakXcorr) >= cfg.xcorrMin;
            if (p.associated) {
                associatedIds.add(p.peerId);
                p.direction = Math.abs(p.lagS) < own.tsSec ? "SIMULTANEOUS" : p.lagS > 0 ? "PEER_FOLLOWS_LOOP" : "PEER_LEADS_LOOP";
            }
        }
        if (analysed == 0) {
            r.state = "UNAVAILABLE";
            r.reason = unobserved > 0 && insufficient == 0 ? "PEER_UNOBSERVED" : unobserved == 0 ? "INSUFFICIENT_SUPPORT" : "PEER_UNOBSERVED_OR_INSUFFICIENT_SUPPORT";
            return r;
        }
        if (associatedIds.isEmpty()) {
            r.state = "NO_INTERACTION";
            r.reason = "NO_PEER_CLEARS_COHERENCE_AND_XCORR" + (unobserved + insufficient > 0 ? "_SOME_PEERS_UNANALYSED" : "");
            return r;
        }
        r.state = "INTERACTION_DETECTED";
        r.reason = "ASSOCIATED_PEERS:" + String.join(",", associatedIds);
        r.alternativeExplanations.add("COMMON_UPSTREAM_DISTURBANCE_DRIVES_BOTH");
        r.alternativeExplanations.add("SHARED_MEASUREMENT_OR_UTILITY_HEADER");
        r.alternativeExplanations.add("PAIRWISE_ASSOCIATION_IS_NOT_CAUSAL_DIRECTION");
        for (Peer p : r.peers) if (p.associated && "PEER_LEADS_LOOP".equals(p.direction)) r.alternativeExplanations.add(p.peerId + "_MAY_BE_THE_SOURCE_LAG_" + Math.round(-p.lagS) + "S");
        for (Peer p : r.peers) if (p.associated && "PEER_FOLLOWS_LOOP".equals(p.direction)) r.alternativeExplanations.add(p.peerId + "_MAY_BE_A_VICTIM_LAG_" + Math.round(p.lagS) + "S");
        return r;
    }

    /** Nearest peer sample within three quarters of the loop's grid onto each own instant; the support mask is both valid. */
    static void align(Series own, Series peer, Peer p) {
        int n = own.tsMs.length;
        p.alignedTsMs = own.tsMs.clone();
        p.own = own.value.clone();
        p.peer = new double[n];
        p.supportMask = new boolean[n];
        long tolMs = (long) Math.max(1, own.tsSec * 750);
        int j = 0;
        for (int i = 0; i < n; i++) {
            long t = own.tsMs[i];
            while (j + 1 < peer.tsMs.length && Math.abs(peer.tsMs[j + 1] - t) <= Math.abs(peer.tsMs[j] - t)) j++;
            boolean found = peer.tsMs.length > 0 && Math.abs(peer.tsMs[j] - t) <= tolMs && peer.valid[j] && Double.isFinite(peer.value[j]);
            p.peer[i] = found ? peer.value[j] : Double.NaN;
            p.supportMask[i] = found && own.valid[i] && Double.isFinite(own.value[i]);
        }
    }

    /** Normalised cross-correlation r(k) = corr(own[t], peer[t + k]) over the shared support, k in ±lagMax. */
    static void crossCorrelation(Peer p, double tsSec, double lagMaxS) {
        int n = p.own.length;
        int maxLag = (int) Math.max(1, Math.round(lagMaxS / tsSec));
        double meanX = 0, meanY = 0;
        int m = 0;
        for (int i = 0; i < n; i++) if (p.supportMask[i]) { meanX += p.own[i]; meanY += p.peer[i]; m++; }
        meanX /= Math.max(1, m);
        meanY /= Math.max(1, m);
        p.lagAxisS = new double[2 * maxLag + 1];
        p.xcorr = new double[2 * maxLag + 1];
        int best = -1;
        for (int k = -maxLag; k <= maxLag; k++) {
            double sxy = 0, sxx = 0, syy = 0;
            int c = 0;
            for (int i = Math.max(0, -k); i + k < n && i < n; i++) {
                if (!p.supportMask[i] || !p.supportMask[i + k]) continue;
                double dx = p.own[i] - meanX, dy = p.peer[i + k] - meanY;
                sxy += dx * dy;
                sxx += dx * dx;
                syy += dy * dy;
                c++;
            }
            int idx = k + maxLag;
            p.lagAxisS[idx] = k * tsSec;
            p.xcorr[idx] = c >= 16 && sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : Double.NaN;
        }
        // the peak of |r|; an oscillatory pair repeats its peak every period, so among peaks within
        // 2 % of the maximum the SMALLEST |lag| is reported (the physically meaningful delay)
        double maxAbs = 0;
        for (double v : p.xcorr) if (Double.isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
        for (int idx = 0; idx < p.xcorr.length; idx++) {
            double v = p.xcorr[idx];
            if (!Double.isFinite(v) || Math.abs(v) < 0.98 * maxAbs) continue;
            if (best < 0 || Math.abs(p.lagAxisS[idx]) < Math.abs(p.lagAxisS[best])) best = idx;
        }
        if (best >= 0) {
            p.peakXcorr = p.xcorr[best];
            p.lagS = p.lagAxisS[best];
        }
    }

    /** Magnitude-squared coherence on the shared support (unsupported samples replaced by the support mean so gaps add no energy). */
    static void coherence(Peer p, double tsSec, Config cfg) {
        int n = p.own.length;
        double meanX = 0, meanY = 0;
        int m = 0;
        for (int i = 0; i < n; i++) if (p.supportMask[i]) { meanX += p.own[i]; meanY += p.peer[i]; m++; }
        meanX /= Math.max(1, m);
        meanY /= Math.max(1, m);
        double[] x = new double[n], y = new double[n];
        for (int i = 0; i < n; i++) {
            x[i] = p.supportMask[i] ? p.own[i] - meanX : 0;
            y[i] = p.supportMask[i] ? p.peer[i] - meanY : 0;
        }
        WelchPsd.Cross c = WelchPsd.cross(x, y, tsSec, cfg.segmentSamples, cfg.overlapFraction);
        p.freqHz = c.freqHz;
        p.coherence = c.coherence;
        double max = Double.NaN, sum = 0;
        int count = 0;
        for (int k = 1; k < c.freqHz.length; k++) {
            if (c.freqHz[k] < cfg.bandLowHz || c.freqHz[k] > cfg.bandHighHz || !Double.isFinite(c.coherence[k])) continue;
            if (Double.isNaN(max) || c.coherence[k] > max) max = c.coherence[k];
            sum += c.coherence[k];
            count++;
        }
        p.coherenceBandMax = max;
        p.coherenceBandMean = count == 0 ? Double.NaN : sum / count;
    }
}
