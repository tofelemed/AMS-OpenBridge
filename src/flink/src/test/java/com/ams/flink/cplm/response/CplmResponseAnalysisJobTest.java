package com.ams.flink.cplm.response;

import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-075 (lab 2026-10-06/07): a busy Response operator expired the job's checkpoint; with zero tolerated failures
 * that failed the job, and the stuck task then took the TaskManager (and every job on it) down. The job now uses
 * the Short job's busy-tolerant settings (CHG-038/039) and keeps its own cadence.
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
}
