package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.engine.InteractionMath;
import com.ams.flink.cplm.engine.InteractionSummary;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2F.1 (R09; NR-028): G13 in fusion is the long tier's aligned analysis. A configured
 * link with an unobserved peer is UNAVAILABLE and blocks nothing; a DETECTED interaction on an
 * oscillating loop without actuator stress records the disturbance context (stiction demoted);
 * a long row without the analysis is LEGACY_FLAG_ONLY and the flag never drives a verdict.
 */
public class FusionInteractionTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static CplmShortFeatureResult shortF() {
        CplmShortFeatureResult r = new CplmShortFeatureResult();
        r.loopId = "V2_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L;
        r.sufficientData = true; r.completeness = 1.0; r.sampleCount = 17_280; r.expectedSampleCount = 17_280;
        r.gate0Status = "PASS"; r.gate1Status = "PASS"; r.autoPct = 1.0;
        r.gate2Status = "PASS"; r.gate2rStatus = "PASS"; r.operatingRegionValid = true; r.gate3Status = "PASS";
        r.effortRatio = 0.02; r.gate4Status = "PASS"; r.reversalCount = 1;               // no actuator stress (TIC floor 0.03 x 2, travel floor 1.0)
        return r;
    }

    /** An oscillating loop with sinusoidal shape (no triangularity), no actuator stress. */
    private static CplmLongDiagnosticsResult oscillating() {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = "V2_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L; r.sampleCount = 17_280; r.samplePeriodSec = 5;
        r.acfRegularity = 0.9; r.fftPeakRatio = 0.9; r.gate5Status = "WARN"; r.gate6Status = "WARN";
        r.periodStatus = "VALID"; r.validatedPeriodS = 600; r.completedCycles = 20;
        r.triangularity = 0.1; r.gate7Status = "PASS"; r.horchOddness = 0.1; r.gate8Status = "PASS";
        r.cornerScore = 0.1; r.cornerScoreRaw = 0.1; r.cornerScoreQualified = 0.1; r.gate9Status = "PASS";
        r.phaseAreaNormPerCycle = 0.5; r.opRangePct = 0.5; r.effortRatio = 0.02;
        r.gate10Status = "PASS"; r.gate11Status = "PASS"; r.stictionSignal = "OP";
        r.observabilityFlags.add("NO_VP");
        return r;
    }

    private static InteractionSummary summary(String state, String reason, String peerState, boolean associated, double coh) {
        InteractionMath.Result m = new InteractionMath.Result();
        m.state = state;
        m.reason = reason;
        InteractionMath.Peer p = new InteractionMath.Peer();
        p.peerId = "TIC10305";
        p.state = peerState;
        p.associated = associated;
        p.coherenceBandMax = coh;
        p.peakXcorr = associated ? 0.92 : 0.1;
        p.lagS = associated ? -60 : Double.NaN;
        p.direction = associated ? "PEER_LEADS_LOOP" : "NONE";
        m.peers.add(p);
        if (associated) m.alternativeExplanations.add("COMMON_UPSTREAM_DISTURBANCE_DRIVES_BOTH");
        return InteractionSummary.of(m, 3);
    }

    private static CplmLoopDynamicsProfile tic() {
        return CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC);
    }

    @Test
    public void nr028AnUnobservedPeerIsUnavailableAndNeverADisturbanceContext() {
        CplmLongDiagnosticsResult l = oscillating();
        l.interaction = summary("UNAVAILABLE", "PEER_UNOBSERVED", "PEER_UNOBSERVED", false, Double.NaN);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(), l, false, true, tic());
        assertEquals("NOT_EVALUATED", r.gate13Status);
        assertEquals("PEER_UNOBSERVED", r.gate13Reason);
        assertEquals(InteractionMath.METHOD_ID, r.gate13Method);
        assertTrue(r.hasPeerLinks);                                                        // the link exists...
        assertFalse("...but a link is not a verdict", r.observabilityFlags.contains("DISTURBANCE_CONTEXT"));
        assertFalse(r.familyDisqualifiers.contains("stiction:DISTURBANCE_CONTEXT"));
        assertEquals("OSCILLATION_TUNING", r.verdictV2.leadingHypothesis);
        assertFalse(r.verdictV2.hypotheses.get("EXTERNAL_DISTURBANCE").evidenceGroups.contains("PEER_INTERACTION"));
    }

    @Test
    public void aDetectedInteractionRecordsTheDisturbanceContextAndSupportsTheDisturbanceHypothesis() {
        CplmLongDiagnosticsResult l = oscillating();
        l.interaction = summary("INTERACTION_DETECTED", "ASSOCIATED_PEERS:TIC10305", "ANALYSED", true, 0.94);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(), l, false, true, tic());
        assertEquals("WARN", r.gate13Status);
        assertTrue(r.observabilityFlags.contains("INTERACTION_DETECTED"));
        assertTrue(r.observabilityFlags.contains("DISTURBANCE_CONTEXT"));
        assertTrue(r.familyDisqualifiers.contains("stiction:DISTURBANCE_CONTEXT"));
        assertTrue(r.verdictV2.hypotheses.get("EXTERNAL_DISTURBANCE").evidenceGroups.contains("PEER_INTERACTION"));
        assertEquals("EXTERNAL_DISTURBANCE", r.verdictV2.leadingHypothesis);
        Observation o = r.verdictV2.observations.get("PEER_INTERACTION");
        assertTrue(o.present);
        assertEquals(0.94, o.score, 1e-9);
        assertEquals("SUPPORTING", o.role);
    }

    @Test
    public void anExcludedWindowStillNamesTheAnalysisAndItsReasonNeverLegacy() {
        // lab finding (2026-09-17): a cold 24 h window fails G0, the fused row is EXCLUDED before the context
        // gates are stamped, and read "LEGACY_FLAG_ONLY" as if an old jar had produced it
        CplmLongDiagnosticsResult l = oscillating();
        l.interaction = summary("NOT_CONFIGURED", "NO_PEER_LINKS", "NONE", false, Double.NaN);
        l.interaction.peers.clear();
        CplmShortFeatureResult s = shortF();
        s.gate0Status = "FAIL";
        CplmGateResult r = CplmGateFusionEngine.fuse(s, l, false, false, tic());
        assertEquals("EXCLUDED_DATA_QUALITY", r.diagnosis);
        assertEquals("NOT_EVALUATED", r.gate13Status);
        assertEquals(InteractionMath.METHOD_ID, r.gate13Method);
        assertEquals("NO_PEER_LINKS", r.gate13Reason);
        assertNotNull(r.interaction);
        assertFalse(r.hasPeerLinks);
    }

    @Test
    public void aLegacyLongRowKeepsTheFlagLabelledLegacyAndItDrivesNothing() {
        CplmLongDiagnosticsResult l = oscillating();                                       // interaction == null
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(), l, false, true, tic());
        assertEquals("NOT_EVALUATED", r.gate13Status);
        assertEquals("LEGACY_FLAG_ONLY", r.gate13Method);
        assertTrue(r.observabilityFlags.contains("G13_LEGACY_FLAG_ONLY"));
        assertFalse(r.observabilityFlags.contains("DISTURBANCE_CONTEXT"));
        assertEquals("DISPLAY_ONLY", r.verdictV2.observations.get("PEER_LINKS").role);
    }

    @Test
    public void theInteractionRidesTheFusedJson() throws Exception {
        CplmLongDiagnosticsResult l = oscillating();
        l.interaction = summary("NO_INTERACTION", "NO_PEER_CLEARS_COHERENCE_AND_XCORR", "ANALYSED", false, 0.2);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(), l, false, true, tic());
        assertEquals("PASS", r.gate13Status);
        JsonNode n = MAPPER.readTree(r.toJson());
        assertEquals("NO_INTERACTION", n.path("interaction").path("state").asText());
        assertEquals("TIC10305", n.path("interaction").path("peers").get(0).path("peer_id").asText());
        assertEquals(InteractionMath.METHOD_ID, n.path("gate13_method").asText());
        assertEquals("PASS", n.path("gates").path("G13").asText());
    }
}
