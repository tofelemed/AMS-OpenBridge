package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;

import java.util.EnumSet;
import java.util.Set;

/**
 * Integrating paths (spec §2.6): the slope change per applied-input change on the actual delayed
 * input, with the baseline drift v0 as a nuisance parameter - seeded from the slope change and
 * refined by the same bounded OE machinery. A static Kp is never reported: ProcessModel.parameters()
 * says INTEGRATING_OR_NOT_IDENTIFIABLE.
 */
public final class IntegratingEstimator implements ModelEstimator {
    public static final String METHOD_ID = "INTEGRATING_SLOPE_OE";
    public static final String METHOD_VERSION = "1.0.0";
    private final OutputErrorEstimator oe = new OutputErrorEstimator();

    @Override
    public Set<ModelFamily> supportedFamilies() {
        return EnumSet.of(ModelFamily.IPDT, ModelFamily.INTEGRATOR_LAG);
    }

    @Override
    public String methodId() { return METHOD_ID; }

    @Override
    public String methodVersion() { return METHOD_VERSION; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        if (!supportedFamilies().contains(family)) return EstimationResult.none(EstimationResult.State.UNSUPPORTED, "NOT_AN_INTEGRATING_FAMILY");
        return oe.estimate(d, u0, family, s);
    }
}
