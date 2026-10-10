package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.engine.LongDiagnosticsCalculator;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-082: a loop DECLARED without a valve position (registry engineering.vpApplicability NOT_APPLICABLE /
 * NOT_INSTALLED, broadcast on cplm.loop.engineering) has no VP data gap: no NO_VP flag, G14 NOT_APPLICABLE,
 * no "bind VP" advice. Valve hypotheses are still ranked but top out at SUSPECTED (0.89): without a VP
 * nothing can confirm a final-element fault (R02). EXPECTED and unmapped keeps today's behaviour.
 */
public class VpApplicabilityTest {
    private static final long T0 = 1_756_600_000_000L;

    private static CplmLoopDynamicsProfile profile(String engineeringJson) {
        CplmDynamicsParameterSetSupport.MapLookup attrs = new CplmDynamicsParameterSetSupport.MapLookup();
        if (engineeringJson != null) attrs.put("VPA_LOOP:cplm.loop.engineering", engineeringJson);
        return CplmDynamicsParameterSetSupport.resolve("VPA_LOOP", "TIC", null, attrs);
    }

    private static CplmShortFeatureResult shortF(double effortRatio, String g4) {
        CplmShortFeatureResult r = new CplmShortFeatureResult();
        r.loopId = "VPA_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L;
        r.sufficientData = true; r.completeness = 1.0; r.sampleCount = 17_280; r.expectedSampleCount = 17_280;
        r.gate0Status = "PASS"; r.gate1Status = "PASS"; r.autoPct = 1.0;
        r.gate2Status = "PASS"; r.gate2rStatus = "PASS"; r.operatingRegionValid = true; r.gate3Status = "PASS";
        r.effortRatio = effortRatio; r.gate4Status = g4; r.reversalCount = 5;
        return r;
    }

    /** A strong stiction-shaped long slice (valid 600 s oscillation) WITHOUT a VP signal and without the long stage's flag. */
    private static CplmLongDiagnosticsResult stictionLongNoVp() {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = "VPA_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L; r.sampleCount = 17_280; r.samplePeriodSec = 5;
        r.acfRegularity = 0.9; r.fftPeakRatio = 0.9; r.gate5Status = "WARN"; r.gate6Status = "WARN";
        r.periodStatus = "VALID"; r.validatedPeriodS = 600; r.completedCycles = 20;
        r.triangularity = 0.95; r.gate7Status = "STRONG";
        r.horchOddness = 0.9; r.gate8Status = "STRONG";
        r.cornerScore = 0.9; r.cornerScoreRaw = 0.9; r.cornerScoreQualified = 0.9; r.gate9Status = "STRONG";
        r.phaseAreaNormPerCycle = 0.5; r.opRangePct = 10; r.effortRatio = 6.0;
        r.gate10Status = "PASS"; r.gate11Status = "PASS"; r.stictionSignal = "OP";
        r.hasVp = false;
        return r;
    }

