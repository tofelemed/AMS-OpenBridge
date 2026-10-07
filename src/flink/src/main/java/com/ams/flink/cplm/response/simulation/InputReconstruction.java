package com.ams.flink.cplm.response.simulation;

/**
 * The applied input as a held signal (each sample holds until the next), delayed by theta:
 * u_delayed(s) = u(s - theta); before the first sample the baseline u0 applies. Breakpoints are the
 * instants where the delayed input changes - the exact ZOH step is split there (fractional delay
 * without interpolating the STATE, spec §2.7).
 */
public final class InputReconstruction {
    private final double[] t;
    private final double[] u;
    private final double u0;
    private final double theta;

    public InputReconstruction(double[] t, double[] u, double u0, double theta) {
        if (t.length != u.length) throw new IllegalArgumentException("t and u differ in length");
        this.t = t;
        this.u = u;
        this.u0 = u0;
        this.theta = theta;
    }

    /** CHG-075: a forward walk over the breakpoints for one simulation - O(n) in total. */
    public Cursor cursor() { return new Cursor(); }

    /**
     * Breakpoint j (t[j] + theta) starts the hold of u[j]; the value is taken from the breakpoint's own
     * index, never re-derived by subtracting theta again (which can round to the previous sample).
     */
    public final class Cursor {
        private int j;
        private double held = u0;

        private Cursor() {}

        /** Passes every breakpoint at or before s; returns the delayed input held from s on. */
        public double heldAfter(double s) {
            while (j < t.length && t[j] + theta <= s) held = u[j++];
            return held;
        }

        /** The next not-yet-passed breakpoint if it lies strictly before {@code to}, else NaN. Does not pass it. */
        public double nextBefore(double to) {
            if (j >= t.length) return Double.NaN;
            double s = t[j] + theta;
            return s < to ? s : Double.NaN;
        }
    }
}
