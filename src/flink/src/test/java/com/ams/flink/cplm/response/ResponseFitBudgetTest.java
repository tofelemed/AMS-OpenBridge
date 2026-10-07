package com.ams.flink.cplm.response;

import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.estimation.ResponseFitFixtures;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-075 (lab 2026-10-06/07, three times): one G12 fit on a long jittered event ran 30-70 min inside
 * processElement - the 20 s budget was only checked AFTER the fit, the checkpoint expired, the task
 * could not be cancelled in 180 s and the TaskManager killed itself, restarting every job on it.
 * The budget is now a deadline the fit honours: it finishes or censors BUDGET_EXCEEDED in time.
 */
public class ResponseFitBudgetTest {

    private static ResponseCapture.Closed closed(int samples) {
        double[] t = ResponseFitFixtures.times(ResponseFitFixtures.EPOCH_MS, samples, 1000, 50, 7);
        EventDataset d = ResponseFitFixtures.stepEvent("FOPDT", new double[] {3, 37.3, 300}, t, 60, 0.2, 11);
        ResponseEvent e = new ResponseEvent(ResponseEvent.idFor("FIC10302", Math.round(d.t0 * 1000), EventType.INPUT_TEST, "b"), "FIC10302",
                EventType.INPUT_TEST, "OP_TO_PV", d.t0 * 1000, ResponseFitFixtures.U_BEFORE, ResponseFitFixtures.U_BEFORE + ResponseFitFixtures.DU,
                Collections.singletonList(new double[] {d.t0 * 1000, ResponseFitFixtures.U_BEFORE + ResponseFitFixtures.DU}));
        e.tEndMs = d.tEnd * 1000;
        e.captureState = "COMPLETE";
        return new ResponseCapture.Closed(e, d, ResponseFitFixtures.U_BEFORE, 100, 100, ResponseFitFixtures.DU, "OP_COMMAND", true);
    }

    private static ResponseJobConfig cfg(long budgetMs) {
        ResponseJobConfig c = new ResponseJobConfig();             // production defaults: theta 0..600 s, 5 s grid
        c.fitBudgetMs = budgetMs;
        return c;
    }

    private static ResponseEvaluator.Outcome evaluate(ResponseJobConfig c, ResponseCapture.Closed closed) {
        return new ResponseEvaluator(c).evaluate(closed, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
    }

    /** 4 h at 1 s with +-50 ms jitter (14,400 samples), production grid, 5 s budget: done or censored by 7 s. */
    @Test(timeout = 120_000)
    public void aProductionSizeJitteredEventEndsWithinTheBudget() {
        ResponseCapture.Closed c = closed(14_400);
        evaluate(cfg(1), closed(600));    // warm-up: the first evaluate in a JVM loads Jackson, G12Result, ... (~3.5 s over the test mount)
        long started = System.nanoTime();
        G12Result g = evaluate(cfg(5_000), c).result;
        long tookMs = (System.nanoTime() - started) / 1_000_000;
        System.out.println("CHG-075 budget test: evaluate took " + tookMs + " ms, finding " + g.finding + ", D " + g.subgates.get("D").state
                + ", fit_ms " + g.subgates.get("D").outputs.get("fit_ms") + ", stage " + g.subgates.get("D").outputs.get("budget_stage"));
        assertTrue("evaluate took " + tookMs + " ms against a 5,000 ms budget", tookMs <= 5_000 + 2_000);
        assertTrue(g.finding, "BUDGET_EXCEEDED".equals(g.finding) || "ESTIMATED".equals(g.subgates.get("D").state));
    }

    /** The budget path: CENSORED, finding and rejection BUDGET_EXCEEDED, budget outputs, never a partial model. */
    @Test(timeout = 120_000)
    public void anExpiredBudgetCensorsWithTheDocumentedRejection() {
        ResponseEvaluator.Outcome o = evaluate(cfg(1), closed(3_600));
        G12Result g = o.result;
        G12Result.Subgate d = g.subgates.get("D");
        assertEquals("CENSORED", g.evaluationState);
        assertEquals("BUDGET_EXCEEDED", g.finding);
        assertEquals("CENSORED", d.state);
        assertEquals(1L, d.outputs.get("budget_ms"));
        assertTrue("budget_stage " + d.outputs.get("budget_stage"), String.valueOf(d.outputs.get("budget_stage")).startsWith("OE_THETA"));
        assertEquals("NONE", g.modelState);                           // never a partial model
        assertFalse(g.metrics.containsKey("process_gain") && g.metrics.get("process_gain").available());
        EvidenceArtifact rej = o.artifacts.stream().filter(x -> x.kind.equals("rejection_reasons")).findFirst().get();
        assertTrue(String.valueOf(rej.provenance.get("reasons")), String.valueOf(rej.provenance.get("reasons")).contains("ESTIMATION:BUDGET_EXCEEDED"));
        assertFalse(o.artifacts.stream().anyMatch(x -> x.kind.equals("y_fit")));
    }
}