    private static List<CplmNormalizedSample> windowNoVp(int n) {
        List<CplmNormalizedSample> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "VPA_LOOP"; s.eventTsMs = T0 + i * 5_000L;
            s.pv = 50 + 2 * Math.sin(i / 20.0); s.sp = 50; s.op = 40 + 10 * Math.sin(i / 20.0);
            s.vp = null; s.mode = "AUT"; s.quality = "GOOD";
            out.add(s);
        }
        return out;
    }

    @Test
    public void theEngineeringRecordCarriesTheDeclaration() {
        assertEquals("NOT_APPLICABLE", profile("{\"vpApplicability\":\"NOT_APPLICABLE\"}").vpApplicability);
        assertEquals("NOT_INSTALLED", profile("{\"opEngMin\":0,\"opEngMax\":100,\"vpApplicability\":\" not_installed \"}").vpApplicability);
        assertTrue(profile("{\"vpApplicability\":\"NOT_APPLICABLE\"}").vpDeclaredAbsent());
        // absent, unknown or no record at all: EXPECTED (today's behaviour)
        assertEquals("EXPECTED", profile("{\"opEngMin\":0,\"opEngMax\":100}").vpApplicability);
        assertEquals("EXPECTED", profile("{\"vpApplicability\":\"MAYBE\"}").vpApplicability);
        assertEquals("EXPECTED", profile(null).vpApplicability);
        assertFalse(profile(null).vpDeclaredAbsent());
        // the declaration survives the copy every job takes of the resolved profile
        assertEquals("NOT_APPLICABLE", profile("{\"vpApplicability\":\"NOT_APPLICABLE\"}").copy().vpApplicability);
    }

    @Test
    public void theLongStageRaisesNoVpOnlyWhenAVpIsExpected() {
        List<CplmNormalizedSample> w = windowNoVp(2_000);
        long end = T0 + w.size() * 5_000L;
        CplmLongDiagnosticsResult declared = LongDiagnosticsCalculator.computeLongDiagnostics(
                w, T0, end, "4h", profile("{\"vpApplicability\":\"NOT_APPLICABLE\"}").copy());
        CplmLongDiagnosticsResult expected = LongDiagnosticsCalculator.computeLongDiagnostics(
                w, T0, end, "4h", profile(null).copy());
        assertFalse(declared.hasVp);
        assertFalse(declared.observabilityFlags.toString(), declared.observabilityFlags.contains("NO_VP"));
        assertTrue(expected.observabilityFlags.contains("NO_VP"));
    }

    @Test
    public void aValveClaimWithoutDeclaredVpIsSuspectedAndG14NotApplicable() {
        for (String decl : new String[] {"NOT_APPLICABLE", "NOT_INSTALLED"}) {
            CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), stictionLongNoVp(), false, false,
                    profile("{\"vpApplicability\":\"" + decl + "\"}"));
            assertEquals(decl, "stiction", r.selectedFamily);
            assertEquals(decl, "SUSPECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);   // ranked, never CONFIRMED
            assertEquals(decl, 0.89, r.confidence, 0.01);
            assertEquals(decl, "NOT_APPLICABLE", r.gate14Status);
            assertEquals(decl, "NOT_APPLICABLE", r.verdictV2.confirmation.state);
            assertEquals(decl, "VP_NOT_APPLICABLE", r.verdictV2.confirmation.reason);
            assertFalse(decl, r.observabilityFlags.contains("NO_VP"));
            assertFalse(decl + ": " + r.recommendation, r.recommendation.contains("VP"));
        }
    }

    @Test
    public void expectedAndUnmappedKeepsTodaysBehaviour() {
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), stictionLongNoVp(), false, false, profile(null));
        assertEquals("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        assertEquals(0.89, r.confidence, 0.01);
        assertEquals("NOT_CONFIRMED", r.gate14Status);
        assertEquals("NO_VP", r.verdictV2.confirmation.reason);
        assertTrue(r.observabilityFlags.contains("NO_VP"));
        assertTrue(r.recommendation, r.recommendation.contains("VP"));
    }

    @Test
    public void vpDataOnALoopDeclaredWithoutOneStillCounts() {
        // the declaration says no VP but a VP arrives and tracks well: the data wins, exactly as on a VP loop
        CplmLongDiagnosticsResult l = stictionLongNoVp();
        l.hasVp = true; l.vpEligibleSamples = 17_000; l.vpTrackingHealthy = true;
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF(7.0, "WARN"), l, false, false,
                profile("{\"vpApplicability\":\"NOT_APPLICABLE\"}"));
        assertEquals("CONTRADICTED", r.gate14Status);
    }

    @Test
    public void insufficientEvidenceDoesNotBlameAVpTheLoopHasNot() {
        CplmLongDiagnosticsResult l = stictionLongNoVp();
        l.triangularity = 0.1; l.gate7Status = "PASS"; l.horchOddness = 0.1; l.gate8Status = "PASS";
        l.cornerScore = 0.1; l.cornerScoreRaw = 0.1; l.cornerScoreQualified = 0.1; l.gate9Status = "PASS";
        l.acfRegularity = 0.1; l.fftPeakRatio = 0.1; l.gate5Status = "PASS"; l.gate6Status = "PASS";
        l.periodStatus = "NO_VALID_CYCLE"; l.completedCycles = 0; l.effortRatio = 0.5; l.opRangePct = 0.5;
        CplmGateResult declared = CplmGateFusionEngine.fuse(shortF(0.5, "PASS"), l, false, false,
                profile("{\"vpApplicability\":\"NOT_APPLICABLE\"}"));
        assertEquals("INSUFFICIENT_EVIDENCE", declared.diagnosis);
        assertFalse(declared.insufficientEvidenceReason, declared.insufficientEvidenceReason.contains("valve position"));
        assertFalse(declared.recommendation, declared.recommendation.contains("VP"));
        CplmGateResult expected = CplmGateFusionEngine.fuse(shortF(0.5, "PASS"), l, false, false, profile(null));
        assertTrue(expected.insufficientEvidenceReason, expected.insufficientEvidenceReason.contains("valve position unavailable"));
        assertTrue(expected.recommendation, expected.recommendation.contains("Bind VP"));
    }
}
