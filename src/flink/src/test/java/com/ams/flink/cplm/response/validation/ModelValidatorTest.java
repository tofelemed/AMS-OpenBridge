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
}
