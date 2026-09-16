package com.ams.flink.cplm.response.controller;

import java.io.Serializable;

/** Configured controller settings as READ metadata (spec §2.9): never estimated from a trace. */
public final class ControllerSnapshot implements Serializable {
    private static final long serialVersionUID = 1L;
    /** PARALLEL | IDEAL | SERIES | UNKNOWN. */
    public final String form;
    public final Double kc, ti, td, kpC, kiC, kdC, scanS, derivativeFilter;
    public final String action, adapterVersion;

    ControllerSnapshot(String form, Double kc, Double ti, Double td, Double kpC, Double kiC, Double kdC, Double scanS,
                       Double derivativeFilter, String action, String adapterVersion) {
        this.form = form;
        this.kc = kc;
        this.ti = ti;
        this.td = td;
        this.kpC = kpC;
        this.kiC = kiC;
        this.kdC = kdC;
        this.scanS = scanS;
        this.derivativeFilter = derivativeFilter;
        this.action = action;
        this.adapterVersion = adapterVersion;
    }

    public static ControllerSnapshot ideal(double kc, Double tiS, Double tdS, double scanS, String action) {
        return new ControllerSnapshot("IDEAL", kc, tiS, tdS, null, null, null, scanS, null, action, "NATIVE");
    }

    public static ControllerSnapshot parallel(double kp, Double ki, Double kd, double scanS, String action) {
        return new ControllerSnapshot("PARALLEL", null, null, null, kp, ki, kd, scanS, null, action, "NATIVE");
    }

    public static ControllerSnapshot series(double kc, Double tiS, Double tdS, double scanS) {
        return new ControllerSnapshot("SERIES", kc, tiS, tdS, null, null, null, scanS, null, "DIRECT", "NATIVE");
    }

    public static ControllerSnapshot unknown() {
        return new ControllerSnapshot("UNKNOWN", null, null, null, null, null, null, null, null, "UNKNOWN", "NONE");
    }

    public boolean known() {
        return "IDEAL".equals(form) || "PARALLEL".equals(form);
    }
}
