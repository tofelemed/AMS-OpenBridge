package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmShortFeatureResult;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1E.1 (spec v6 R02, R07; NR-026, NR-027): fusion separates what was OBSERVED
 * (symptoms), what is HYPOTHESISED (mechanisms) and what is CONFIRMED (a fault-scoped claim
 * with positive evidence). VP PRESENCE never confirms anything; healthy VP tracking
 * contradicts a non-following claim; lag asymmetry alone is never stiction.
 */
public class FusionVerdictV2Test {
    private static final double EPS = 1e-9;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static CplmShortFeatureResult shortF(double effortRatio, String g4) {
        CplmShortFeatureResult r = new CplmShortFeatureResult();
        r.loopId = "V2_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L;
        r.sufficientData = true; r.completeness = 1.0; r.sampleCount = 17_280; r.expectedSampleCount = 17_280;
        r.gate0Status = "PASS"; r.gate1Status = "PASS"; r.autoPct = 1.0;
        r.gate2Status = "PASS"; r.gate2rStatus = "PASS"; r.operatingRegionValid = true; r.gate3Status = "PASS";
        r.effortRatio = effortRatio; r.gate4Status = g4; r.reversalCount = 5;
        return r;
    }

    /** A long slice with a valid 600 s oscillation; shape/asymmetry/geometry set by the caller. */
    private static CplmLongDiagnosticsResult longD(double triangularity, String g7, double horch, String g8,
                                                   double corner, String g9, boolean hasVp) {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = "V2_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L; r.sampleCount = 17_280; r.samplePeriodSec = 5;
        r.acfRegularity = 0.9; r.fftPeakRatio = 0.9; r.gate5Status = "WARN"; r.gate6Status = "WARN";
        r.periodStatus = "VALID"; r.validatedPeriodS = 600; r.completedCycles = 20;
        r.triangularity = triangularity; r.gate7Status = g7;
        r.horchOddness = horch; r.gate8Status = g8;
        r.cornerScore = corner; r.cornerScoreRaw = corner; r.cornerScoreQualified = corner; r.gate9Status = g9;
        r.phaseAreaNormPerCycle = 0.5; r.opRangePct = 10; r.effortRatio = 6.0;
        r.gate10Status = "PASS"; r.gate11Status = "PASS"; r.stictionSignal = "OP";
        r.hasVp = hasVp;
        if (!hasVp) r.observabilityFlags.add("NO_VP");
        return r;
    }

