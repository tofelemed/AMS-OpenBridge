package com.ams.flink.cplm.config;

import org.apache.flink.streaming.api.functions.source.SourceFunction;

/**
 * Emits one record when its task starts, then idles until the job cancels it, so the announce stream is
 * CONTINUOUS_UNBOUNDED: the sink writer never runs endInput() and no checkpoint carries an end-of-input
 * committable. Lab 2026-09-25: with a bounded {@code fromElements} source, a job restored from the checkpoint
 * that was the announce task's final one (chk-1 of a fresh submission) re-ran endInput(), the writer re-emitted
 * the EOI CommittableSummary into a committer restored with that very summary, and FLINK-25920 fired on every
 * restart, for ever - Condition, Fusion and Response sat in RESTARTING until cancelled. A restart of this task
 * re-announces the same keyed record, which is idempotent for every reader of the ACK topic.
 */
@SuppressWarnings("deprecation") // SourceFunction: the one Flink 1.18 API that emits once and stays alive without a bundled connector
public final class AnnounceOnceSource implements SourceFunction<String> {
    private static final long serialVersionUID = 1L;
    private final String record;
    private volatile boolean running = true;

    public AnnounceOnceSource(String record) {
        this.record = record;
    }

    @Override
    public void run(SourceContext<String> ctx) throws Exception {
        synchronized (ctx.getCheckpointLock()) {
            ctx.collect(record);
        }
        while (running) {
            try {
                Thread.sleep(1_000);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    @Override
    public void cancel() {
        running = false;
    }
}
