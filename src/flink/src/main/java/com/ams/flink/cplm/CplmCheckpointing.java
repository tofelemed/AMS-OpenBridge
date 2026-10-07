package com.ams.flink.cplm;

import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

import java.time.Duration;

/**
 * Checkpoint settings for a job whose operator can be busy for a while (a backlog, a long evaluation).
 *
 * <p>CHG-038 (Short, Marun 2026-09-27 / 10-03 / 10-04): with Flink's default of zero tolerated checkpoint failures,
 * one expired aligned checkpoint failed the job, the restore rewound Kafka and the next checkpoint expired too. So:
 * an expired checkpoint is tolerated, the barrier overtakes a backlog (unaligned after a 30 s aligned attempt -
 * exactly-once is kept), and a checkpoint gets 15 minutes. CHG-039: DELETE_ON_CANCELLATION, the cluster rule -
 * RETAIN left a whole checkpoint tree in MinIO per cancel or redeploy.
 *
 * <p>CHG-075: the Response job shares these settings (it ran with zero tolerated failures and RETAIN).
 */
public final class CplmCheckpointing {
    public static final long TIMEOUT_MS = 900_000;
    public static final int TOLERABLE_FAILURES = 1_000;
    public static final Duration ALIGNED_TIMEOUT = Duration.ofSeconds(30);

    private CplmCheckpointing() {}

    /** Exactly-once checkpoints every intervalMs (at least minPauseMs apart) that tolerate a busy operator. */
    public static void configureBusyTolerant(StreamExecutionEnvironment env, long intervalMs, long minPauseMs) {
        env.enableCheckpointing(intervalMs, CheckpointingMode.EXACTLY_ONCE);
        CheckpointConfig c = env.getCheckpointConfig();
        c.setMinPauseBetweenCheckpoints(minPauseMs);
        c.setCheckpointTimeout(TIMEOUT_MS);
        c.setTolerableCheckpointFailureNumber(TOLERABLE_FAILURES);
        c.enableUnalignedCheckpoints(true);
        c.setAlignedCheckpointTimeout(ALIGNED_TIMEOUT);
        c.setExternalizedCheckpointCleanup(CheckpointConfig.ExternalizedCheckpointCleanup.DELETE_ON_CANCELLATION);
    }
}
