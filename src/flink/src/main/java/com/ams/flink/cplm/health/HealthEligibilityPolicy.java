package com.ams.flink.cplm.health;

import java.io.Serializable;

/**
 * v2.5 Task 1H.4 (spec v6 §4.6): the gate impact policy as a table, never as arithmetic on
 * flags. The result is the measurement ELIGIBILITY of one signal over one device interval
 * (identification / shape / reliability), plus the descriptive eligibility where the spec
 * separates the two (a function check excludes identification but only limits description).
 */
public final class HealthEligibilityPolicy {
    public static final class Result implements Serializable {
        private static final long serialVersionUID = 1L;
        /** ELIGIBLE | LIMITED | INELIGIBLE | UNKNOWN | NOT_CONFIGURED */
        public final String eligibility;
        /** For descriptive analyses (G3 style) where it differs; otherwise equal to eligibility. */
        public final String descriptive;
        public final String reason;

        Result(String eligibility, String descriptive, String reason) {
            this.eligibility = eligibility;
            this.descriptive = descriptive;
            this.reason = reason;
        }
    }

    private HealthEligibilityPolicy() {
    }

    public static Result notConfigured() {
        return new Result("NOT_CONFIGURED", "NOT_CONFIGURED", "NO_BINDING");
    }

    public static Result evaluate(HealthInterval i, String signalId) {
        if (i == null) return new Result("UNKNOWN", "UNKNOWN", "NO_INTERVAL");
        String collection = i.collectionState == null ? "UNKNOWN" : i.collectionState;
        if (!"VERIFIED".equals(collection)) {
            // stale snapshot, lost collection, source offline: no implied healthy clearance
            return new Result("LIMITED", "LIMITED", collection);
        }
        boolean affectsSignal = i.affectedVariableIds.isEmpty() || i.affectedVariableIds.contains(signalId);
        boolean f = i.activeFlags.contains("F");
        boolean c = i.activeFlags.contains("C");
        boolean s = i.activeFlags.contains("S");
        boolean m = i.activeFlags.contains("M");
        if ("INVALID".equals(i.measurementImpact) && (affectsSignal || i.activeFlags.isEmpty())) {
            if (c && !f) return new Result("INELIGIBLE", "LIMITED", "C_TEST_ACTIVE");
            return new Result("INELIGIBLE", "INELIGIBLE", f ? "F_AFFECTS_SIGNAL" : "MEASUREMENT_INVALID");
        }
        if (f && affectsSignal) return new Result("INELIGIBLE", "INELIGIBLE", "F_AFFECTS_SIGNAL");
        if (c && affectsSignal) return new Result("INELIGIBLE", "LIMITED", "C_TEST_ACTIVE");
        if (s && affectsSignal) return new Result("LIMITED", "LIMITED", "S_DEGRADED");
        if ((f || c || s) && !affectsSignal) return new Result("ELIGIBLE", "ELIGIBLE", "FLAG_ON_INDEPENDENT_VARIABLE");
        if (m) {
            if ("DEGRADED".equals(i.measurementImpact)) return new Result("LIMITED", "LIMITED", "M_WITH_DEGRADED_MEASUREMENT");
            return new Result("ELIGIBLE", "ELIGIBLE", "M_CONTEXT_ONLY");
        }
        if ("UNKNOWN".equals(i.measurementImpact)) return new Result("LIMITED", "LIMITED", "IMPACT_UNKNOWN");
        if ("DEGRADED".equals(i.measurementImpact)) return new Result("LIMITED", "LIMITED", "MEASUREMENT_DEGRADED");
        if (i.activeFlags.isEmpty() && i.stateComplete) return new Result("ELIGIBLE", "ELIGIBLE", "NO_ACTIVE_DIAGNOSTIC");
        return new Result("LIMITED", "LIMITED", "STATE_INCOMPLETE");
    }
}