    private static CplmLoopDynamicsProfile tic() {
        return CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC);
    }

    private static CplmLongDiagnosticsResult stictionLong(boolean hasVp) {
        return longD(0.95, "STRONG", 0.9, "STRONG", 0.9, "STRONG", hasVp);
    }

    @Test
    public void vpPresenceWithoutPositiveEvidenceNeverConfirms() {
        CplmLongDiagnosticsResult l = stictionLong(true);
        l.vpEligibleSamples = 17_000; l.vpTrackingHealthy = false; l.vpNonFollowingDwellS = 0;   // VP is there; it says nothing
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), l, false, false, tic());
        assertEquals("stiction", r.selectedFamily);
        assertEquals("NOT_CONFIRMED", r.gate14Status);
        assertEquals("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        assertEquals(0.89, r.confidence, 0.01);
        assertEquals("NOT_CONFIRMED", r.verdictV2.confirmation.state);
        assertEquals("NO_POSITIVE_EVIDENCE", r.verdictV2.confirmation.reason);
        assertTrue(r.verdictV2.confirmation.positiveEvidenceIds.isEmpty());
    }

    @Test
    public void measuredNonFollowingDwellConfirmsTheScopedClaim() {
        CplmLongDiagnosticsResult l = stictionLong(true);
        l.vpEligibleSamples = 17_000; l.vpTrackingHealthy = false; l.vpNonFollowingDwellS = 120;   // VP did not follow OP for 2 min
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), l, false, false, tic());
        assertEquals("CONFIRMED", r.gate14Status);
        assertEquals("CONFIRMED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        assertEquals("CONFIRMED", r.gate15Status);
        assertTrue("confidence " + r.confidence, r.confidence > 0.89);   // the 0.89 cap is lifted; family score is 0.95
        assertEquals("FINAL_ELEMENT_NON_FOLLOWING", r.verdictV2.confirmation.claimType);
        assertTrue(r.verdictV2.confirmation.positiveEvidenceIds.contains("G10.VP_NONFOLLOWING_DWELL"));
    }

    @Test
    public void healthyVpTrackingContradictsAStictionCall() {
        CplmLongDiagnosticsResult l = stictionLong(true);
        l.vpEligibleSamples = 17_000; l.vpTrackingHealthy = true; l.vpNonFollowingDwellS = 0;
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), l, false, false, tic());
        assertEquals("CONTRADICTED", r.gate14Status);
        assertTrue(r.confidence <= 0.54 + EPS);
        assertEquals("DETECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        assertTrue(r.verdictV2.confirmation.contradictions.contains("VP_TRACKING_HEALTHY"));
        assertTrue(r.observabilityFlags.contains("VP_TRACKING_CONTRADICTS"));
        assertTrue(r.verdictV2.hypotheses.get("STICTION").contradictions.contains("VP_TRACKING_HEALTHY"));
    }

    @Test
    public void nr026EffortOnlyWithVpMappedNeverBecomesAFinalElementFault() {
        // Strong actuator activity, no shape, no oscillation - and VP is mapped and even non-following.
        CplmLongDiagnosticsResult l = longD(0.1, "PASS", 0.1, "PASS", 0.1, "PASS", true);
        l.acfRegularity = 0.1; l.fftPeakRatio = 0.1; l.gate5Status = "PASS"; l.gate6Status = "PASS";
        l.periodStatus = "NO_VALID_CYCLE"; l.completedCycles = 0;
        l.vpEligibleSamples = 17_000; l.vpNonFollowingDwellS = 300;
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(9.0, "STRONG"), l, false, false, tic());
        assertEquals("effort", r.selectedFamily);
        assertTrue(r.diagnosis, r.diagnosis.endsWith("_EXCESSIVE_EFFORT"));
        assertFalse(r.diagnosis.contains("FINAL_ELEMENT"));
        assertEquals("NOT_APPLICABLE", r.gate14Status);
    }

    @Test
    public void nr027LinearDelayedPlantAsymmetryAloneIsNotStiction() {
        // A linear plant with pure delay: strong cross-correlation asymmetry, sinusoidal (not triangular)
        // OP, no sharp corners - plus oscillation and actuator stress. Asymmetry is SUPPORTING only.
        CplmLongDiagnosticsResult l = longD(0.15, "PASS", 0.95, "STRONG", 0.2, "PASS", false);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), l, false, false, tic());
        assertFalse(r.stictionQualified);
        assertTrue(r.familyDisqualifiers.toString(), r.familyDisqualifiers.contains("stiction:NO_SHAPE_EVIDENCE"));
        assertFalse(r.diagnosis.contains("FINAL_ELEMENT"));
        assertEquals("XCORR_ASYMMETRY_V1", r.verdictV2.observations.get("LAG_ASYMMETRY").methodId);
        assertEquals("SUPPORTING", r.verdictV2.observations.get("LAG_ASYMMETRY").role);
        assertTrue(r.verdictV2.observations.get("LAG_ASYMMETRY").present);
    }

    @Test
    public void oscillationOnlyIsLabelledAsOscillationNotAsAValveFault() {
        CplmLongDiagnosticsResult l = longD(0.1, "PASS", 0.1, "PASS", 0.1, "PASS", false);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(0.5, "PASS"), l, false, false, tic());
        assertEquals("oscillation", r.selectedFamily);
        assertTrue(r.diagnosis, r.diagnosis.endsWith("_OSCILLATION"));
        assertEquals("NOT_APPLICABLE", r.gate14Status);
        assertEquals("EVIDENCE_SCORE_UNCALIBRATED", r.verdictV2.scoreSemantics);
        assertTrue(r.verdictV2.hypotheses.containsKey("OSCILLATION_TUNING"));
        assertEquals("OSCILLATION_TUNING", r.verdictV2.leadingHypothesis);
    }

    @Test
    public void verdictV2RidesTheResultJson() throws Exception {
        CplmLongDiagnosticsResult l = stictionLong(true);
        l.vpEligibleSamples = 17_000; l.vpNonFollowingDwellS = 120;
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), l, false, false, tic());
        JsonNode n = MAPPER.readTree(r.toJson());
        assertTrue(n.has("observations"));
        assertTrue(n.has("hypotheses"));
        assertEquals("CONFIRMED", n.path("confirmation").path("state").asText());
        assertEquals("EVIDENCE_SCORE_UNCALIBRATED", n.path("score_semantics").asText());
        assertEquals(1, n.path("result_revision").asInt());
        assertEquals("CONFIRMED", n.path("gates").path("G14").asText());
        // v2.5 R10: the episode lifecycle reads the support the verdict rests on and the recovery threshold.
        assertEquals(86_400_000L, n.path("qualified_support_ms").asLong());   // 17_280 samples x 5 s = the whole window
        assertTrue(n.path("recovery_support_s").asDouble() > 0);
    }
}
