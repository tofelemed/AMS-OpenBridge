package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.estimation.ClosedLoopIntegratingEstimator;
import com.ams.flink.cplm.response.estimation.EstimatorRegistry;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-216 (SME item 5b): a setpoint step on an integrating loop (a level) gets a model. Plant: IPDT Ki 0.02 PV/(%·s), dead
 * time 10 s, under PI (Kc 2.5, Ti 80 s, the SIMC tuning for it); the historian reads every 4-6 s. Before, the legality table
 * refused it (PEM_NOT_INSTALLED_FOR_INTEGRATING).
 */
public class ResponseIntegratingServoTest {
    private static ResponseJobConfig cfg() {
        ResponseJobConfig c = new ResponseJobConfig();
        c.preSupportS = 60;
        c.minCaptureS = 120;
        c.maxCaptureS = 1200;
        c.tailDwellS = 60;
        c.stableBandEu = 0.6;
        c.stepMinInputEu = 1.0;
        c.eventDwellS = 15;
        c.delayGridS = 5;
        c.thetaMaxS = 30;
        c.tauMaxS = 300;
        c.fitBudgetMs = 60_000;
        return c;
    }

    private static CplmNormalizedSample sample(double tS, double pv, double sp, double op) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "LIC20202";
        x.loopType = "LIC";
        x.eventTsMs = Math.round(tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = op;
        x.mode = "AUT";
        x.quality = "GOOD";
        return x;
    }

    /** The level loop on a 0.1 s clock, read every 4-6 s; the setpoint steps 50 -> 55 at offsetS + 100 s. */
    static ResponseCapture.Closed capture(long jitSeed, long noiseSeed, double offsetS) {
        ResponseCapture cap = new ResponseCapture("LIC20202", cfg());
        Random jit = new Random(jitSeed), noise = new Random(noiseSeed);
        double h = 0.1, ki = 0.02, theta = 10, kc = 2.5, ti = 80;
        int delay = (int) Math.round(theta / h);
        List<Double> uHist = new ArrayList<>();
        double y = 50, integral = 0, nextRead = 0, t = 0;
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (int k = 0; t <= 1100; k++) {
            t = k * h;
            double sp = t < 100 ? 50 : 55, e = sp - y;
            integral += e * h / ti;
            double u = 40 + kc * (e + integral);
            uHist.add(u);
            double ud = k - delay >= 0 ? uHist.get(k - delay) : 40;
            y += h * ki * (ud - 40);                                             // balanced at OP 40 %
            if (t >= nextRead - 1e-9) {
                closed.addAll(cap.onSample(sample(offsetS + t, y + 0.02 * noise.nextGaussian(), sp, u), false));
                nextRead = t + 4 + 2 * jit.nextDouble();
            }
        }
        return closed.isEmpty() ? null : closed.get(0);
    }

    @Test
    public void theLegalityTableSendsIntegratingSetpointStepsToTheRateMethod() {
        assertEquals("PEM_RATE_FOR_INTEGRATING", EstimatorRegistry.legality(InputPathResolver.Path.OP_TO_PV, EventType.SERVO_STEP, ModelFamily.IPDT));
        assertTrue(EstimatorRegistry.forPath(InputPathResolver.Path.OP_TO_PV, EventType.SERVO_STEP, ModelFamily.IPDT) instanceof ClosedLoopIntegratingEstimator);
        assertTrue(EstimatorRegistry.forPath(InputPathResolver.Path.OP_TO_PV, EventType.SERVO_STEP, ModelFamily.INTEGRATOR_LAG) instanceof ClosedLoopIntegratingEstimator);
    }

    @Test
    public void aLevelSetpointStepGetsAnIntegratingModel() {
        double ki = 0, theta = 0;
        int n = 0;
        for (long seed = 1; seed <= 4; seed++) {
            ResponseCapture.Closed c = capture(seed, 11, 0);
            assertNotNull("a servo step is captured (seed " + seed + ")", c);
            G12Result r = new ResponseEvaluator(cfg()).evaluate(c, ModelFamily.IPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result;
            G12Result.Subgate d = r.subgates.get("D");
            assertEquals("seed " + seed + ": " + d.outputs, "ESTIMATED", d.state);
            assertEquals(ClosedLoopIntegratingEstimator.METHOD_ID, d.outputs.get("method_id"));
            assertTrue(r.metrics.get("integrating_gain").available());
            ki += r.metrics.get("integrating_gain").value;
            theta += r.metrics.get("dead_time").value;
            n++;
        }
        assertEquals("mean integrating gain, true 0.02", 0.02, ki / n, 0.004);
        assertEquals("mean dead time, true 10 s", 10.0, theta / n, 4.0);
    }
}
