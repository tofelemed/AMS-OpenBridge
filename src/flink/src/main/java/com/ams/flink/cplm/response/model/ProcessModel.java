package com.ams.flink.cplm.response.model;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * An immutable path model (spec §2.6). Parameters that do not exist for the family are NaN and are
 * reported as unavailable quantities with the catalogue's reason - a static gain is never invented
 * for an integrating path. Units: gain PV_EU/input_EU (self-regulating) or PV_EU/(input_EU*s)
 * (integrating), times in seconds, wn in rad/s, zeta dimensionless.
 */
public final class ProcessModel implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String GAIN_UNIT = "PV_EU/input_EU";
    public static final String INTEGRATING_GAIN_UNIT = "PV_EU/(input_EU*s)";

    public final ModelFamily family;
    public final String pathId;
    /** Kp (self-regulating) or Ki_process (integrating). */
    public final double gain;
    /** Dead time, s, >= 0. */
    public final double theta;
    /** FOPDT tau, SOPDT slower pole tau1, integrator-lag tau; NaN otherwise. */
    public final double tau;
    /** SOPDT faster pole tau2; NaN otherwise. */
    public final double tau2;
    /** Underdamped only. */
    public final double zeta;
    /** Underdamped only, rad/s. */
    public final double wn;

    private ProcessModel(ModelFamily family, String pathId, double gain, double theta, double tau, double tau2, double zeta, double wn) {
        if (!family.supported()) throw new IllegalArgumentException(family + " has no model instance");
        if (theta < 0 || !Double.isFinite(theta)) throw new IllegalArgumentException("theta must be >= 0");
        this.family = family;
        this.pathId = pathId;
        this.gain = gain;
        this.theta = theta;
        this.tau = tau;
        this.tau2 = tau2;
        this.zeta = zeta;
        this.wn = wn;
    }

    public static ProcessModel fopdt(String path, double kp, double theta, double tau) {
        if (!(tau > 0)) throw new IllegalArgumentException("tau must be > 0");
        return new ProcessModel(ModelFamily.FOPDT, path, kp, theta, tau, Double.NaN, Double.NaN, Double.NaN);
    }

    /** Real-pole SOPDT; poles are ORDERED (tau1 >= tau2) so the label is unambiguous (§2.6). */
    public static ProcessModel sopdt(String path, double kp, double theta, double tauA, double tauB) {
        if (!(tauA > 0) || !(tauB > 0)) throw new IllegalArgumentException("time constants must be > 0");
        return new ProcessModel(ModelFamily.SOPDT, path, kp, theta, Math.max(tauA, tauB), Math.min(tauA, tauB), Double.NaN, Double.NaN);
    }

    public static ProcessModel underdamped(String path, double kp, double theta, double zeta, double wn) {
        if (!(zeta > 0 && zeta < 1) || !(wn > 0)) throw new IllegalArgumentException("need 0 < zeta < 1 and wn > 0");
        return new ProcessModel(ModelFamily.SO_UNDERDAMPED, path, kp, theta, Double.NaN, Double.NaN, zeta, wn);
    }

    public static ProcessModel ipdt(String path, double ki, double theta) {
        return new ProcessModel(ModelFamily.IPDT, path, ki, theta, Double.NaN, Double.NaN, Double.NaN, Double.NaN);
    }

    public static ProcessModel integratorLag(String path, double ki, double theta, double tau) {
        if (!(tau > 0)) throw new IllegalArgumentException("tau must be > 0");
        return new ProcessModel(ModelFamily.INTEGRATOR_LAG, path, ki, theta, tau, Double.NaN, Double.NaN, Double.NaN);
    }

    public boolean integrating() { return family.integrating(); }

    /** Order of the state-space realisation. */
    public int order() {
        switch (family) {
            case FOPDT:
            case IPDT:
                return 1;
            default:
                return 2;
        }
    }

    /** Catalogue-named parameters with units; missing ones are unavailable WITH the catalogue reason. */
    public Map<String, Quantity> parameters() {
        Map<String, Quantity> p = new LinkedHashMap<>();
        String method = "MODEL_" + family.name();
        if (integrating()) {
            p.put("process_gain", Quantity.unavailable("process_gain", GAIN_UNIT, "INTEGRATING_OR_NOT_IDENTIFIABLE"));
            p.put("integrating_gain", Quantity.of("integrating_gain", gain, INTEGRATING_GAIN_UNIT, method));
        } else {
            p.put("process_gain", Quantity.of("process_gain", gain, GAIN_UNIT, method));
            p.put("integrating_gain", Quantity.unavailable("integrating_gain", INTEGRATING_GAIN_UNIT, "NOT_INTEGRATING_OR_NOT_IDENTIFIABLE"));
        }
        p.put("dead_time", Quantity.of("dead_time", theta, "s", method));
        switch (family) {
            case FOPDT:
                p.put("time_constant", Quantity.of("time_constant", tau, "s", method));
                break;
            case SOPDT:
                p.put("time_constant_1", Quantity.of("time_constant_1", tau, "s", method));
                p.put("time_constant_2", Quantity.of("time_constant_2", tau2, "s", method));
                break;
            case SO_UNDERDAMPED:
                p.put("damping_ratio", Quantity.of("damping_ratio", zeta, "dimensionless", method));
                p.put("natural_frequency", Quantity.of("natural_frequency", wn, "rad/s", method));
                break;
            case INTEGRATOR_LAG:
                p.put("time_constant", Quantity.of("time_constant", tau, "s", method));
                break;
            default:
                break;
        }
        return p;
    }

    @Override
    public String toString() {
        return family + "(" + pathId + ": gain=" + gain + ", theta=" + theta + ", tau=" + tau + ", tau2=" + tau2 + ", zeta=" + zeta + ", wn=" + wn + ")";
    }
}
