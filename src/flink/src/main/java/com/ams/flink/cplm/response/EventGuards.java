package com.ams.flink.cplm.response;

import java.io.Serializable;
import java.util.List;

/**
 * CHG-207: dwell tracking for the two censor rules that apply while a System Response event is open - the valve
 * sitting at its limit (ACTUATOR_CONSTRAINT) and the PV outside the loop's operating region (REGION_EXIT).
 * Each condition must hold continuously, on good samples, for its dwell. A bad sample neither starts nor breaks a
 * dwell. One instance per capture; {@link #reset()} when an event closes, {@link #replayFrom} when one opens.
 */
public final class EventGuards implements Serializable {
    private static final long serialVersionUID = 1L;

    private final double lowLimit, highLimit, regionMin, regionMax, limitDwellS, regionDwellS;
    private double limitSinceS = Double.NaN, regionSinceS = Double.NaN;

    public EventGuards(ResponseJobConfig cfg) {
        double span = cfg.opHighEu - cfg.opLowEu;
        this.lowLimit = cfg.opLowEu + cfg.actuatorLimitBandFraction * span;
        this.highLimit = cfg.opHighEu - cfg.actuatorLimitBandFraction * span;
        this.regionMin = cfg.regionPvMin;
        this.regionMax = cfg.regionPvMax;
        this.limitDwellS = cfg.actuatorLimitDwellS;
        this.regionDwellS = cfg.regionExitDwellS;
    }

    /** Forget any running dwell (an event opened - including a superseding one - or closed). */
    public void reset() {
        limitSinceS = Double.NaN;
        regionSinceS = Double.NaN;
    }

    /** A guard met while replaying an event's samples: the censor reason and the sample time (s) its dwell was met at. */
    public static final class Censor {
        public final String reason;
        public final double atS;

        Censor(String reason, double atS) {
            this.reason = reason;
            this.atS = atS;
        }
    }

    /**
     * Final review I2: an event opens eventDwellS after its step (or a supersede after the new step's dwell), so the guards start
     * at its step t0: the dwells are reset and the ring rows [tS, pv, sp, u, good, auto] with tS >= t0 are replayed, the newest
     * included. Returns the first guard met, else null with the dwells left running for the live samples that follow.
     */
    public Censor replayFrom(List<double[]> rows, double t0) {
        reset();
        for (double[] row : rows) {
            if (row[0] < t0) continue;
            String reason = onSample(row[0], row[3], row[1], row[4] > 0);
            if (reason != null) return new Censor(reason, row[0]);
        }
        return null;
    }

    /** One sample while an event is open: "ACTUATOR_CONSTRAINT", "REGION_EXIT" or null. u is the applied input. */
    public String onSample(double tS, double u, double pv, boolean good) {
        if (!good) return null;
        boolean atLimit = u <= lowLimit || u >= highLimit;
        boolean outside = pv < regionMin || pv > regionMax;
        limitSinceS = atLimit ? (Double.isNaN(limitSinceS) ? tS : limitSinceS) : Double.NaN;
        regionSinceS = outside ? (Double.isNaN(regionSinceS) ? tS : regionSinceS) : Double.NaN;
        if (atLimit && tS - limitSinceS >= limitDwellS) return "ACTUATOR_CONSTRAINT";
        if (outside && tS - regionSinceS >= regionDwellS) return "REGION_EXIT";
        return null;
    }
}
