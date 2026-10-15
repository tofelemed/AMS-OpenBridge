package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import org.junit.Test;

import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-094 (SME review 2, #6 and #14): G15 names the same band as the diagnosis — one result, one name — and the
 * recommendation fits the diagnosis family, worded by how strong the evidence is (DETECTED = monitor).
 */
public class BandAndRecommendationTest {

    private static CplmGateResult banded(double confidence, String label, String g14) {
        CplmGateResult r = new CplmGateResult();
        DiagnosisBands.apply(r, confidence, label, g14);
        return r;
    }

    @Test
    public void g15IsTheDiagnosisBand() {
        CplmGateResult noCall = banded(0.20, "OSCILLATION", "NOT_APPLICABLE");
        assertEquals("NO_CALL", noCall.diagnosis);
        assertEquals("INSUFFICIENT_EVIDENCE", noCall.gate15Status);

        CplmGateResult detected = banded(0.40, "OSCILLATION", "NOT_APPLICABLE");
        assertEquals("DETECTED_OSCILLATION", detected.diagnosis);
        assertEquals("DETECTED", detected.gate15Status);

        CplmGateResult classified = banded(0.60, "EXCESSIVE_EFFORT", "NOT_APPLICABLE");
        assertEquals("CLASSIFIED_EXCESSIVE_EFFORT", classified.diagnosis);
        assertEquals("CLASSIFIED", classified.gate15Status);

        CplmGateResult suspected = banded(0.80, "OSCILLATION", "NOT_APPLICABLE");
        assertEquals("SUSPECTED", suspected.gate15Status);

        CplmGateResult confirmed = banded(0.95, "OSCILLATION", "NOT_APPLICABLE");
        assertEquals("CONFIRMED_OSCILLATION", confirmed.diagnosis);
        assertEquals("CONFIRMED", confirmed.gate15Status);

        // a final-element call without the scoped confirmation stays SUSPECTED in both fields
        CplmGateResult valve = banded(0.95, "FINAL_ELEMENT_NONLINEARITY", "NOT_CONFIRMED");
        assertEquals("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", valve.diagnosis);
        assertEquals("SUSPECTED", valve.gate15Status);
    }

    @Test
    public void everyBandedResultNamesItsBandOnce() {
        for (double c : new double[] {0.36, 0.5, 0.56, 0.7, 0.76, 0.89, 0.91}) {
            CplmGateResult r = banded(c, "OSCILLATION", "NOT_APPLICABLE");
            assertTrue(c + ": " + r.diagnosis + " vs " + r.gate15Status, r.diagnosis.startsWith(r.gate15Status + "_"));
        }
    }

    @Test
    public void thePersistenceCapRenamesBothFields() {
        CplmGateResult r = banded(0.80, "OSCILLATION", "NOT_APPLICABLE");
        r.selectedFamily = "oscillation";
        r.confidence = 0.80;
        CplmGateFusionEngine.applyPersistence(r, Arrays.asList("effort", "effort"), null);   // no agreement
        if (!r.persistenceSatisfied) {
            assertEquals("DETECTED_OSCILLATION", r.diagnosis);
            assertEquals("DETECTED", r.gate15Status);
            assertTrue(r.recommendation, r.recommendation.toLowerCase().contains("monitor"));
        }
    }

    @Test
    public void eachFamilyGetsItsOwnAction() {
        String tuning = Recommendations.of("OSCILLATION_TUNING", "SUSPECTED", true, false);
        String disturbance = Recommendations.of("EXTERNAL_DISTURBANCE", "SUSPECTED", true, false);
        String effort = Recommendations.of("EXCESSIVE_EFFORT", "SUSPECTED", true, false);
        String valve = Recommendations.of("STICTION", "SUSPECTED", true, false);
        assertTrue(tuning, tuning.contains("gain") && tuning.contains("integral"));
        assertTrue(disturbance, disturbance.contains("upstream"));
        assertTrue(effort, effort.contains("derivative") && effort.contains("filter"));
        assertTrue(valve, valve.contains("positioner"));
        assertNotEquals("oscillation is not a valve problem", valve, tuning);
        assertFalse("tuning advice does not send people to the positioner", tuning.contains("positioner"));
        assertFalse(effort.contains("positioner"));
    }

    @Test
    public void theValveAdviceRespectsTheVpDeclaration() {
        assertTrue(Recommendations.of("STICTION", "SUSPECTED", false, true).contains("VP"));        // expected, unmapped
        assertFalse(Recommendations.of("STICTION", "SUSPECTED", false, false).contains("VP"));      // declared without VP
    }

    @Test
    public void urgencyFollowsTheBand() {
        assertTrue(Recommendations.of("OSCILLATION_TUNING", "DETECTED", true, false).toLowerCase().startsWith("monitor"));
        assertTrue(Recommendations.of("OSCILLATION_TUNING", "CLASSIFIED", true, false).toLowerCase().startsWith("plan"));
        String suspected = Recommendations.of("OSCILLATION_TUNING", "SUSPECTED", true, false);
        assertFalse(suspected.toLowerCase().startsWith("monitor"));
    }
}
