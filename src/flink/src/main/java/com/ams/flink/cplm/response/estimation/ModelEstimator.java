package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;

import java.util.Set;

/** An estimation adapter (spec §2.7): declares what it supports and names its method and version. */
public interface ModelEstimator {
    EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s);

    Set<ModelFamily> supportedFamilies();

    String methodId();

    String methodVersion();
}
