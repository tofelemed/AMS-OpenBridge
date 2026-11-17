package com.ams.flink.cplm.response;

import java.io.Serializable;

/**
 * CHG-207: dwell tracking for the two censor rules that apply while a System Response event is open - the valve
 * sitting at its limit (ACTUATOR_CONSTRAINT) and the PV outside the loop's operating region (REGION_EXIT).
 * Each condition must hold continuously, on good samples, for its dwell. A bad sample neither starts nor breaks a
 * dwell. One instance per capture; {@link #reset()} when an event opens or closes.
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
