package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.estimation.ResponseFitFixtures;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/**
 * CHG-075 (lab 2026-10-06/07): a busy Response operator expired the job's checkpoint; with zero tolerated failures
 * that failed the job, and the stuck task then took the TaskManager (and every job on it) down. The job now uses
 * the Short job's busy-tolerant settings (CHG-038/039) and keeps its own cadence.
 * CHG-204: a capture runs under its loop's declared PV range; a range edit applies from the next event.
 * Final review (CHG-204/207): a result names the settings its capture ran under; the CHG-204/207 defaults are job arguments.
 */
public class CplmResponseAnalysisJobTest {

    @Test
    public void checkpointsTolerateABusyOperator() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        CplmResponseAnalysisJob.configureCheckpointing(env);
        CheckpointConfig c = env.getCheckpointConfig();
        assertEquals(300_000L, c.getCheckpointInterval());                       // unchanged cadence
        assertEquals(120_000L, c.getMinPauseBetweenCheckpoints());
        assertEquals(CheckpointingMode.EXACTLY_ONCE, c.getCheckpointingMode());
        assertEquals(900_000L, c.getCheckpointTimeout());
        assertEquals(1_000, c.getTolerableCheckpointFailureNumber());
        assertTrue("the barrier must overtake a busy operator's backlog", c.isUnalignedCheckpointsEnabled());
        assertEquals(30_000L, c.getAlignedCheckpointTimeout().toMillis());
        assertEquals(CheckpointConfig.ExternalizedCheckpointCleanup.DELETE_ON_CANCELLATION, c.getExternalizedCheckpointCleanup());
    }

    private static CplmNormalizedSample withRange(double pvMin, double pvMax) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = "PIC00551";
        s.resolvedProfile = new CplmLoopDynamicsProfile();
        s.resolvedProfile.pvEngMin = pvMin;
        s.resolvedProfile.pvEngMax = pvMax;
        s.resolvedProfile.pvRangeDeclared = true;
        return s;
    }

    @Test
    public void rangeChangeWhileEventOpenKeepsCapture() {
        CplmResponseAnalysisJob.ResponseProcessFunction fn = new CplmResponseAnalysisJob.ResponseProcessFunction(new ResponseJobConfig(), "LIVE", "");
        ResponseCapture capture = fn.captureFor(withRange(0, 6), null);
        assertEquals(6.0, capture.config().pvSpanEu, 0);
        assertSame("the same range while idle keeps the capture and its ring", capture, fn.captureFor(withRange(0, 6), capture));

        capture.machine().onCandidate(new ResponseEvent("e1", "PIC00551", EventType.SERVO_STEP, "OP_TO_PV", 100_000, 3.0, 3.5,
                Collections.singletonList(new double[] {100_000, 3.5})), 100);
        assertFalse(capture.idle());
        ResponseCapture during = fn.captureFor(withRange(0, 10), capture);
        assertSame("an open event keeps its settings until it closes", capture, during);
        assertEquals(6.0, during.config().pvSpanEu, 0);

        capture.machine().complete(400);
        assertTrue(capture.idle());
        ResponseCapture next = fn.captureFor(withRange(0, 10), capture);
        assertNotSame("the new range takes over between events", capture, next);
        assertEquals(10.0, next.config().pvSpanEu, 0);
    }

    @Test
    public void evaluatorPerDeclaredSpan() {
        ResponseJobConfig job = new ResponseJobConfig();
        CplmResponseAnalysisJob.ResponseProcessFunction fn = new CplmResponseAnalysisJob.ResponseProcessFunction(job, "LIVE", "");
        ResponseEvaluator byDefault = fn.evaluatorFor(job.withProfileRanges(null));
        ResponseEvaluator span6 = fn.evaluatorFor(fn.captureFor(withRange(0, 6), null).config());
        ResponseEvaluator span10 = fn.evaluatorFor(fn.captureFor(withRange(0, 10), null).config());
        assertNotNull(byDefault);
        assertSame("no bundle, no range: the job-default evaluator", byDefault, fn.evaluatorFor(job));
        assertNotSame("a declared span without a bundle is not judged by the default evaluator", byDefault, span6);
        assertNotSame("two spans, two evaluators", span6, span10);
        assertSame("one evaluator per span", span6, fn.evaluatorFor(fn.captureFor(withRange(0, 6), null).config()));
    }

    private static CplmNormalizedSample withProfile(String loopId, CplmLoopDynamicsProfile p) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = loopId;
        s.resolvedProfile = p;
        return s;
    }

    private static CplmLoopDynamicsProfile span0to10(double regionMin, double regionMax) {
        CplmLoopDynamicsProfile p = withRange(0, 10).resolvedProfile;
        p.regionPvMin = regionMin;
        p.regionPvMax = regionMax;
        return p;
    }

    /** A closed capture under these settings, censored so nothing is fitted: only the result's identity is read. */
    private static ResponseCapture.Closed censored(ResponseJobConfig settings) {
        double[] t = ResponseFitFixtures.times(ResponseFitFixtures.EPOCH_MS, 300, 1000, 0, 1);
        EventDataset d = ResponseFitFixtures.stepEvent("FOPDT", new double[] {3, 10, 30}, t, 60, 0.05, 1);
        ResponseEvent e = new ResponseEvent(ResponseEvent.idFor("L", Math.round(d.t0 * 1000), EventType.INPUT_TEST, settings.bundleHash()), "L",
                EventType.INPUT_TEST, "OP_TO_PV", d.t0 * 1000, ResponseFitFixtures.U_BEFORE, ResponseFitFixtures.U_BEFORE + ResponseFitFixtures.DU,
                Collections.singletonList(new double[] {d.t0 * 1000, ResponseFitFixtures.U_BEFORE + ResponseFitFixtures.DU}));
        e.tEndMs = d.tEnd * 1000;
        e.captureState = "CENSORED";
        e.censorReason = "ACTUATOR_CONSTRAINT";
        return new ResponseCapture.Closed(e, d, ResponseFitFixtures.U_BEFORE, 100, 100, ResponseFitFixtures.DU, "OP_COMMAND", true);
    }

    /** The bundle hash on the result the job would emit for this capture. */
    private static String resultHash(CplmResponseAnalysisJob.ResponseProcessFunction fn, ResponseCapture capture) {
        return fn.evaluatorFor(capture.config()).evaluate(censored(capture.config()), ModelFamily.FOPDT, null, 0, ControllerSnapshot.unknown(),
                0, "LIVE", "", 0).result.bundleHash;
    }

    /**
     * Final review I1 (CHG-204/207): the capture names its event with its settings' hash, which covers the OP range and the region
     * since CHG-207. Two loops on PV 0-10, one with a region, in both orders: each result carries its own capture's hash. A loop
     * with no declared span but a declared OP range is not judged under the job defaults' hash.
     */
    @Test
    public void resultIdentityNamesTheSettingsThatRan() {
        for (boolean regionFirst : new boolean[] {false, true}) {
            CplmResponseAnalysisJob.ResponseProcessFunction fn = new CplmResponseAnalysisJob.ResponseProcessFunction(new ResponseJobConfig(), "LIVE", "");
            ResponseCapture plain = fn.captureFor(withProfile("PIC1", span0to10(Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY)), null);
            ResponseCapture region = fn.captureFor(withProfile("PIC2", span0to10(4, 6)), null);
            assertNotEquals(plain.config().bundleHash(), region.config().bundleHash());
            ResponseCapture[] order = regionFirst ? new ResponseCapture[] {region, plain} : new ResponseCapture[] {plain, region};
            for (ResponseCapture c : order) assertEquals("region first: " + regionFirst, c.config().bundleHash(), resultHash(fn, c));
        }
        CplmLoopDynamicsProfile opOnly = new CplmLoopDynamicsProfile();
        opOnly.opRangeDeclared = true;
        opOnly.opEngMin = 0;
        opOnly.opEngMax = 200;
        CplmResponseAnalysisJob.ResponseProcessFunction fn = new CplmResponseAnalysisJob.ResponseProcessFunction(new ResponseJobConfig(), "LIVE", "");
        ResponseCapture op = fn.captureFor(withProfile("FIC1", opOnly), null);
        assertTrue(Double.isNaN(op.config().pvSpanEu));
        assertNotEquals(new ResponseJobConfig().bundleHash(), op.config().bundleHash());
        assertEquals("an undeclared span with a declared OP range", op.config().bundleHash(), resultHash(fn, op));
    }

    /** Under a governed bundle the hash is the bundle's own and does not cover the span: two spans still get two evaluators. */
    @Test
    public void governedLoopsWithTwoSpansKeepTwoEvaluators() {
        ResponseJobConfig job = new ResponseJobConfig();
        CplmResponseAnalysisJob.ResponseProcessFunction fn = new CplmResponseAnalysisJob.ResponseProcessFunction(job, "LIVE", "");
        ResponseJobConfig span6 = job.underBundle("bundle-1", Collections.emptyMap()).withProfileRanges(withRange(0, 6).resolvedProfile);
        ResponseJobConfig span10 = job.underBundle("bundle-1", Collections.emptyMap()).withProfileRanges(withRange(0, 10).resolvedProfile);
        assertEquals(span6.bundleHash(), span10.bundleHash());
        assertNotSame(fn.evaluatorFor(span6), fn.evaluatorFor(span10));
        assertSame(fn.evaluatorFor(span6), fn.evaluatorFor(job.underBundle("bundle-1", Collections.emptyMap()).withProfileRanges(withRange(0, 6).resolvedProfile)));
    }

    /** Final review M2 (CHG-204/207): the defaults the branch added can be set per site without a new jar. */
    @Test
    public void newDefaultsAreJobArguments() {
        ResponseJobConfig c = ResponseJobConfig.fromArgs(new String[] {"--g12-settle-noise-multiplier", "2.5", "--g12-actuator-limit-band-fraction", "0.02",
                "--g12-actuator-limit-dwell-s", "20", "--g12-region-exit-dwell-s", "30"});
        assertEquals(2.5, c.settleNoiseMultiplier, 0);
        assertEquals(0.02, c.actuatorLimitBandFraction, 0);
        assertEquals(20, c.actuatorLimitDwellS, 0);
        assertEquals(30, c.regionExitDwellS, 0);
        ResponseJobConfig defaults = ResponseJobConfig.fromArgs(new String[0]);
        assertEquals(1.5, defaults.settleNoiseMultiplier, 0);
        assertEquals(0.01, defaults.actuatorLimitBandFraction, 0);
        assertEquals(10, defaults.actuatorLimitDwellS, 0);
        assertEquals(10, defaults.regionExitDwellS, 0);
    }
}
