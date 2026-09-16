package com.ams.flink.cplm.response.model;

/** Spec v6 §2.6 model bank. Unsupported extensions are capability STATES, never silently replaced by FOPDT. */
public enum ModelFamily {
    FOPDT(true, false), SOPDT(true, false), SO_UNDERDAMPED(true, false), IPDT(true, true), INTEGRATOR_LAG(true, true),
    UNSUPPORTED_INVERSE(false, false), UNSUPPORTED_UNSTABLE(false, false), UNSUPPORTED_MIMO(false, false);

    private final boolean supported;
    private final boolean integrating;

    ModelFamily(boolean supported, boolean integrating) {
        this.supported = supported;
        this.integrating = integrating;
    }

    public boolean supported() { return supported; }

    public boolean integrating() { return integrating; }
}
