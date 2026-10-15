package com.ams.flink.cplm.fusion;

/**
 * CHG-094 (SME review 2, #14): the recommendation follows the leading hypothesis — every qualified family used to get the
 * same "positioner / bump test before retuning" text, oscillation and excessive effort included — and its urgency follows
 * the evidence band: DETECTED is "monitor", CLASSIFIED is "plan a review", SUSPECTED / CONFIRMED is the action itself.
 * The valve wording keeps the VP declaration of CHG-088 (no "VP" advice on a loop declared without one).
 */
public final class Recommendations {
    private Recommendations() {
    }

    /** The evidence band named by a diagnosis (`SUSPECTED_OSCILLATION` → SUSPECTED), or null when it names none. */
    public static String bandOf(String diagnosis) {
        if (diagnosis == null) return null;
        int cut = diagnosis.indexOf('_');
        String band = cut > 0 ? diagnosis.substring(0, cut) : diagnosis;
        switch (band) {
            case "DETECTED":
            case "CLASSIFIED":
            case "SUSPECTED":
            case "CONFIRMED":
                return band;
            default:
                return null;
        }
    }

    /**
     * @param leadingHypothesis STICTION / OSCILLATION_TUNING / EXTERNAL_DISTURBANCE / EXCESSIVE_EFFORT
     * @param band              DETECTED / CLASSIFIED / SUSPECTED / CONFIRMED
     * @param hasVp             a valve position was seen in the window
     * @param vpGap             no VP although the loop is expected to have one (CHG-088)
     */
    public static String of(String leadingHypothesis, String band, boolean hasVp, boolean vpGap) {
        String action = actionFor(leadingHypothesis, hasVp, vpGap);
        if ("DETECTED".equals(band)) return "Monitor: weak evidence so far, no action yet. If it persists - " + lower(action);
        if ("CLASSIFIED".equals(band)) return "Plan a review: " + lower(action);
        return action;
    }

    private static String actionFor(String leadingHypothesis, boolean hasVp, boolean vpGap) {
        String h = leadingHypothesis == null ? "" : leadingHypothesis;
        switch (h) {
            case "OSCILLATION_TUNING":
                return "Review the controller gain and integral time; a step test on the loop confirms the tuning.";
            case "EXTERNAL_DISTURBANCE":
                return "Trace the upstream or interacting loop that drives the oscillation before retuning this one.";
            case "EXCESSIVE_EFFORT":
                return "Review the gain and derivative action and the PV filtering / noise; check OP travel and reversals.";
            default:   // STICTION / final element (and anything unrecognised): the valve text, as before CHG-094
                return hasVp
                        ? "Review positioner/HART data and perform controlled bump test before retuning."
                        : vpGap
                        ? "Check VP/positioner data or perform an approved bump/stroke test before retuning."
                        : "Perform an approved bump/stroke test before retuning (no valve position on this loop).";
        }
    }

    private static String lower(String s) {
        return s.isEmpty() ? s : Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }
}
