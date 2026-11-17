package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.OutputErrorEstimatorTest;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

public class ModelValidatorTest {
    @Test
    public void holdoutByEventReportsFreeRunAndPredictionSeparately() {           // NR-011
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EventDataset holdout = OutputErrorEstimatorTest.synthetic(truth, 0.2, 21, 5, 200, 5);
        ModelValidator.Report r = ModelValidator.validate(truth, 100, 0, holdout, 40, 0.2, 60);
        assertEquals("VALIDATED", r.verdict);
        assertTrue(r.validationRmse.value < 0.35);
        assertTrue(r.predictionRmse.value < 0.35);
        assertTrue(r.fitImprovement.value > 0.9);
        assertEquals("PV_EU", r.validationRmse.unit);
        assertEquals("POSITIVE_LAGS_RESIDUAL_VS_PAST_INPUT", r.lagConvention);
        assertTrue(Math.abs(r.residualBias.value) < 0.1);
    }

    @Test
    public void aWrongPlantFailsFreeRunEvenIfItPredictsOneStepAhead() {
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        ProcessModel wrong = ProcessModel.fopdt("OP_TO_PV", 1.0, 4.0, 60.0);
        EventDataset holdout = OutputErrorEstimatorTest.synthetic(truth, 0.2, 22, 5, 200, 5);
        ModelValidator.Report r = ModelValidator.validate(wrong, 100, 0, holdout, 40, 0.2, 60);
        assertNotEquals("VALIDATED", r.verdict);
        assertTrue("free-run error must expose the wrong plant", r.validationRmse.value > 3.0);
        assertTrue("one-step prediction is flattering by construction", r.predictionRmse.value < r.validationRmse.value);
        assertFalse(r.whitenessPassed);
    }

    /** The same holdout with every PV moved by offset: the loop ran at another operating level. */
    private static EventDataset shifted(EventDataset d, double offset) {
        double[] y = new double[d.size()];
        for (int i = 0; i < y.length; i++) y[i] = d.y[i] + offset;
        return new EventDataset(d.t, y, d.r, d.u, d.valid, d.t0, d.tEnd);
    }

    private static String what(ModelValidator.Report r) {
        return "verdict " + r.verdict + " " + r.reason + ", residual_bias " + r.residualBias.value + ", fit_improvement "
                + r.fitImprovement.value + ", validation_rmse " + r.validationRmse.value;
    }

    /**
     * CHG-211: the current event was fitted around PV 50; the loop's previous event (the holdout) ran the same model around PV 80.
     * The replay starts from the holdout's own pre-step level, so neither the model nor the flat baseline is offset by 30.
     */
    @Test
    public void holdoutAtDifferentLevelIsNotOffset() {
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EventDataset at100 = OutputErrorEstimatorTest.synthetic(truth, 0.05, 23, 1, 200, 5);   // 20 pre-step samples
        EventDataset holdout = shifted(at100, -20);
        HoldoutStart start = HoldoutStart.of(holdout, 60, 50, 0);
        ModelValidator.Report r = ModelValidator.validate(truth, start, holdout, 40, 0.2, 60);
        assertEquals(what(r), "VALIDATED", r.verdict);
        assertTrue(what(r), Math.abs(r.residualBias.value) < 0.1);
        assertTrue(what(r), r.fitImprovement.value > 0.9);
        assertTrue(start.fromHoldout);
        assertEquals(80, start.y0, 0.05);
        ModelValidator.Report fromTraining = ModelValidator.validate(truth, 50, 0, holdout, 40, 0.2, 60);     // the start before CHG-211
        assertEquals(what(fromTraining), "FREE_RUN_ERROR_ABOVE_NOISE", fromTraining.reason);

        // the other way round (fitted around 80, previous event around 50): from 80 the offset model lost to the offset baseline
        EventDataset lower = shifted(at100, -50);
        ModelValidator.Report down = ModelValidator.validate(truth, HoldoutStart.of(lower, 60, 80, 0), lower, 40, 0.2, 60);
        assertEquals(what(down), "VALIDATED", down.verdict);
        assertTrue(what(down), Math.abs(down.residualBias.value) < 0.1);
        ModelValidator.Report downFromTraining = ModelValidator.validate(truth, 80, 0, lower, 40, 0.2, 60);
        assertEquals(what(downFromTraining), "REJECTED", downFromTraining.verdict);
        assertEquals(what(downFromTraining), "NO_IMPROVEMENT_OVER_BASELINE", downFromTraining.reason);
    }

    /** CHG-211 fallback: no valid pre-step sample on the holdout - the training fit's level and drift, today's numbers exactly. */
    @Test
    public void holdoutWithoutPreStepUsesTrainingLevel() {
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EventDataset full = OutputErrorEstimatorTest.synthetic(truth, 0.05, 24, 1, 200, 5);
        boolean[] valid = full.valid.clone();
        for (int i = 0; i < valid.length; i++) if (full.t[i] < full.t0) valid[i] = false;       // the pre-step samples are lost
        EventDataset h = new EventDataset(full.t, full.y, full.r, full.u, valid, full.t0, full.tEnd);
        for (double v0 : new double[] {0, 0.002}) {
            HoldoutStart start = HoldoutStart.of(h, 60, 99.7, v0);
            assertFalse(start.fromHoldout);
            ModelValidator.Report today = ModelValidator.validate(truth, 99.7, v0, h, 40, 0.2, 60);
            ModelValidator.Report now = ModelValidator.validate(truth, start, h, 40, 0.2, 60);
            assertEquals(today.verdict, now.verdict);
            assertEquals(today.reason, now.reason);
            assertEquals(today.validationRmse.value, now.validationRmse.value, 0);
            assertEquals(today.predictionRmse.value, now.predictionRmse.value, 0);
            assertEquals(today.fitImprovement.value, now.fitImprovement.value, 0);
            assertEquals(today.residualBias.value, now.residualBias.value, 0);
            assertEquals(today.aicc, now.aicc, 0);
        }
    }
}
