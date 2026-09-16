package com.ams.flink.cplm.response.metrics;

/**
 * Error integrals over VALID held half-open intervals [t_i, t_{i+1}) clipped to [t0, tEnd)
 * (spec §2.5): IAE, ISE, and the exact ITAE 0.5|e|((b-t0)^2 - (a-t0)^2). Invalid samples are
 * excluded, never bridged; the last sample is not extrapolated beyond tEnd.
 */
public final class ErrorIntegrals {
    public static final String METHOD = "HELD_INTERVAL_INTEGRALS_V1";

    public static final class Result {
        public final double iae, ise, itae, validDuration, excludedDuration, coverage;

        Result(double iae, double ise, double itae, double validDuration, double excludedDuration, double coverage) {
            this.iae = iae;
            this.ise = ise;
            this.itae = itae;
            this.validDuration = validDuration;
            this.excludedDuration = excludedDuration;
            this.coverage = coverage;
        }
    }

    private ErrorIntegrals() {}

    public static Result over(EventDataset d) {
        double iae = 0, ise = 0, itae = 0, dur = 0;
        for (int i = 0; i < d.size(); i++) {
            double a = Math.max(d.t[i], d.t0);
            double b = Math.min(i + 1 < d.size() ? d.t[i + 1] : d.tEnd, d.tEnd);
            if (b <= a || !d.valid[i]) continue;
            double e = d.r[i] - d.y[i];
            if (!Double.isFinite(e)) continue;
            double w = b - a;
            iae += Math.abs(e) * w;
            ise += e * e * w;
            itae += 0.5 * Math.abs(e) * ((b - d.t0) * (b - d.t0) - (a - d.t0) * (a - d.t0));
            dur += w;
        }
        double elapsed = Math.max(0, d.tEnd - d.t0);
        return new Result(iae, ise, itae, dur, Math.max(0, elapsed - dur), elapsed > 0 ? dur / elapsed : 0);
    }
}
