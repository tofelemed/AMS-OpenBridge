package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class IntegratingEstimatorTest {
    @Test
    public void recoversTheSlopeGainAndReportsNoStaticGain() {                  // NR-003, §2.11 LIC
        double ki = 0.010 / 60.0, v0 = 0.010 / 60.0;
        ProcessModel truth = ProcessModel.ipdt("OP_TO_PV", ki, 12.0);
        int n = 241;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = -60 + i;
            u[i] = t[i] < 0 ? 50 : 52;
        }
        ZohSimulator.Result sim = ZohSimulator.simulate(truth, t, u, 50, 1.0, v0, 0, 60);
        Random rnd = new Random(4);
        double[] y = new double[n], r = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            y[i] = sim.yHat[i] + 0.0005 * rnd.nextGaussian();
            r[i] = 1;
            v[i] = true;
        }
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = 1;
        s.thetaMaxS = 40;
        EstimationResult res = new IntegratingEstimator().estimate(new EventDataset(t, y, r, u, v, 0, 180), 50, ModelFamily.IPDT, s);
        assertEquals(EstimationResult.State.ESTIMATED, res.state);
        assertEquals(ki, res.best().model.gain, ki * 0.05);
        assertEquals(12.0, res.best().model.theta, 1.5);
        assertEquals(v0, res.best().v0, v0 * 0.1);
        Quantity kp = res.best().model.parameters().get("process_gain");
        assertFalse(kp.available());
        assertEquals("INTEGRATING_OR_NOT_IDENTIFIABLE", kp.reasonIfNull);
    }
}
