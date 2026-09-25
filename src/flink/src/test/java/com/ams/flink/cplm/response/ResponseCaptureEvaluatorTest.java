package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.contract.RoleObservation;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2B.1: the capture + evaluate path end to end on synthetic tuples, without Flink.
 * A servo step under closed loop yields a COMPLETE event with a servo gain and no process gain
 * (closed-loop path -> PEM legality); an exogenous input test yields an FOPDT candidate that is
 * VALIDATED on the second, independent event (NR-004 shape, NR-011); a mode transfer during a
 * capture censors it (spec §2.4); a thermal event exceeding the capture guard is CENSORED
 * CAPTURE_MAX (NR-017). The evidence carries method_run_id and every required artifact kind.
 */
public class ResponseCaptureEvaluatorTest {
    private static final ProcessModel PLANT = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);

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

    private static CplmNormalizedSample sample(String loop, double tS, double pv, double sp, double op, boolean auto) {
        CplmNormalizedSample x = new CplmNormalizedSample();
        x.loopId = loop;
        x.loopType = "FIC";
        x.eventTsMs = (long) (tS * 1000);
        x.pv = pv;
        x.sp = sp;
        x.op = op;
        x.mode = auto ? "AUT" : "MAN";
        x.quality = "GOOD";
        return x;
    }

    /** A 1.1 tuple whose VP role carries its own hold flag and age (the codec's provenance for VP evidence). */
    private static CplmNormalizedSample withVp(CplmNormalizedSample x, double vp, boolean held, long ageMs) {
        x.vp = vp;
        RoleObservation o = new RoleObservation();
        o.role = "vp";
        o.value = vp;
        o.quality = "GOOD";
        o.held = held;
        o.ageMs = ageMs;
        o.sampleTsMs = x.eventTsMs - ageMs;
        o.verifiedTsMs = o.sampleTsMs;
        x.roles.put("vp", o);
        return x;
    }

    /** An exogenous input test: OP steps 40 -> 45 at t0 while SP stays put; PV follows the plant with small noise. */
    private static List<ResponseCapture.Closed> inputTest(ResponseCapture cap, double startS, double t0, double endS, long seed, List<G12Result> sink,
                                                          ResponseEvaluator ev, EventDataset[] holdout, double[] holdoutU0) {
        int n = (int) ((endS - startS) / 5) + 1;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = startS + 5 * i;
            u[i] = t[i] < t0 ? 40 : 45;
        }
        ZohSimulator.Result sim = ZohSimulator.simulate(PLANT, t, u, 40, 100, 0, t0, 60);
        Random rnd = new Random(seed);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double pv = sim.yHat[i] + 0.05 * rnd.nextGaussian();
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t[i], pv, 100, u[i], true), false)) {
                closed.add(c);
                ResponseEvaluator.Outcome o = ev.evaluate(c, ModelFamily.FOPDT, holdout[0], holdoutU0[0], ControllerSnapshot.unknown(), 1_789_600_000_000L, "LIVE", "", 0);
                sink.add(o.result);
                if (o.holdoutCandidate != null) {
                    holdout[0] = o.holdoutCandidate;
                    holdoutU0[0] = o.holdoutU0;
                }
            }
        }
        return closed;
    }

    @Test
    public void anExogenousInputTestIsCapturedEstimatedAndValidatedOnTheNextEvent() {
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        EventDataset[] holdout = {null};
        double[] holdoutU0 = {0};
        inputTest(cap, 0, 100, 500, 1, results, ev, holdout, holdoutU0);
        assertEquals("first capture closes once the tail is stable", 1, results.size());
        G12Result first = results.get(0);
        assertEquals("EVALUATED", first.evaluationState);
        assertEquals("INPUT_TEST", first.subgates.get("B").outputs.get("event_type"));
        assertEquals("COMPLETE", first.subgates.get("B").outputs.get("capture_state"));
        assertEquals("ELIGIBLE", first.eligibility);
        assertEquals("CANDIDATE", first.modelState);
        assertEquals(5.0, first.metrics.get("input_step").value, 1e-9);
        assertEquals(3.0, first.metrics.get("process_gain").value, 0.05);
        assertEquals("PV_EU/input_EU", first.metrics.get("process_gain").unit);
        assertEquals(20.0, first.metrics.get("time_constant").value, 1.0);
        assertFalse("no independent event yet", first.metrics.get("validation_rmse").available());
        assertEquals("WAITING", first.subgates.get("E").state);
        assertFalse(first.metrics.get("servo_gain").available());
        assertEquals("NO_REFERENCE_STEP_OR_ENDPOINT", first.metrics.get("servo_gain").reasonIfNull);
        assertFalse("unknown controller -> no margin", first.metrics.get("gain_margin").available());
        assertTrue(first.methodRunId.length() == 36);
        assertTrue(first.bundleHash.startsWith("g12:"));

        // a second, independent event later: the model estimated on it is validated against the FIRST event
        inputTest(cap, 600, 700, 1100, 2, results, ev, holdout, holdoutU0);
        assertEquals(2, results.size());
        G12Result second = results.get(1);
        assertEquals("EVALUATED", second.subgates.get("E").state);
        assertTrue(second.metrics.get("validation_rmse").available());
        assertTrue(second.metrics.get("prediction_rmse").available());
        assertEquals("VALIDATED", second.modelState);
        assertTrue(second.metrics.get("fit_improvement").value > 0.9);
    }

    @Test
    public void nr007ASecondInputStepDuringTheCaptureSupersedesTheFirstAndTheSecondCarriesBothChanges() {
        // lab finding (2026-09-17): the streaming capture never looked for a second step while one was open, so the
        // interrupted-step scenario read COMPLETE; the machine's supersede path was only ever driven by its own unit test
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 0; t <= 700; t += 5) {
            double u = t < 100 ? 40 : t < 130 ? 45 : 50;                          // 40 -> 45 at 100 s, 45 -> 50 at 130 s
            double pv = 100 + (t < 104 ? 0 : 15 * (1 - Math.exp(-(t - 104) / 20))) + (t < 134 ? 0 : 15 * (1 - Math.exp(-(t - 134) / 20)));
            closed.addAll(cap.onSample(sample("FIC10302", t, pv, 100, u, true), false));
        }
        assertEquals(2, closed.size());
        ResponseCapture.Closed first = closed.get(0), second = closed.get(1);
        assertEquals("CENSORED", first.event.captureState);
        assertEquals("SUPERSEDED_BY_EVENT", first.event.censorReason);
        assertEquals(100_000.0, first.event.t0Ms, 1e-6);
        assertEquals("COMPLETE", second.event.captureState);
        assertEquals(130_000.0, second.event.t0Ms, 1e-6);
        assertEquals("the second event carries the whole input sequence", 2, second.event.inputSequence.size());
        assertEquals(45.0, second.event.inputSequence.get(0)[1], 1e-9);
        assertEquals(50.0, second.event.inputSequence.get(1)[1], 1e-9);
    }

    @Test
    public void aReDeliveredOrLateSampleDuringACaptureIsIgnoredNeverFatal() {
        // lab finding (2026-09-25): an at-least-once re-delivery of a sample (same event time) entered the capture ring;
        // close() then built an EventDataset whose time did not strictly increase, the exception escaped processElement,
        // Flink restored the same ring from the checkpoint and threw again - the Response Engine crash-looped for ever
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 0; t <= 700; t += 5) {
            double u = t < 100 ? 40 : 45;
            double pv = 100 + (t < 104 ? 0 : 15 * (1 - Math.exp(-(t - 104) / 20)));
            closed.addAll(cap.onSample(sample("FIC10302", t, pv, 100, u, true), false));
            if (((int) t) % 50 == 0) closed.addAll(cap.onSample(sample("FIC10302", t, pv, 100, u, true), false));   // re-delivered
            if (t == 200) closed.addAll(cap.onSample(sample("FIC10302", t - 5, pv, 100, u, true), false));         // late
        }
        assertEquals(1, closed.size());
        ResponseCapture.Closed c = closed.get(0);
        assertEquals("COMPLETE", c.event.captureState);
        assertEquals(100_000.0, c.event.t0Ms, 1e-6);
        for (int i = 1; i < c.data.t.length; i++) assertTrue("time strictly increases", c.data.t[i] > c.data.t[i - 1]);
    }

    @Test
    public void aModeTransferDuringACaptureCensorsIt() {
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        for (double t = 0; t <= 400; t += 5) {
            double u = t < 100 ? 40 : 45;
            double pv = t < 104 ? 100 : 100 + 15 * (1 - Math.exp(-(t - 104) / 20));
            boolean auto = t < 160;                                              // MAN from t = 160
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t, pv, 100, u, auto), false)) {
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals(1, results.size());
        G12Result r = results.get(0);
        assertEquals("CENSORED", r.evaluationState);
        assertEquals("MODE_TRANSFER", r.finding);
        assertEquals("NOT_EVALUATED", r.subgates.get("D").state);
        assertFalse(r.metrics.get("process_gain").available());
    }

    @Test
    public void anEventLongerThanTheCaptureGuardIsCensoredNotTruncated() {           // NR-017
        ResponseJobConfig cfg = cfg();
        cfg.maxCaptureS = 300;
        ResponseCapture cap = new ResponseCapture("TIC10101", cfg);
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        for (double t = 0; t <= 900; t += 5) {
            double u = t < 100 ? 40 : 45;
            double pv = t < 104 ? 100 : 100 + 15 * (1 - Math.exp(-(t - 104) / 600));   // a slow thermal path never settles in time
            for (ResponseCapture.Closed c : cap.onSample(sample("TIC10101", t, pv, 100, u, true), false)) {
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals(1, results.size());
        assertEquals("CENSORED", results.get(0).evaluationState);
        assertEquals("CAPTURE_MAX", results.get(0).finding);
    }

    @Test
    public void aServoStepUnderClosedLoopGivesServoGainNotProcessGain() {          // NR-004 shape
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        for (double t = 0; t <= 500; t += 5) {
            double sp = t < 100 ? 100 : 110;
            double pv = t < 104 ? 100 : 100 + 10 * (1 - Math.exp(-(t - 104) / 25));
            double op = t < 100 ? 40 : 40 + 3.3 * (1 - Math.exp(-(t - 100) / 25));
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t, pv, sp, op, true), false)) {
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals(1, results.size());
        G12Result r = results.get(0);
        assertEquals("SERVO_STEP", r.subgates.get("B").outputs.get("event_type"));
        assertEquals(1.0, r.metrics.get("servo_gain").value, 0.05);
        assertEquals(10.0, r.metrics.get("sp_step").value, 1e-9);
        assertEquals("PEM_REQUIRED_FOR_CLOSED_LOOP", r.subgates.get("D").outputs.get("legality"));
        assertEquals("PEM_ARMAX_INNOVATION", r.subgates.get("D").outputs.get("method_id"));
    }

    @Test
    public void evidenceCarriesTheRunIdentityAndEveryRequiredKind() {
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<ResponseEvaluator.Outcome> outcomes = new ArrayList<>();
        int n = 101;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = 5 * i;
            u[i] = t[i] < 100 ? 40 : 45;
        }
        ZohSimulator.Result sim = ZohSimulator.simulate(PLANT, t, u, 40, 100, 0, 100, 60);
        for (int i = 0; i < n; i++) {
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t[i], sim.yHat[i], 100, u[i], true), false)) {
                outcomes.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 7, "REPLAY", "run-42", 3));
            }
        }
        assertEquals(1, outcomes.size());
        ResponseEvaluator.Outcome o = outcomes.get(0);
        assertEquals("REPLAY", o.result.purpose);
        assertEquals("run-42", o.result.analysisRunId);
        assertEquals(3, o.result.contextRevision);
        Set<String> kinds = new HashSet<>();
        for (EvidenceArtifact a : o.artifacts) {
            assertEquals(o.result.methodRunId, a.methodRunId);
            assertEquals("G12", a.gate);
            kinds.add(a.kind);
        }
        for (String k : com.ams.flink.cplm.response.evidence.ResponseEvidenceWriter.REQUIRED_KINDS) assertTrue(k, kinds.contains(k));
        for (String k : new String[] {"y_fit", "residuals", "candidate_models", "delay_objective_curve", "parameter_intervals"}) assertTrue(k, kinds.contains(k));
        assertFalse("no holdout yet -> no prediction artifact", kinds.contains("y_predict"));
        assertFalse("unknown controller -> no bode", kinds.contains("bode"));
        assertNotNull(G12Result.fromJson(o.result.toJson()).metrics.get("dead_time"));
        assertTrue(o.result.datasetHash.startsWith("ds:"));
    }

    @Test
    public void aScenarioAfterALongSilenceIsCapturedNotSwallowedByTheGap() {
        // lab sequence: a run whose capture was open when the publisher stopped, 40 min of silence, a clean input test
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        // run 1: a step whose tail never settles before the publisher stops at t = 300
        for (double t = 0; t <= 300; t += 5) {
            double u = t < 100 ? 40 : 45;
            double pv = t < 104 ? 100 : 100 + 15 * (1 - Math.exp(-(t - 104) / 600));
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t, pv, 100, u, true), false)) {
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals("the capture is still open when the publisher stops", 0, results.size());
        // 40 min later: a clean scenario (180 s stable pre-support, step, 360 s settled tail) at 1 s
        double base = 300 + 2400;
        int n = 541;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = base + i;
            u[i] = t[i] < base + 180 ? 40 : 45;
        }
        ZohSimulator.Result sim = ZohSimulator.simulate(PLANT, t, u, 40, 100, 0, base + 180, 60);
        for (int i = 0; i < n; i++) {
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t[i], sim.yHat[i], 100, u[i], true), false)) {
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals("the stale capture is censored SOURCE_GAP and the new scenario is captured", 2, results.size());
        assertEquals("SOURCE_GAP", results.get(0).finding);
        G12Result fresh = results.get(1);
        assertEquals("EVALUATED", fresh.evaluationState);
        assertEquals("COMPLETE", fresh.subgates.get("B").outputs.get("capture_state"));
        assertEquals(3.0, fresh.metrics.get("process_gain").value, 0.05);
    }

    @Test
    public void aStaleHeldVpIsNotTheAppliedInput_theOpStepIsCapturedOnTheOpPath() {
        // lab finding (2B): a positioner value held for hours next to a fresh OP froze u_applied at the stale VP,
        // so the OP step was invisible. A held VP beyond vp_max_age_s is not evidence (spec §2.7): OP is the input.
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        int n = 101;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = 5 * i;
            u[i] = t[i] < 100 ? 40 : 45;
        }
        ZohSimulator.Result sim = ZohSimulator.simulate(PLANT, t, u, 40, 100, 0, 100, 60);
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = withVp(sample("FIC10302", t[i], sim.yHat[i], 100, u[i], true), 29.33, true, 7_000_000L + (long) (t[i] * 1000));
            assertFalse("a two-hour-old held VP is not eligible", s.vpEligible(cfg.vpMaxAgeS));
            closed.addAll(cap.onSample(s, s.vpEligible(cfg.vpMaxAgeS)));
        }
        assertEquals(1, closed.size());
        ResponseCapture.Closed c = closed.get(0);
        assertEquals("INPUT_TEST", c.event.type.name());
        assertEquals("OP_TO_PV", c.event.pathId);
        assertEquals(5.0, c.duApplied, 1e-9);
        assertEquals("the applied input is OP, not the frozen VP", 45.0, c.data.u[c.data.u.length - 1], 1e-9);
    }

    @Test
    public void theVpTurningStaleDuringACaptureCensorsItAsASourceGap() {
        // VP is the applied input (VP_TO_PV) until the positioner feed stops at t = 160 and its hold age passes
        // vp_max_age_s: from then on u_applied is unknown, so the capture ends there - never spliced onto OP.
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        for (double t = 0; t <= 400; t += 5) {
            double u = t < 100 ? 40 : 45;
            double pv = t < 104 ? 100 : 100 + 15 * (1 - Math.exp(-(t - 104) / 20));
            boolean fresh = t < 160;
            long age = fresh ? 0 : (long) ((t - 160) * 1000) + 5000;
            CplmNormalizedSample s = withVp(sample("FIC10302", t, pv, 100, u, true), fresh ? u * 0.98 : 44.1, !fresh, age);
            for (ResponseCapture.Closed c : cap.onSample(s, s.vpEligible(cfg.vpMaxAgeS))) {
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals(1, results.size());
        G12Result r = results.get(0);
        assertEquals("CENSORED", r.evaluationState);
        assertEquals("SOURCE_GAP", r.finding);
        assertEquals("VP_TO_PV", r.pathId);
        assertNull("nothing is open after the source change", cap.machine().open());
    }

    @Test
    public void aPositionerFeedReturningWhileIdleIsNotAnInputStep() {
        // u_applied switches from OP (stale VP) to VP (fresh again) at t = 200 with OP flat at 40 and VP at 29.4:
        // the switch restarts the support; it must not be read as a 40 -> 29.4 input step.
        ResponseJobConfig cfg = cfg();
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        List<ResponseCapture.Closed> closed = new ArrayList<>();
        for (double t = 0; t <= 400; t += 5) {
            boolean fresh = t >= 200;
            CplmNormalizedSample s = withVp(sample("FIC10302", t, 100, 100, 40, true), fresh ? 29.4 : 29.33, !fresh, fresh ? 0 : 7_000_000L);
            closed.addAll(cap.onSample(s, s.vpEligible(cfg.vpMaxAgeS)));
        }
        assertTrue(closed.isEmpty());
        assertNull(cap.machine().open());
        assertTrue("no event was ever recorded", cap.machine().events().isEmpty());
    }

    @Test
    public void aCaptureClosesOnlyWhenTheSettleMetricCanBeSatisfied() {
        // lab finding (2B): the capture closed "settled" on a 0.5 EU range test at 186 s while the spec's settle band
        // (0.3 EU around the attained endpoint) had only 105 s of tail - so settle_response was right-censored on a
        // capture the job itself had declared settled. The capture must hold until the settle band holds for the tail dwell.
        ResponseJobConfig cfg = cfg();
        cfg.minCaptureS = 180;
        cfg.tailDwellS = 120;
        cfg.stableBandEu = 0.5;
        ResponseCapture cap = new ResponseCapture("FIC10302", cfg);
        cap.setCommandPath("OP_TO_VALVE");
        ResponseEvaluator ev = new ResponseEvaluator(cfg);
        List<G12Result> results = new ArrayList<>();
        double closedAt = Double.NaN, firstInBand = Double.NaN;
        // the lab grid: 5 s samples with one 7 s gap before the band entry, so the tail window's start falls BETWEEN
        // samples (the first in-band sample lies inside the window) - exactly the case that fooled the range test
        for (double t = 0; t <= 600; t += (t == 160 ? 7 : 5)) {
            double u = t < 100 ? 40 : 45;
            double real = t - 100 + 1.2;
            double pv = t < 100 || real <= 4 ? 100 : 100 + 15 * (1 - Math.exp(-(real - 4) / 20));
            if (t >= 100 && Double.isNaN(firstInBand) && Math.abs(pv - 115) <= 0.3) firstInBand = t;
            for (ResponseCapture.Closed c : cap.onSample(sample("FIC10302", t, pv, 100, u, true), false)) {
                closedAt = t;
                results.add(ev.evaluate(c, ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(), 0, "LIVE", "", 0).result);
            }
        }
        assertEquals(1, results.size());
        G12Result r = results.get(0);
        assertEquals("COMPLETE", r.subgates.get("B").outputs.get("capture_state"));
        assertTrue("closed no earlier than the first in-band SAMPLE + tail dwell", closedAt - firstInBand >= 120);
        assertTrue("settle_response is observed, not censored, on a capture the job closed as settled", r.metrics.get("settle_response").available());
        assertEquals(firstInBand - 100, r.metrics.get("settle_response").value, 1e-6);
        assertEquals("the event end is the closing sample, to the millisecond", closedAt * 1000, r.windowEndMs, 0.0);
        assertTrue(r.metrics.get("t10").available());
        assertTrue(r.metrics.get("pre_slope").available());
        assertEquals(0.0, r.metrics.get("pre_slope").value, 1e-9);
    }
}
