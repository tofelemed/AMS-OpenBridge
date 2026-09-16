package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;

/**
 * Advisory only (spec §2.9): SIMC (Skogestad 2003, corrected editions) - self-regulating
 * Kc = tau / (Kp (tau_c + theta)), Ti = min(tau, 4 (tau_c + theta)); integrating
 * Kc = 1 / (Ki (tau_c + theta)), Ti = 4 (tau_c + theta); SOPDT Td = tau2. Refuses without a
 * VALIDATED model, a known controller form and an APPROVED tau_c (lambda). Never applied.
 */
public final class SimcAdvisor {
    public static final String RULE = "SIMC_2003_CORRECTED";

    public static final class Advice {
        public final Double kc, ti, td;
        public final String rule, reason;

        Advice(Double kc, Double ti, Double td, String rule, String reason) {
            this.kc = kc;
            this.ti = ti;
            this.td = td;
            this.rule = rule;
            this.reason = reason;
        }
    }

    private SimcAdvisor() {}

    public static Advice advise(ProcessModel m, boolean validated, ControllerSnapshot c, Double lambdaS) {
        if (!validated) return new Advice(null, null, null, RULE, "MODEL_NOT_VALIDATED");
        if (c == null || !c.known()) return new Advice(null, null, null, RULE, "CONTROLLER_FORM_UNKNOWN");
        if (lambdaS == null || lambdaS <= 0) return new Advice(null, null, null, RULE, "LAMBDA_NOT_APPROVED");
        double tc = lambdaS + m.theta;
        switch (m.family) {
            case FOPDT: return new Advice(m.tau / (m.gain * tc), Math.min(m.tau, 4 * tc), null, RULE, "");
            case SOPDT: return new Advice(m.tau / (m.gain * tc), Math.min(m.tau, 4 * tc), m.tau2, RULE, "");
            case IPDT: return new Advice(1 / (m.gain * tc), 4 * tc, null, RULE, "");
            case INTEGRATOR_LAG: return new Advice(1 / (m.gain * tc), 4 * tc, m.tau, RULE, "");
            default: return new Advice(null, null, null, RULE, "NO_SIMC_RULE_FOR_FAMILY");
        }
    }
}
