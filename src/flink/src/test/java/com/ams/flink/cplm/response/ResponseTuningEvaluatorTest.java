package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-214 (plan 2e): with the loop's tuning known, a validated model gets gain / phase margins and the SIMC advice. The
 * plant does not publish the controller action, so the loop is taken as correctly acting (negative feedback): the margins
 * do not depend on the sign of the process gain. λ defaults to the model's dead time (SIMC tight) until one is approved;
 * the advice also reads back as a CENTUM proportional band.
 */
public class ResponseTuningEvaluatorTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final ControllerSnapshot TUNING = ControllerSnapshot.ideal(0.3, 25.0, null, 1.0, "UNKNOWN");

    private static ResponseJobConfig cfg() {
        ResponseJobConfig c = new ResponseJobConfig();
        c.preSupportS = 60;
        c.minCaptureS = 120;
        c.maxCaptureS = 900;
        c.tailDwellS = 60;
        c.stableBandEu = 0.6;
        c.stepMinInputEu = 1.0;
        c.eventDwellS = 15;
        c.delayGridS = 5;
        c.thetaMaxS = 30;
        c.tauMaxS = 300;
        c.fitBudgetMs = 60_000;
        c.pvSpanEu = 100;
        return c;
    }

    private static CplmNormalizedSample sample(double tS, double pv, double op) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC10302";
        x.loopType = "FIC";
        x.eventTsMs = (long) (tS * 1000);
        x.pv = pv;
        x.sp = 100;
        x.op = op;
        x.mode = "AUT";
        x.quality = "GOOD";
        return x;
    }

    /** Two exogenous input tests on {@code plant}; the second result is validated against the first. */
    private static G12Result secondResult(ProcessModel plant, ResponseJobConfig cfg, ControllerSnapshot tuning) {
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        EventDataset[] holdout = {null};
        double[] holdoutU0 = {0};
        for (double[] run : new double[][] {{0, 100, 500, 1}, {600, 700, 1100, 2}}) {
            int n = (int) ((run[2] - run[0]) / 5) + 1;
            double[] t = new double[n], u = new double[n];
            for (int i = 0; i < n; i++) { t[i] = run[0] + 5 * i; u[i] = t[i] < run[1] ? 40 : 45; }
            ZohSimulator.Result sim = ZohSimulator.simulate(plant, t, u, 40, 100, 0, run[1], 60);
            Random rnd = new Random((long) run[3]);
            for (int i = 0; i < n; i++) {
                for (ResponseCapture.Closed c : cap.onSample(sample(t[i], sim.yHat[i] + 0.05 * rnd.nextGaussian(), u[i]), false)) {
                    ResponseEvaluator.Outcome o = ev.evaluate(c, ModelFamily.FOPDT, holdout[0], holdoutU0[0], tuning, 1_789_600_000_000L, "LIVE", "", 0);
                    results.add(o.result);
                    if (o.holdoutCandidate != null) { holdout[0] = o.holdoutCandidate; holdoutU0[0] = o.holdoutU0; }
                }
            }
        }
        assertEquals(2, results.size());
        G12Result second = results.get(1);
        assertEquals("VALIDATED", second.modelState);
        return second;
    }

    @Test
    public void aKnownTuningGivesMarginsAndTheProportionalBand() {
        G12Result r = secondResult(ProcessModel.fopdt("OP_TO_PV", 3.0, 10.0, 20.0), cfg(), TUNING);
        assertEquals("EVALUATED", r.subgates.get("F").state);
        assertTrue(r.metrics.get("gain_margin").available());
        assertTrue(r.metrics.get("phase_margin").available());
        assertEquals("100 x 100 / (0.3 x 100)", 100.0 * 100 / (0.3 * 100), ((Number) r.subgates.get("F").outputs.get("controller_p_band_pct")).doubleValue(), 1e-9);
    }

    @Test
    public void theMarginsDoNotDependOnTheSignOfTheProcessGain() {
        G12Result pos = secondResult(ProcessModel.fopdt("OP_TO_PV", 3.0, 10.0, 20.0), cfg(), TUNING);
        G12Result neg = secondResult(ProcessModel.fopdt("OP_TO_PV", -3.0, 10.0, 20.0), cfg(), TUNING);
        assertTrue("a reverse-acting process still has margins", neg.metrics.get("gain_margin").available());
        assertEquals(pos.metrics.get("gain_margin").value, neg.metrics.get("gain_margin").value, 0.5);
        assertEquals(pos.metrics.get("phase_margin").value, neg.metrics.get("phase_margin").value, 3.0);
    }

    @Test
    public void lambdaDefaultsToTheDeadTimeAndTheAdviceReadsAsABand() {
        G12Result r = secondResult(ProcessModel.fopdt("OP_TO_PV", 3.0, 10.0, 20.0), cfg(), TUNING);
        G12Result.Subgate h = r.subgates.get("H");
        assertEquals("EVALUATED", h.state);
        assertEquals("DEAD_TIME_RULE", h.outputs.get("lambda_source"));
        double lambda = ((Number) h.outputs.get("lambda_s")).doubleValue();
        assertEquals("λ = the 10 s dead time (5 s delay grid)", 10.0, lambda, 5.0 + 1e-9);
        if (r.metrics.get("dead_time") != null && r.metrics.get("dead_time").available()) assertEquals(r.metrics.get("dead_time").value, lambda, 1e-9);
        double kc = ((Number) h.outputs.get("kc")).doubleValue();
        assertEquals(100.0 * 100 / (Math.abs(kc) * 100), ((Number) h.outputs.get("p_band_pct")).doubleValue(), 1e-9);
    }

    @Test
    public void approvedOnlyWaitsForAnApprovedLambda() {
        ResponseJobConfig c = cfg();
        c.lambdaRule = "APPROVED_ONLY";
        G12Result.Subgate h = secondResult(ProcessModel.fopdt("OP_TO_PV", 3.0, 10.0, 20.0), c, TUNING).subgates.get("H");
        assertEquals("WAITING", h.state);
        assertEquals("LAMBDA_NOT_APPROVED", h.outputs.get("reason"));
    }

    @Test
    public void anApprovedLambdaWinsOverTheRule() {
        ResponseJobConfig c = cfg();
        c.lambdaS = 40;
        G12Result.Subgate h = secondResult(ProcessModel.fopdt("OP_TO_PV", 3.0, 10.0, 20.0), c, TUNING).subgates.get("H");
        assertEquals("APPROVED", h.outputs.get("lambda_source"));
        assertEquals(40.0, ((Number) h.outputs.get("lambda_s")).doubleValue(), 0);
    }

    @Test
    public void lambdaRuleAndScanAreJobArgumentsInTheSettingsIdentity() {
        ResponseJobConfig c = ResponseJobConfig.fromArgs(new String[] {"--g12-lambda-rule", "approved_only", "--g12-controller-scan-s", "0.5"});
        assertEquals("APPROVED_ONLY", c.lambdaRule);
        assertEquals(0.5, c.controllerScanS, 0);
        assertEquals("DEAD_TIME", new ResponseJobConfig().lambdaRule);
        assertEquals("an unknown rule keeps the default", "DEAD_TIME", ResponseJobConfig.fromArgs(new String[] {"--g12-lambda-rule", "x"}).lambdaRule);
        assertFalse(c.bundleHash().equals(new ResponseJobConfig().bundleHash()));
        assertEquals(c.lambdaRule, c.copy().lambdaRule);
        assertEquals(c.controllerScanS, c.copy().controllerScanS, 0);
    }

    @Test
    public void theResultCarriesTheTuningRecord() throws Exception {
        G12Result g = new G12Result();
        com.ams.flink.cplm.response.controller.CentumTuning t = com.ams.flink.cplm.response.controller.CentumTuning.of(new double[] {1_789_600_000.0, 40, 30, 0}, cfg());
        CplmResponseAnalysisJob.withTuning(g, t, M);
        JsonNode n = M.readTree(g.toJson());
        assertEquals(t.ref, n.path("controller_snapshot_ref").asText());
        assertEquals(40.0, n.path("controller_snapshot").path("raw_p").asDouble(), 0);
        G12Result back = G12Result.fromJson(g.toJson());
        assertEquals(t.ref, back.controllerSnapshotRef);
        assertEquals(40.0, back.controllerSnapshot.path("raw_p").asDouble(), 0);

        G12Result unknown = new G12Result();
        CplmResponseAnalysisJob.withTuning(unknown, null, M);
        JsonNode u = M.readTree(unknown.toJson());
        assertTrue("no tuning: no record", u.path("controller_snapshot").isMissingNode());
        assertEquals("", u.path("controller_snapshot_ref").asText());
    }
}
