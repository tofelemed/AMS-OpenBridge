package com.ams.flink.cplm;

/**
 * CHG-226: from when the Long job's per-loop rolling buffer covers, and which windows open before that.
 *
 * <p>A fresh submit starts every loop's buffer empty, so for one window length each 12 h / 24 h window holds only
 * the samples received since the start and G0 reads INCOMPLETE. The Long job keeps the coverage start per loop in
 * keyed state (restored with a checkpoint or savepoint) and stamps every result with {@code coverage_from_ms} and
 * {@code warming_up} (window start before the coverage start), so a reader can tell such a refill window from a
 * genuine data outage. G0 and every other gate stay exactly as computed.
 *
 * <p>The coverage start is the oldest own sample the buffer has held since its state began: the first sample after
 * a fresh start, the oldest buffered sample after a restore from a jar without this state, and it only ever moves
 * back (a late sample with an older time extends the coverage, a newer one never shortens it).
 */
public final class LongBufferCoverage {

    private LongBufferCoverage() {
    }

    /**
     * The coverage start after {@code sampleTsMs} arrived: the stored value moved back to the sample when older, or
     * - when nothing is stored - the oldest of the buffered samples and the sample itself.
     */
    static long afterSample(Long stored, Iterable<CplmNormalizedSample> buffer, long sampleTsMs) {
        if (stored != null) return Math.min(stored, sampleTsMs);
        Long oldest = oldest(buffer);
        return oldest == null ? sampleTsMs : Math.min(oldest, sampleTsMs);
    }

    /** The oldest event time in {@code buffer}; null when it is empty (the buffer is not kept in time order). */
    static Long oldest(Iterable<CplmNormalizedSample> buffer) {
        Long oldest = null;
        if (buffer == null) return null;
        for (CplmNormalizedSample s : buffer) {
            if (s != null && (oldest == null || s.eventTsMs < oldest)) oldest = s.eventTsMs;
        }
        return oldest;
    }

    /** Stamps {@code coverage_from_ms} and {@code warming_up} (window start before the coverage start); null = unknown, nothing stamped. */
    static void stamp(CplmLongDiagnosticsResult r, Long coverageFromMs) {
        if (r == null || coverageFromMs == null) return;
        r.coverageFromMs = coverageFromMs;
        r.warmingUp = r.windowStartMs < coverageFromMs;
    }
}
