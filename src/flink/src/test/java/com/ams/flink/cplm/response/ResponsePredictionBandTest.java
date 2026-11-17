package com.ams.flink.cplm.response;

import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.estimation.ClosedLoopPemEstimator;
import com.ams.flink.cplm.response.estimation.ResponseFitFixtures;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.Random;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-209: the evaluator writes the model check's 95 % prediction band next to y_predict - only when the check ran (a prior
 * holdout exists), on the holdout's own times, in the evidence writer's prediction_interval shape (upper as y, lower as a
 * column, the band's meaning) with the share of the holdout inside it. Fix round 1: the delay profile's half-width enters the
 * band, the noise term is the training fit's FREE-RUN residual sigma (not a PEM fit's one-step innovation), and a band that
 * fails or overruns its budget never takes y_predict with it.
 */
public class ResponsePredictionBandTest {
    /** Whole epoch seconds: a 1 s grid stays exactly even, so the closed-loop method fits the samples as they are. */
    private static final double EPOCH_S = 1_791_191_779.0;

    private static ResponseJobConfig cfg() {
        ResponseJobConfig c = new ResponseJobConfig();
        c.delayGridS = 5;
        c.thetaMaxS = 30;
        c.tauMaxS = 300;
        c.fitBudgetMs = 60_000;
        return c;
    }

    /** An exogenous input test on FOPDT(K 3, dead time 4 s, tau 20 s): 400 s at 1 s, the step 60 s in, noise 0.05. */
    private static ResponseCapture.Closed inputTest(long baseMs, long seed) {
        double[] t = ResponseFitFixtures.times(baseMs, 400, 1000, 0, seed);
        EventDataset d = ResponseFitFixtures.stepEvent("FOPDT", new double[] {3, 4, 20}, t, 60, 0.05, seed);
        ResponseEvent e = new ResponseEvent(ResponseEvent.idFor("FIC10302", Math.round(d.t0 * 1000), EventType.INPUT_TEST, "b"), "FIC10302",
                EventType.INPUT_TEST, "OP_TO_PV", d.t0 * 1000, ResponseFitFixtures.U_BEFORE, ResponseFitFixtures.U_BEFORE + ResponseFitFixtures.DU,
                Collections.singletonList(new double[] {d.t0 * 1000, ResponseFitFixtures.U_BEFORE + ResponseFitFixtures.DU}));
        e.tEndMs = d.tEnd * 1000;
        e.captureState = "COMPLETE";
        return new ResponseCapture.Closed(e, d, ResponseFitFixtures.U_BEFORE, 100, 100, ResponseFitFixtures.DU, "OP_COMMAND", true);
    }

