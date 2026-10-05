package com.ams.flink.cplm;

import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Marun 2026-09-27, 10-03, 10-04 (CHG-038): three times the Short job fell a few minutes behind and never
 * recovered - with the default of zero tolerated checkpoint failures, one expired (aligned, 5-minute) checkpoint
 * failed the job, the restore rewound Kafka, the backlog grew and the next checkpoint expired too (32 completed
 * vs 212 failed, 14 h behind, 1.48 M samples queued). The job's maths clears such a backlog in well under an
 * hour when it is left alone. Three settings make that possible: tolerate expired checkpoints, let the barrier
 * overtake the backlog (unaligned after a short aligned attempt), and give a checkpoint 15 minutes.
 */
public class CplmShortFeatureStreamJobTest {

    @Test
    public void checkpointingSurvivesABacklogInsteadOfLoopingOnIt() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        CplmShortFeatureStreamJob.configureCheckpointing(env);
        CheckpointConfig c = env.getCheckpointConfig();
        assertEquals(180_000L, c.getCheckpointInterval());                       // unchanged cadence
        assertEquals(CheckpointingMode.EXACTLY_ONCE, c.getCheckpointingMode());   // the Kafka sink's guarantee
        assertEquals(60_000L, c.getMinPauseBetweenCheckpoints());
        assertEquals(900_000L, c.getCheckpointTimeout());                         // 15 min, was 5
        assertTrue("an expired checkpoint must not fail the job", c.getTolerableCheckpointFailureNumber() >= 100);
        assertTrue("the barrier must overtake a backlog", c.isUnalignedCheckpointsEnabled());
        assertEquals(30_000L, c.getAlignedCheckpointTimeout().toMillis());        // aligned first, unaligned after 30 s
        // CHG-039: retained-on-cancel orphaned a 4.1 GB checkpoint tree per cancel at Marun; follow the cluster rule
        assertEquals(CheckpointConfig.ExternalizedCheckpointCleanup.DELETE_ON_CANCELLATION, c.getExternalizedCheckpointCleanup());
    }

    /** CHG-039: on RocksDB at ~45 MB per slot the buffer ran at 47 samples/s per core; on the heap 804/s. */
    @Test
    public void theShortJobKeepsItsBufferOnTheHeap() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        CplmShortFeatureStreamJob.configureStateBackend(env);
        assertTrue(env.getStateBackend() instanceof org.apache.flink.runtime.state.hashmap.HashMapStateBackend);
    }
}
