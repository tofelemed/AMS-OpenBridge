package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-205: a servo step on the historian's uneven grid (4-6 s) is identified by the closed-loop method on a resampled
 * copy; an already even grid is not resampled. Plant: FOPDT Kp 2, theta 10 s, tau 30 s under a PI controller.
 */
public class ResponseUniformGridTest {
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
        return c;
    }

    private static CplmNormalizedSample sample(double tS, double pv, double sp, double op) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC10302";
        x.loopType = "FIC";
        x.eventTsMs = Math.round(tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = op;
        x.mode = "AUT";
        x.quality = "GOOD";
        return x;
    }

    /** The closed loop is simulated on a 0.1 s clock; the historian reads it at spacing(k) seconds. */
    private static G12Result run(boolean jitter) {
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        Random jit = new Random(7), noise = new Random(11);
        double h = 0.1, kp = 2, theta = 10, tau = 30, kc = 0.4, ti = 40;
        int delay = (int) Math.round(theta / h);
        List<Double> uHist = new ArrayList<>();
        double x = 0, integral = 0, nextRead = 0, t = 0;
        double y = 50, u = 50;
        List<G12Result> results = new ArrayList<>();
        for (int k = 0; t <= 700; k++) {
            t = k * h;
            double sp = t < 100 ? 50 : 60;
            y = 50 + x;
            double e = sp - y;
            integral += e * h / ti;
            u = 50 + kc * (e + integral);
            uHist.add(u);
            double uDelayed = k - delay >= 0 ? uHist.get(k - delay) : 50;
            x += h * (-x + kp * (uDelayed - 50)) / tau;
            if (t >= nextRead - 1e-9) {
                double pv = y + 0.1 * noise.nextGaussian();
                for (ResponseCapture.Closed c : cap.onSample(sample(t, pv, sp, u), false)) {
                    results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
                }
                nextRead = t + (jitter ? 4 + 2 * jit.nextDouble() : 5);
            }
        }
        assertEquals(1, results.size());
        return results.get(0);
    }

    @Test
    public void jitteredServoStepIsEstimated() {
        G12Result r = run(true);
        G12Result.Subgate d = r.subgates.get("D");
        assertEquals("ESTIMATED", d.state);
        Object grid = d.outputs.get("resampled_grid_s");
        assertNotNull(grid);
        assertEquals(5.0, ((Number) grid).doubleValue(), 0.3);
        assertEquals(2.0, r.metrics.get("process_gain").value, 0.4);
    }

    @Test
    public void uniformServoStepIsNotResampled() {
        G12Result r = run(false);
        G12Result.Subgate d = r.subgates.get("D");
        assertFalse(d.outputs.containsKey("resampled_grid_s"));
        assertTrue(d.outputs.containsKey("method_id"));
    }
}