    /**
     * A servo step 50 -> 60 at 120 s under a PI controller (Kc 0.4, Ti 40 s), 600 s at 1 s: FOPDT plant K 2, dead time 4 s, tau 30 s,
     * a white load disturbance at the plant input (sd 3) and measurement noise 0.02. The one-step innovation sees only the newest
     * disturbance; the free run carries its accumulated effect - the closed-loop method's objective is far below the free-run SSE.
     */
    private static ResponseCapture.Closed servoStep(double baseS, long seed) {
        int n = 600, delay = 4, stepAt = 120;
        double kp = 2, tau = 30, kc = 0.4, ti = 40, a = Math.exp(-1 / tau), b = kp * (1 - a);
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n], w = new double[n];
        boolean[] v = new boolean[n];
        Random rnd = new Random(seed);
        double x = 0, integral = 0;
        for (int k = 0; k < n; k++) {
            t[k] = baseS + k;
            r[k] = k < stepAt ? 50 : 60;
            y[k] = 50 + x + 0.02 * rnd.nextGaussian();
            double err = r[k] - y[k];
            integral += err / ti;
            u[k] = 50 + kc * (err + integral);
            w[k] = u[k] - 50 + 3 * rnd.nextGaussian();                  // what reaches the plant: the OP plus the load disturbance
            x = a * x + b * (k >= delay ? w[k - delay] : 0);
            v[k] = true;
        }
        EventDataset d = new EventDataset(t, y, r, u, v, t[stepAt], t[n - 1]);
        ResponseEvent e = new ResponseEvent(ResponseEvent.idFor("FIC10302", Math.round(d.t0 * 1000), EventType.SERVO_STEP, "b"), "FIC10302",
                EventType.SERVO_STEP, "OP_TO_PV", d.t0 * 1000, 50, 60, Collections.singletonList(new double[] {d.t0 * 1000, 60}));
        e.tEndMs = d.tEnd * 1000;
        e.captureState = "COMPLETE";
        return new ResponseCapture.Closed(e, d, u[stepAt - 1], 50, 60, null, "OP_COMMAND", true);
    }

    private static EvidenceArtifact kind(ResponseEvaluator.Outcome o, String kind) {
        return o.artifacts.stream().filter(a -> a.kind.equals(kind)).findFirst().orElse(null);
    }

    private static double number(EvidenceArtifact a, String key) {
        assertTrue(a.kind + " provenance " + key, a.provenance.containsKey(key));
        return ((Number) a.provenance.get(key)).doubleValue();
    }

    @Test
    public void artifactEmittedWithYPredict() {
        ResponseEvaluator ev = new ResponseEvaluator(cfg());
        ResponseEvaluator.Outcome first = ev.evaluate(inputTest(ResponseFitFixtures.EPOCH_MS, 1), ModelFamily.FOPDT, null, 0,
                ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        assertEquals("CANDIDATE", first.result.modelState);
        assertFalse("no holdout yet: no prediction", first.artifacts.stream().anyMatch(a -> a.kind.equals("y_predict")));
        assertFalse("no holdout yet: no band", first.artifacts.stream().anyMatch(a -> a.kind.equals("prediction_interval")));
        assertNotNull(first.holdoutCandidate);

        ResponseEvaluator.Outcome second = ev.evaluate(inputTest(ResponseFitFixtures.EPOCH_MS + 1_000_000, 2), ModelFamily.FOPDT,
                first.holdoutCandidate, first.holdoutU0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        assertEquals("EVALUATED", second.result.subgates.get("E").state);
        EvidenceArtifact predict = kind(second, "y_predict");
        EvidenceArtifact band = kind(second, "prediction_interval");
        assertNotNull(predict);
        assertNotNull("the model check writes its band", band);
        assertEquals(second.result.methodRunId, band.methodRunId);
        assertEquals("G12", band.gate);
        assertEquals("OP_TO_PV", band.roleOrPath);
        assertEquals("pv_prediction_upper", band.yQuantity);
        assertEquals("PV_EU", band.yUnit);
        assertEquals("s", band.xUnit);
        assertTrue(band.columns.containsKey("lower"));
        assertEquals("PV_EU", band.columnUnits.get("lower"));
        assertEquals(predict.y.length, band.y.length);
        assertEquals(predict.y.length, band.columns.get("lower").length);
        assertArrayEquals("on the holdout's own times, as y_predict", predict.x, band.x, 0);
        assertArrayEquals(first.holdoutCandidate.t, band.x, 0);
        assertEquals("PREDICTION_INTERVAL_OF_OUTPUT_NOT_PARAMETER_CONFIDENCE", band.provenance.get("band_meaning"));
        assertTrue(band.provenance.containsKey("coverage"));
        double coverage = ((Number) band.provenance.get("coverage")).doubleValue();
        assertTrue("coverage " + coverage, coverage >= 0.9 && coverage <= 1.0);
        double[] lower = band.columns.get("lower");
        for (int i = 0; i < band.x.length; i++) {
            if (!predict.mask[i] || !Double.isFinite(predict.y[i])) continue;
            assertTrue("finite at " + i, Double.isFinite(lower[i]) && Double.isFinite(band.y[i]));
            assertTrue("lower <= predict <= upper at " + i, lower[i] <= predict.y[i] && predict.y[i] <= band.y[i]);
        }
        // F1: the output-error fit profiles the delay (no dead_time standard error), so its half-width enters the band
        assertTrue(Arrays.asList(((String) band.provenance.get("parameters")).split(";")).contains("dead_time"));
        double halfWidth = number(band, "dead_time_half_width_s");
        assertTrue("half-width " + halfWidth, halfWidth > 0);
        assertEquals("the candidate's thetaUncertaintyS", number(kind(second, "parameter_intervals"), "theta_uncertainty_s"), halfWidth, 0);
    }

    /** F2: a closed-loop (PEM) fit's objective is the one-step innovation SSE; the free-run band takes its noise from the free run. */
    @Test
    public void noiseTermFromFreeRunResiduals() {
        ResponseEvaluator ev = new ResponseEvaluator(cfg());
        ResponseEvaluator.Outcome first = ev.evaluate(servoStep(EPOCH_S, 3), ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        assertNotNull(first.holdoutCandidate);
        ResponseEvaluator.Outcome second = ev.evaluate(servoStep(EPOCH_S + 1000, 4), ModelFamily.FOPDT, first.holdoutCandidate, first.holdoutU0,
                ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        G12Result.Subgate d = second.result.subgates.get("D");
        assertEquals(ClosedLoopPemEstimator.METHOD_ID, d.outputs.get("method_id"));
        assertFalse("an even grid is fitted as is", d.outputs.containsKey("resampled_grid_s"));
        EvidenceArtifact band = kind(second, "prediction_interval");
        assertNotNull("the model check ran and wrote its band", band);

        // the free-run formula, rebuilt from the evidence: the training samples against y_fit where both are valid
        EvidenceArtifact data = kind(second, "accepted_samples"), fit = kind(second, "y_fit");
        int parameters = kind(second, "parameter_intervals").y.length;      // the candidate's stdErr entries
        double sse = 0;
        int valid = 0;
        for (int i = 0; i < data.y.length; i++) {
            if (!data.mask[i] || !fit.mask[i]) continue;
            double res = data.y[i] - fit.y[i];
            sse += res * res;
            valid++;
        }
        assertTrue(valid > 500);
        double freeRun = Math.sqrt(sse / Math.max(1, valid - parameters));
        double sigma = number(band, "residual_sigma");
        assertEquals(freeRun, sigma, 1e-12 * freeRun);

        // not the objective formula: the PEM objective (one-step innovations) is far smaller
        double objective = kind(second, "candidate_models").y[0];
        double objectiveSigma = Math.sqrt(objective / Math.max(1, data.y.length - parameters));
        assertTrue("free-run sigma " + sigma + " vs the innovation sigma " + objectiveSigma, sigma > 2 * objectiveSigma);
    }

    /** F3: the band runs under its own deadline after y_predict; when it fails, y_predict is still written and no band is. */
    @Test
    public void bandFailureKeepsYPredict() {
        ResponseEvaluator normal = new ResponseEvaluator(cfg());
        ResponseEvaluator failing = new ResponseEvaluator(cfg());
        failing.bandBudgetMs = -1;                                  // the band's deadline has passed before its first simulation
        ResponseEvaluator.Outcome first = normal.evaluate(inputTest(ResponseFitFixtures.EPOCH_MS, 1), ModelFamily.FOPDT, null, 0,
                ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        ResponseCapture.Closed event = inputTest(ResponseFitFixtures.EPOCH_MS + 1_000_000, 2);
        ResponseEvaluator.Outcome ok = normal.evaluate(event, ModelFamily.FOPDT, first.holdoutCandidate, first.holdoutU0,
                ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        ResponseEvaluator.Outcome broken = failing.evaluate(event, ModelFamily.FOPDT, first.holdoutCandidate, first.holdoutU0,
                ControllerSnapshot.unknown(), 0, "LIVE", "", 0);

        assertNotNull(kind(ok, "prediction_interval"));
        assertNull("no band artifact after a failed band", kind(broken, "prediction_interval"));
        EvidenceArtifact kept = kind(broken, "y_predict"), reference = kind(ok, "y_predict");
        assertNotNull("y_predict is still written", kept);
        assertArrayEquals(reference.x, kept.x, 0);
        assertArrayEquals("y_predict does not depend on the band", reference.y, kept.y, 0);
        assertArrayEquals(reference.mask, kept.mask);
        assertEquals("NOT_COMPUTED:BUDGET_EXCEEDED", kept.provenance.get("prediction_band"));
        assertFalse(reference.provenance.containsKey("prediction_band"));
        assertEquals(ok.result.modelState, broken.result.modelState);
        assertEquals(ok.artifacts.size() - 1, broken.artifacts.size());
    }
}
