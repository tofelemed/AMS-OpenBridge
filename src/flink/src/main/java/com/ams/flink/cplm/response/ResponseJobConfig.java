package com.ams.flink.cplm.response;

import java.io.Serializable;

/**
 * The G12 runtime settings (spec §2.4, §2.5, §2.7). Until Phase 3 delivers governed bundles these
 * come from job arguments with the spec's commissioning defaults and are recorded on every result
 * through the bundle hash, so what ran is never ambiguous. Units: seconds, EU, fractions.
 */
public final class ResponseJobConfig implements Serializable {
    private static final long serialVersionUID = 1L;

    /** Stable pre-event support required before a trigger (s). */
    public double preSupportS = 120;
    /** Shortest capture that may be qualified (s). */
    public double minCaptureS = 180;
    /** Longest capture; beyond it the event is CENSORED CAPTURE_MAX (s). */
    public double maxCaptureS = 4 * 3600;
    /** A source gap longer than this censors the capture (s). */
    public double maxGapS = 60;
    /** Tail dwell of stable output that closes a capture as settled (s). */
    public double tailDwellS = 120;
    /** The output must stay within this band (EU) over the tail dwell to count as settled. */
    public double stableBandEu = 0.5;
    /** Trigger floor for a reference / input step (EU). */
    public double stepMinInputEu = 1.0;
    /** Trigger as a fraction of the declared span. */
    public double stepMinSpanFraction = 0.01;
    /** Robust-noise multiplier for the trigger. */
    public double noiseMultiplier = 4;
    /** Persistence a new level must show before it is an event (s). */
    public double eventDwellS = 30;
    /** Ramp classification: minimum slope (EU/s) and duration (s). */
    public double rampMinSlopeEuPerS = 0.02, rampMinDurationS = 120;
    /** Response-metric settings. */
    public double absSettlingBandEu = 0.1, relSettlingBand = 0.02, noiseFloorEu = 0.05, crossingDwellS = 5, minResponseEu = 0.5, targetBandEu = 0.5;
    /** Estimator settings. */
    public double delayGridS = 5, thetaMaxS = 600, tauMaxS = 7200;
    /** Wall-clock budget for one estimation (ms); exceeding it censors BUDGET_EXCEEDED, never a partial model. */
    public long fitBudgetMs = 20_000;
    /** Declared PV span for the trigger fraction when the profile declares none (EU). */
    public double fallbackSpanEu = 100;
    /** A held VP older than this is not the applied input (spec §2.7); u_applied falls back to OP. */
    public double vpMaxAgeS = com.ams.flink.cplm.CplmLoopDynamicsProfile.VP_MAX_AGE_S_DEFAULT;
    /** v2.5 (2G.1, NR-016): the smallest dead time the site needs resolved (s); a sample grid above it makes G12 LIMITED:BANDWIDTH. 0 = no claim. */
    public double delayMinS = 0;

    public static ResponseJobConfig fromArgs(String[] args) {
        ResponseJobConfig c = new ResponseJobConfig();
        c.preSupportS = num(args, "g12-pre-support-s", c.preSupportS);
        c.minCaptureS = num(args, "g12-min-capture-s", c.minCaptureS);
        c.maxCaptureS = num(args, "g12-max-capture-s", c.maxCaptureS);
        c.maxGapS = num(args, "g12-max-gap-s", c.maxGapS);
        c.tailDwellS = num(args, "g12-tail-dwell-s", c.tailDwellS);
        c.stableBandEu = num(args, "g12-stable-band-eu", c.stableBandEu);
        c.stepMinInputEu = num(args, "g12-step-min-eu", c.stepMinInputEu);
        c.stepMinSpanFraction = num(args, "g12-step-min-span-fraction", c.stepMinSpanFraction);
        c.noiseMultiplier = num(args, "g12-noise-multiplier", c.noiseMultiplier);
        c.eventDwellS = num(args, "g12-event-dwell-s", c.eventDwellS);
        c.delayGridS = num(args, "g12-delay-grid-s", c.delayGridS);
        c.thetaMaxS = num(args, "g12-theta-max-s", c.thetaMaxS);
        c.tauMaxS = num(args, "g12-tau-max-s", c.tauMaxS);
        c.fitBudgetMs = (long) num(args, "g12-fit-budget-ms", c.fitBudgetMs);
        c.vpMaxAgeS = num(args, "g12-vp-max-age-s", c.vpMaxAgeS);
        c.delayMinS = num(args, "g12-delay-min-s", c.delayMinS);
        return c;
    }

    /** A stable content hash of the settings, the G12 bundle identity until Phase 3 (spec §1.6 / R26). */
    public String bundleHash() {
        String canonical = "g12|" + preSupportS + "|" + minCaptureS + "|" + maxCaptureS + "|" + maxGapS + "|" + tailDwellS + "|" + stableBandEu
                + "|" + stepMinInputEu + "|" + stepMinSpanFraction + "|" + noiseMultiplier + "|" + eventDwellS + "|" + rampMinSlopeEuPerS + "|" + rampMinDurationS
                + "|" + absSettlingBandEu + "|" + relSettlingBand + "|" + noiseFloorEu + "|" + crossingDwellS + "|" + minResponseEu + "|" + targetBandEu
                + "|" + delayGridS + "|" + thetaMaxS + "|" + tauMaxS + "|" + fitBudgetMs + "|" + vpMaxAgeS + "|" + delayMinS;
        return "g12:" + com.ams.flink.cplm.identity.ProfileHash.sha256Prefix(canonical, 16);
    }

    private static double num(String[] args, String key, double def) {
        for (int i = 0; i + 1 < args.length; i++) {
            String a = args[i].startsWith("--") ? args[i].substring(2) : args[i];
            if (a.equals(key)) {
                try {
                    return Double.parseDouble(args[i + 1]);
                } catch (NumberFormatException e) {
                    return def;
                }
            }
        }
        return def;
    }
}
