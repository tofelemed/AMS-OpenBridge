package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.OutputErrorEstimatorTest;
import com.ams.flink.cplm.response.estimation.ResponseFitFixtures;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
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
        HoldoutStart start = HoldoutStart.of(holdout, ModelFamily.FOPDT, 60, 50, 0);
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
        ModelValidator.Report down = ModelValidator.validate(truth, HoldoutStart.of(lower, ModelFamily.FOPDT, 60, 80, 0), lower, 40, 0.2, 60);
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
            HoldoutStart start = HoldoutStart.of(h, ModelFamily.FOPDT, 60, 99.7, v0);
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

    private static String what(ModelValidator.Report r, HoldoutStart s) {
        return what(r) + "; start " + s.provenance() + " y0 " + s.y0 + " v0 " + s.v0;
    }

    /**
     * CHG-211 fix round 1 (F1): a level loop's previous event (the holdout) was off balance before its step - drift 0.005 EU/s at the
     * pre-step OP - and ran 30 EU above the training level. For an integrating model the drift is part of the initial state: the
     * replay starts on the holdout's own pre-step line (y0 its level AT t0, v0 its slope), not flat from the mid-window median.
     */
    @Test
    public void integratingHoldoutWithPreStepDriftStartsOnItsOwnLine() {
        ProcessModel truth = ProcessModel.ipdt("OP_TO_PV", 0.02, 10.0);
        double drift = 0.005;
        double[] t = ResponseFitFixtures.times(0, 400, 1000, 0, 25);
        // 120 pre-step samples at 1 s; the PV is 100 at t0 on the line 100 + drift (t - t0), the ramp 0.1 EU/s from t0 + 10 s
        EventDataset at100 = ResponseFitFixtures.stepEvent("IPDT", new double[] {0.02, 10.0, drift}, t, 120, 0.05, 25);
        EventDataset holdout = shifted(at100, 30);
        HoldoutStart start = HoldoutStart.of(holdout, ModelFamily.IPDT, 120, 100, 0);       // fallback: the training level 100
        ModelValidator.Report r = ModelValidator.validate(truth, start, holdout, ResponseFitFixtures.U_BEFORE, 0.2, 60);
        assertEquals(what(r, start), "VALIDATED", r.verdict);
        assertTrue(what(r, start), Math.abs(r.residualBias.value) < 0.1);
        assertEquals(what(r, start), HoldoutStart.HOLDOUT_PRE_STEP_LINE, start.provenance());
        assertEquals(what(r, start), drift, start.v0, 0.1 * drift);
        assertEquals("the true level at t0 is 130: " + what(r, start), 130, start.y0, 0.1);
        assertEquals("final review M4: on the line the baseline is the line", ModelValidator.TREND_BASELINE, r.fitImprovement.method);
        assertEquals(ModelValidator.TREND_BASELINE, r.baseline);

        // the self-regulating rule on the same holdout (c6c0db48's start for every family): flat from the mid-window median
        HoldoutStart flat = HoldoutStart.of(holdout, ModelFamily.FOPDT, 120, 100, 0);
        ModelValidator.Report fromFlat = ModelValidator.validate(truth, flat, holdout, ResponseFitFixtures.U_BEFORE, 0.2, 60);
        assertTrue(what(fromFlat, flat), Math.abs(fromFlat.residualBias.value) > 0.3);
    }

    /**
     * Final review M4 (CHG-211): a level drifting 0.1 EU/s before its step, with a small integrating response (0.0004 EU/s per EU of
     * input, 10 s dead time). On the holdout's pre-step line the do-nothing reference is that line: a model that only carries the
     * drift on (zero gain) improves nothing on it and is not validated. The true model still is.
     */
    @Test
    public void driftingLevelHoldoutIsJudgedAgainstItsTrend() {
        double[] t = ResponseFitFixtures.times(0, 400, 1000, 0, 25);
        EventDataset holdout = ResponseFitFixtures.stepEvent("IPDT", new double[] {0.0004, 10.0, 0.1}, t, 120, 0.05, 25);
        HoldoutStart start = HoldoutStart.of(holdout, ModelFamily.IPDT, 120, 100, 0);
        assertEquals(HoldoutStart.HOLDOUT_PRE_STEP_LINE, start.provenance());
        ModelValidator.Report driftOnly = ModelValidator.validate(ProcessModel.ipdt("OP_TO_PV", 0, 10.0), start, holdout, ResponseFitFixtures.U_BEFORE, 0.2, 60);
        assertNotEquals(what(driftOnly, start), "VALIDATED", driftOnly.verdict);
        assertTrue(what(driftOnly, start), driftOnly.fitImprovement.value <= 1e-12);
        ModelValidator.Report truth = ModelValidator.validate(ProcessModel.ipdt("OP_TO_PV", 0.0004, 10.0), start, holdout, ResponseFitFixtures.U_BEFORE, 0.2, 60);
        assertEquals(what(truth, start), "VALIDATED", truth.verdict);
        assertEquals(ModelValidator.TREND_BASELINE, truth.baseline);
        assertEquals(ModelValidator.TREND_BASELINE, truth.fitImprovement.method);

        // every other start keeps the constant y0: the level start, and a caller-chosen start even with a drift
        HoldoutStart level = HoldoutStart.of(holdout, ModelFamily.FOPDT, 120, 100, 0);
        ProcessModel zeroGain = ProcessModel.ipdt("OP_TO_PV", 0, 10.0);
        assertEquals(ModelValidator.BASELINE, ModelValidator.validate(zeroGain, level, holdout, ResponseFitFixtures.U_BEFORE, 0.2, 60).baseline);
        ModelValidator.Report chosen = ModelValidator.validate(zeroGain, start.y0, start.v0, holdout, ResponseFitFixtures.U_BEFORE, 0.2, 60);
        assertEquals(ModelValidator.BASELINE, chosen.baseline);
        assertTrue("against the constant y0 the drift alone looks like a model: " + what(chosen), chosen.fitImprovement.value > 0.5);
    }

    /** F3: the verdicts after CHG-211's fix round carry a new method tag, so they can be told from the ones before. */
    @Test
    public void methodIsHoldoutFreeRunV2() {
        assertEquals("HOLDOUT_FREE_RUN_V2", ModelValidator.METHOD);
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        ModelValidator.Report r = ModelValidator.validate(truth, 100, 0, OutputErrorEstimatorTest.synthetic(truth, 0.2, 21, 5, 200, 5), 40, 0.2, 60);
        assertEquals("HOLDOUT_FREE_RUN_V2", r.validationRmse.method);
        assertEquals("HOLDOUT_FREE_RUN_V2", r.residualBias.method);
        assertEquals("CONSTANT_BASELINE_Y0", r.fitImprovement.method);
    }
}
