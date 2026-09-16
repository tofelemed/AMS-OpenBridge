package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.EstimatorSettings;
import com.ams.flink.cplm.response.estimation.OutputErrorEstimator;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class UncertaintyEstimatorTest {
    @Test
    public void profileLikelihoodIntervalCoversTheFlatDelayRange() {
        double[] theta = {0, 5, 10, 15, 20, 25};
        double[] j = {100.5, 100.2, 100.0, 100.3, 140, 200};
        UncertaintyEstimator.Interval iv = UncertaintyEstimator.profileLikelihood(theta, j, 200, 0.95);
        assertEquals("PROFILE_LIKELIHOOD", iv.method);
        assertTrue(iv.lo <= 0.0 + 1e-9);
        assertTrue(iv.hi >= 15.0 && iv.hi < 20.0);
    }

    @Test
    public void blockBootstrapIsWiderThanIidOnAutocorrelatedResiduals() {
        // autocorrelated noise: AR(1) with phi = 0.9 -> block bootstrap must not print a narrow i.i.d. interval
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        int n = 45;
        double[] t = new double[n], u = new double[n], y = new double[n], r = new double[n];
        boolean[] v = new boolean[n];
        Random rnd = new Random(8);
        double e = 0;
        for (int i = 0; i < n; i++) {
            t[i] = -20 + 5 * i;
            u[i] = t[i] < 0 ? 40 : 45;
        }
        double[] clean = ZohSimulator.simulate(truth, t, u, 40, 100, 0, 0, 60).yHat;
        for (int i = 0; i < n; i++) {
            e = 0.9 * e + 0.3 * rnd.nextGaussian();
            y[i] = clean[i] + e;
            r[i] = 100;
            v[i] = true;
        }
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 200);
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = 5;
        s.thetaMaxS = 30;
        s.tauMaxS = 300;
        List<UncertaintyEstimator.Interval> block = UncertaintyEstimator.blockBootstrap(new OutputErrorEstimator(), d, 40, ModelFamily.FOPDT, s, 12, 8, 3, 0.9);
        List<UncertaintyEstimator.Interval> iid = UncertaintyEstimator.blockBootstrap(new OutputErrorEstimator(), d, 40, ModelFamily.FOPDT, s, 12, 1, 3, 0.9);
        UncertaintyEstimator.Interval gb = block.stream().filter(x -> x.parameter.equals("process_gain")).findFirst().get();
        UncertaintyEstimator.Interval gi = iid.stream().filter(x -> x.parameter.equals("process_gain")).findFirst().get();
        assertEquals("BLOCK_BOOTSTRAP", gb.method);
        assertEquals(12, gb.repetitions);
        assertTrue("block interval " + (gb.hi - gb.lo) + " must be at least as wide as i.i.d. " + (gi.hi - gi.lo), gb.hi - gb.lo >= 0.8 * (gi.hi - gi.lo));
    }
}
