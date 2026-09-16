package com.ams.flink.cplm.response.controller;

/** Parallel <-> ideal only, with units and signs; series/interactive has no universal identity (spec §2.9). */
public final class ControllerFormAdapter {
    public static final String VERSION = "FORM_ADAPTER_1.0";

    public static final class UnsupportedFormException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public UnsupportedFormException(String form) {
            super("UNSUPPORTED_FORM:" + form);
        }
    }

    private ControllerFormAdapter() {}

    /** Ideal Kc / Ti / Td from a snapshot; PARALLEL: Kc = Kp, Ti = Kp/Ki, Td = Kd/Kp. */
    public static ControllerSnapshot toIdeal(ControllerSnapshot s) {
        if ("IDEAL".equals(s.form)) return s;
        if (!"PARALLEL".equals(s.form)) throw new UnsupportedFormException(s.form);
        double kc = s.kpC;
        Double ti = s.kiC == null || s.kiC == 0 ? null : kc / s.kiC;
        Double td = s.kdC == null ? null : s.kdC / kc;
        return new ControllerSnapshot("IDEAL", kc, ti, td, s.kpC, s.kiC, s.kdC, s.scanS, s.derivativeFilter, s.action, VERSION);
    }
}
