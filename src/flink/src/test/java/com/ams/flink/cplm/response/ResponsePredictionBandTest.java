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

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-209: the evaluator writes the model check's 95 % prediction band next to y_predict - only when the check ran (a prior
 * holdout exists), on the holdout's own times, in the evidence writer's prediction_interval shape (upper as y, lower as a
 * column, the band's meaning) with the share of the holdout inside it.
 */
public class ResponsePredictionBandTest {

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

    private static EvidenceArtifact kind(ResponseEvaluator.Outcome o, String kind) {
        return o.artifacts.stream().filter(a -> a.kind.equals(kind)).findFirst().orElse(null);
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
    }
}
