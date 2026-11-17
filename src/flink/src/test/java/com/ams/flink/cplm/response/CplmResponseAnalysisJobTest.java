package com.ams.flink.cplm.response;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.ResponseEvent;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/**
 * CHG-075 (lab 2026-10-06/07): a busy Response operator expired the job's checkpoint; with zero tolerated failures
 * that failed the job, and the stuck task then took the TaskManager (and every job on it) down. The job now uses
 * the Short job's busy-tolerant settings (CHG-038/039) and keeps its own cadence.
 * CHG-204: a capture runs under its loop's declared PV range; a range edit applies from the next event.
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
}
