package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.estimation.ClosedLoopPemEstimator;
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

    /**
     * The closed loop is simulated on a 0.1 s clock; the historian reads it at spacing(k) seconds, its clock offsetS ahead of
     * the simulation's (the setpoint steps at offsetS + 100 s).
     */
    private static ResponseCapture.Closed capture(boolean jitter, long noiseSeed, double offsetS) {
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg());
        Random jit = new Random(7), noise = new Random(noiseSeed);
        double h = 0.1, kp = 2, theta = 10, tau = 30, kc = 0.4, ti = 40;
        int delay = (int) Math.round(theta / h);
        List<Double> uHist = new ArrayList<>();
        double x = 0, integral = 0, nextRead = 0, t = 0;
        double y = 50, u = 50;
        List<ResponseCapture.Closed> closed = new ArrayList<>();
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
                closed.addAll(cap.onSample(sample(offsetS + t, pv, sp, u), false));
                nextRead = t + (jitter ? 4 + 2 * jit.nextDouble() : 5);
            }
        }
        assertEquals(1, closed.size());
        return closed.get(0);
    }

    private static G12Result run(boolean jitter) {
        return new ResponseEvaluator(cfg()).evaluate(capture(jitter, 11, 0), ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0,
                "LIVE", "", 0).result;
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

    /**
     * CHG-210: the same loop's next servo step (the setpoint back at 50 and stepped to 60 again, 1000 s later, new noise) is
     * the holdout of a servo-step fit; the free run from the fit's y0 and the holdout's u0 tracks it, so the model check
     * does not reject the model for an offset.
     */
    @Test
    public void pemFitValidatesOnSimilarHoldout() {
        ResponseEvaluator ev = new ResponseEvaluator(cfg());
        ResponseEvaluator.Outcome first = ev.evaluate(capture(true, 11, 0), ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0,
                "LIVE", "", 0);
        assertNotNull(first.holdoutCandidate);
        ResponseEvaluator.Outcome second = ev.evaluate(capture(true, 12, 1000), ModelFamily.FOPDT, first.holdoutCandidate, first.holdoutU0,
                ControllerSnapshot.unknown(), 0, "LIVE", "", 0);
        G12Result r = second.result;
        assertEquals(ClosedLoopPemEstimator.METHOD_ID, r.subgates.get("D").outputs.get("method_id"));
        G12Result.Subgate e = r.subgates.get("E");
        assertEquals("EVALUATED", e.state);
        String what = "verdict " + e.outputs.get("verdict") + " " + e.outputs.get("reason") + ", validation_rmse " + r.metrics.get("validation_rmse").value
                + ", residual_bias " + r.metrics.get("residual_bias").value + ", fit_improvement " + r.metrics.get("fit_improvement").value;
        // reported, not asserted yet: the dead time each jittered event recovers against the true 10 s
        System.out.println("CHG-210 PEM jittered: dead time holdout event " + first.result.metrics.get("dead_time").value + " s, training event "
                + r.metrics.get("dead_time").value + " s (true 10 s); gain " + first.result.metrics.get("process_gain").value + " / "
                + r.metrics.get("process_gain").value + "; " + what);
        assertFalse(what, "REJECTED".equals(e.outputs.get("verdict")));
        assertTrue("an offset free run: " + what, Math.abs(r.metrics.get("residual_bias").value) < 0.02 * 10);
    }
}
