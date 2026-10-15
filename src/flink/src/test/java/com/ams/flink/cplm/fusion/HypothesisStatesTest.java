package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmShortFeatureResult;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-095 (SME review 2, #7): a missing input is NOT_ASSESSED (naming the input), never evidence against;
 * DISQUALIFIED needs a real contradiction or disqualifier; anything else unqualified is NO_EVIDENCE.
 */
public class HypothesisStatesTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void settleOrdersTheReasons() {
        assertEquals("QUALIFIED", Hypothesis.of("X", 0.8, true).settle("NO_VP").state);
        assertEquals("NO_EVIDENCE", Hypothesis.of("X", 0, false).settle().state);

        Hypothesis missing = Hypothesis.of("X", 0, false).settle("NO_UPSTREAM_LINKS");
        assertEquals("NOT_ASSESSED", missing.state);
        assertEquals(Arrays.asList("NO_UPSTREAM_LINKS"), missing.missingInputs);

        Hypothesis against = Hypothesis.of("X", 0, false);
        against.disqualifiers.add("NO_SHAPE_EVIDENCE");
        assertEquals("evidence against wins over a missing input", "DISQUALIFIED", against.settle("NO_VP").state);
    }

    private static CplmShortFeatureResult shortF() {
        CplmShortFeatureResult r = new CplmShortFeatureResult();
        r.loopId = "HS_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L;
        r.sufficientData = true; r.completeness = 1.0; r.sampleCount = 17_280; r.expectedSampleCount = 17_280;
        r.gate0Status = "PASS"; r.gate1Status = "PASS"; r.autoPct = 1.0;
        r.gate2Status = "PASS"; r.gate2rStatus = "PASS"; r.operatingRegionValid = true; r.gate3Status = "PASS";
        r.effortRatio = 0.5; r.gate4Status = "PASS"; r.reversalCount = 5;
        return r;
    }

    /** A quiet loop: no oscillation, no valid cycle, nothing triangular. */
    private static CplmLongDiagnosticsResult quietLong(boolean hasVp) {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = "HS_LOOP"; r.loopType = "TIC"; r.windowKind = "24h";
        r.windowStartMs = 0; r.windowEndMs = 86_400_000L; r.sampleCount = 17_280; r.samplePeriodSec = 5;
        r.acfRegularity = 0.1; r.fftPeakRatio = 0.1; r.gate5Status = "PASS"; r.gate6Status = "PASS";
        r.periodStatus = "NO_VALID_CYCLE"; r.completedCycles = 0;
        r.triangularity = 0.1; r.gate7Status = "PASS"; r.horchOddness = 0.1; r.gate8Status = "PASS";
        r.cornerScore = 0.1; r.cornerScoreRaw = 0.1; r.cornerScoreQualified = 0.1; r.gate9Status = "PASS";
        r.opRangePct = 10; r.effortRatio = 0.5; r.gate10Status = "PASS"; r.gate11Status = "PASS";
        r.hasVp = hasVp;
        if (!hasVp) r.observabilityFlags.add("NO_VP");
        return r;
    }

    private static CplmGateResult fuse(boolean hasVp, boolean hasPeerLinks) {
        return CplmGateFusionEngine.fuse(shortF(), quietLong(hasVp), false, hasPeerLinks,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC));
    }

    @Test
    public void missingInputsAreNotAssessedNotEvidenceAgainst() {
        CplmGateResult r = fuse(false, false);
        Hypothesis disturbance = r.verdictV2.hypotheses.get("EXTERNAL_DISTURBANCE");
        assertEquals("NOT_ASSESSED", disturbance.state);
        assertTrue(disturbance.missingInputs.contains("NO_UPSTREAM_LINKS"));

        Hypothesis stiction = r.verdictV2.hypotheses.get("STICTION");
        assertEquals("NOT_ASSESSED", stiction.state);
        assertEquals(Arrays.asList("NO_VP", "NO_VALID_CYCLE"), stiction.missingInputs);

        Hypothesis sensor = r.verdictV2.hypotheses.get("SENSOR");
        assertEquals("NOT_ASSESSED", sensor.state);
        assertTrue(sensor.missingInputs.contains("HEALTH_NOT_CONFIGURED"));

        assertEquals("NO_EVIDENCE", r.verdictV2.hypotheses.get("EXCESSIVE_EFFORT").state);
        assertEquals("NO_EVIDENCE", r.verdictV2.hypotheses.get("OSCILLATION_TUNING").state);
    }

    @Test
    public void withTheInputsPresentAQuietLoopHasNoEvidence() {
        CplmGateResult r = fuse(true, true);
        assertEquals("NO_EVIDENCE", r.verdictV2.hypotheses.get("EXTERNAL_DISTURBANCE").state);
        assertEquals("NO_EVIDENCE", r.verdictV2.hypotheses.get("STICTION").state);
        assertTrue(r.verdictV2.hypotheses.get("STICTION").missingInputs.isEmpty());
    }

    @Test
    public void missingInputsRideTheJsonInSnakeCase() throws Exception {
        JsonNode n = MAPPER.readTree(fuse(false, false).toJson());
        JsonNode d = n.path("hypotheses").path("EXTERNAL_DISTURBANCE");
        assertEquals("NOT_ASSESSED", d.path("state").asText());
        assertEquals("NO_UPSTREAM_LINKS", d.path("missing_inputs").get(0).asText());
        assertTrue(n.path("hypotheses").path("EXCESSIVE_EFFORT").path("missing_inputs").isArray());
    }
}
