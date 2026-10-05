package com.ams.flink.cplm;

import java.io.Serializable;
import java.util.List;

/**
 * The Short job's six window kinds and Flink's event-time window arithmetic for them, reproduced
 * exactly (offset 0) so {@link ShortFeatureBufferFn} fires the same windows, with the same members,
 * as the six {@code WindowOperator}s it replaced (CHG-039).
 *
 * <p>Flink rules mirrored here: a sample at {@code ts} belongs to every window
 * {@code [start, start + size)} with {@code start = lastStart(ts) - k * slide > ts - size}
 * ({@code SlidingEventTimeWindows.assignWindows}); a window fires on time when the watermark reaches
 * {@code end - 1} ({@code EventTimeTrigger}); it is LATE, and drops new samples, once
 * {@code end - 1 + allowedLateness <= watermark} ({@code WindowOperator.isWindowLate}); between the two
 * every new member fires it again.
 */
final class ShortWindowSpecs {

    /** One window kind: size, slide and allowed lateness in milliseconds. */
    static final class Spec implements Serializable {
        private static final long serialVersionUID = 1L;
        final String kind;
        final long sizeMs;
        final long slideMs;
        final long latenessMs;

        Spec(String kind, long sizeMs, long slideMs, long latenessMs) {
            this.kind = kind;
            this.sizeMs = sizeMs;
            this.slideMs = slideMs;
            this.latenessMs = latenessMs;
        }

        /** {@code TimeWindow.getWindowStartWithOffset(ts, 0, slide)}. */
        long lastStart(long ts) {
            return ts - (ts + slideMs) % slideMs;
        }

        /** Whether a window ending at {@code end} exists for this kind (its start sits on the slide grid). */
        boolean endsAt(long end) {
            return Math.floorMod(end - sizeMs, slideMs) == 0;
        }

        /** The time at which Flink clears the window ending at {@code end}. */
        long cleanupTime(long end) {
            return end - 1 + latenessMs;
        }
    }

    private static final long MIN = 60_000L;

    /** Same kinds, sizes, slides and lateness as the v2.6.5 job (and cplm-api's window contract). */
    static final List<Spec> ALL = List.of(
            new Spec("1m", MIN, MIN, 30_000L),
            new Spec("5m", 5 * MIN, MIN, 60_000L),
            new Spec("10m", 10 * MIN, 2 * MIN, 90_000L),
            new Spec("15m", 15 * MIN, 5 * MIN, 2 * MIN),
            new Spec("30m", 30 * MIN, 5 * MIN, 2 * MIN),
            new Spec("60m", 60 * MIN, 5 * MIN, 3 * MIN));

    private ShortWindowSpecs() {
    }

    /**
     * The last moment any window holding a sample at {@code ts} is still alive: after a timer at this
     * time fires, no window can need the sample again.
     */
    static long retainUntil(long ts) {
        long max = Long.MIN_VALUE;
        for (Spec s : ALL) max = Math.max(max, s.cleanupTime(s.lastStart(ts) + s.sizeMs));
        return max;
    }
}
