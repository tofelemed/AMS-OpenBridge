package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 2F.1: G13 on the long tier. Turns the loop's accepted PV samples and the peers'
 * samples (keyed by peer id, as the fan-out delivered them) into {@link InteractionMath} series,
 * takes the thresholds from the profile and the band from the loop's oscillation period range,
 * and records the outcome on the result (scalars) and the intermediates (arrays). No peers
 * configured is NOT_CONFIGURED - a stated absence, never a pass.
 */
public final class InteractionGate {
    private InteractionGate() {}

    public static void apply(CplmLongDiagnosticsResult r, List<CplmNormalizedSample> own, Map<String, List<CplmNormalizedSample>> peers,
                             List<String> configuredPeers, long relationshipRevision, CplmLoopDynamicsProfile profile) {
        InteractionMath.Config cfg = new InteractionMath.Config();
        cfg.lagMaxS = profile.g13LagMaxS;
        cfg.coherenceMin = profile.g13CoherenceMin;
        cfg.xcorrMin = profile.g13XcorrMin;
        cfg.minCompatibleSupportS = profile.g13MinCompatibleSupportS;
        cfg.maxPeers = profile.g13MaxPeers;
        cfg.overlapFraction = profile.g6OverlapFraction;
        double tsSec = r.samplePeriodSec > 0 ? r.samplePeriodSec : SignalMath.inferSamplePeriodSec(own);
        cfg.segmentSamples = OscillationMath.segmentSamplesForBand(own.size(), tsSec, profile);
        cfg.bandLowHz = profile.tauMaxS > 0 ? 1.0 / profile.tauMaxS : 1.0 / 3600;
        cfg.bandHighHz = profile.tauMinS > 0 ? 1.0 / profile.tauMinS : 1.0 / 60;

        if (configuredPeers != null && !configuredPeers.isEmpty() && own.size() < 16) {
            InteractionMath.Result short_ = new InteractionMath.Result();
            short_.state = "UNAVAILABLE";
            short_.reason = "OWN_INSUFFICIENT_SUPPORT";
            for (String peerId : configuredPeers) {
                InteractionMath.Peer p = new InteractionMath.Peer();
                p.peerId = peerId;
                p.state = "INSUFFICIENT_SUPPORT";
                short_.peers.add(p);
            }
            r.interaction = InteractionSummary.of(short_, relationshipRevision);
            return;
        }
        InteractionMath.Series ownSeries = series(r.loopId, own, tsSec);
        List<InteractionMath.Series> peerSeries = new ArrayList<>();
        for (String peerId : configuredPeers) {
            List<CplmNormalizedSample> ps = peers == null ? null : peers.get(peerId);
            peerSeries.add(ps == null ? new InteractionMath.Series(peerId, new long[0], new double[0], new boolean[0], tsSec) : series(peerId, ps, tsSec));
        }
        InteractionMath.Result result = InteractionMath.analyse(ownSeries, peerSeries, cfg);
        r.interaction = InteractionSummary.of(result, relationshipRevision);
        if (r.intermediates != null) r.intermediates.interaction = result;
    }

    static InteractionMath.Series series(String loopId, List<CplmNormalizedSample> samples, double tsSec) {
        int n = samples.size();
        long[] ts = new long[n];
        double[] v = new double[n];
        boolean[] valid = new boolean[n];
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = samples.get(i);
            ts[i] = s.eventTsMs;
            v[i] = s.pv;
            valid[i] = Double.isFinite(s.pv) && s.isGoodQuality();
        }
        return new InteractionMath.Series(loopId, ts, v, valid, tsSec);
    }
}
