package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.metrics.Endpoints;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.Quantity;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-204 review fixes: the settle band's noise term is the loop's noise before the FIRST step of an event chain,
 * measured robustly once per event. Drift and an earlier step's transient are not noise, so a quiet undeclared loop
 * keeps today's bands (a superseded event's window holds the first step's transient) and a drifting pre-step PV is
 * still not a stable baseline.
 */
public class ResponseNoiseBandTest {

    /** The settings of ResponseCaptureEvaluatorTest (an undeclared loop: no PV range). */
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

    /** Today's behaviour: no noise term in the settle and baseline bands. */
    private static ResponseJobConfig withoutNoiseTerm() {
        ResponseJobConfig c = cfg();
        c.settleNoiseMultiplier = 0;
        return c;
    }

    private static CplmNormalizedSample sample(double tS, double pv, double sp, double op) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = "FIC10302";
        x.loopType = "FIC";
        x.eventTsMs = (long) (tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = op;
        x.mode = "AUT";
        x.quality = "GOOD";
        return x;
    }

    private static G12Result evaluate(ResponseJobConfig cfg, ResponseCapture.Closed c) {
        return new ResponseEvaluator(cfg).evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result;
    }

    /** NR-007: OP 40 -> 45 at 100 s and 45 -> 50 at 130 s, before the first response settles; no noise. */
    private static List<ResponseCapture.Closed> secondStepBeforeTheFirstSettles(ResponseJobConfig cfg) {
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 0; t <= 700; t += 5) {
            double u = t < 100 ? 40 : t < 130 ? 45 : 50;
            double pv = 100 + (t < 104 ? 0 : 15 * (1 - Math.exp(-(t - 104) / 20))) + (t < 134 ? 0 : 15 * (1 - Math.exp(-(t - 134) / 20)));
            closed.addAll(cap.onSample(sample(t, pv, 100, u), false));
        }
        return closed;
    }

    @Test
    public void supersededEventKeepsQuietLoopBand() {
        List<ResponseCapture.Closed> today = secondStepBeforeTheFirstSettles(withoutNoiseTerm());
        List<ResponseCapture.Closed> now = secondStepBeforeTheFirstSettles(cfg());
        assertEquals(2, today.size());
        assertEquals(2, now.size());
        assertEquals("SUPERSEDED_BY_EVENT", now.get(0).event.censorReason);
        ResponseCapture.Closed second = now.get(1), secondToday = today.get(1);
        assertEquals("COMPLETE", second.event.captureState);
        // the second event's pre-step window holds the first step's transient: that is not the loop's noise
        assertEquals("closes when it did without the noise term", secondToday.event.tEndMs, second.event.tEndMs, 1e-6);
        G12Result r = evaluate(cfg(), second), rToday = evaluate(withoutNoiseTerm(), secondToday);
        Quantity settle = r.metrics.get("settle_response"), settleToday = rToday.metrics.get("settle_response");
        assertEquals("settle_response as without the noise term", settleToday.value, settle.value);
        assertEquals(settleToday.reasonIfNull, settle.reasonIfNull);
        assertEquals("baseline as without the noise term", rToday.metrics.get("baseline_pv").available(), r.metrics.get("baseline_pv").available());
    }

    @Test
    public void supersedingEventInheritsTheFirstStepsNoise() {
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        Random rnd = new Random(11);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 0; t <= 200; t += 5) {
            double u = t < 100 ? 40 : t < 130 ? 45 : 50;
            double pv = 100 + (t < 104 ? 0 : 15 * (1 - Math.exp(-(t - 104) / 20))) + (t < 134 ? 0 : 15 * (1 - Math.exp(-(t - 134) / 20)))
                    + 0.2 * rnd.nextGaussian();
            closed.addAll(cap.onSample(sample(t, pv, 100, u), false));
        }
        ResponseCapture.Closed first = closed.get(0);
        assertEquals("SUPERSEDED_BY_EVENT", first.event.censorReason);
        double sigma = first.event.preNoiseSigmaEu;
        assertTrue("measured at detection", Double.isFinite(sigma) && sigma > 0);
        assertEquals("over the valid PV of the pre-support window", sigma,
                ResponseScale.preStepNoiseSigma(first.data.t, first.data.y, first.data.valid, first.data.t0, cfg.preSupportS), 0);
        com.ams.flink.cplm.response.event.ResponseEvent second = cap.machine().open();
        assertEquals(130_000.0, second.t0Ms, 1e-6);
        assertEquals("the superseding event carries the first step's noise", sigma, second.preNoiseSigmaEu, 0);
        double ownWindow = ResponseScale.preStepNoiseSigma(first.data.t, first.data.y, first.data.valid, second.t0Ms / 1000.0, cfg.preSupportS);
        assertNotEquals("not its own window, which holds the first step's transient", ownWindow, second.preNoiseSigmaEu, 0);
    }

    @Test
    public void driftingPreStepGivesNoValidBaseline() {
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 0; t <= 500; t += 5) {
            double u = t < 100 ? 40 : 45;
            // the PV drifts 2 EU over the 60 s pre-step window (no noise), then answers the OP step and holds
            double pv = t < 100 ? 100 + (t - 100) / 30.0 : t < 104 ? 100 : 100 + 15 * (1 - Math.exp(-(t - 104) / 20));
            closed.addAll(cap.onSample(sample(t, pv, 100, u), false));
        }
        assertEquals(1, closed.size());
        assertEquals("COMPLETE", closed.get(0).event.captureState);
        Quantity baseline = evaluate(cfg, closed.get(0)).metrics.get("baseline_pv");
        assertFalse("a drifting pre-step PV is not a stable baseline", baseline.available());
        assertEquals(Endpoints.NO_VALID_BASELINE, baseline.reasonIfNull);
    }
}
