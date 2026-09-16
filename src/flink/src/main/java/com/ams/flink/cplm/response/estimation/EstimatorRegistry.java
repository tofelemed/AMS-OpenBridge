package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.model.ModelFamily;

/** Legality table family x path x estimator (spec §2.7): unsupported combinations are named, never replaced. */
public final class EstimatorRegistry {
    private EstimatorRegistry() {}

    public static String legality(InputPathResolver.Path path, EventType type, ModelFamily family) {
        if (!family.supported()) return "UNSUPPORTED_MODEL_FAMILY";
        if (path == InputPathResolver.Path.SLAVE_SP_TO_PV) return "CASCADE_MASTER_OP_IS_NOT_AN_APPLIED_INPUT";
        if (type == EventType.ROUTINE_IDENTIFICATION || type == EventType.SERVO_STEP || type == EventType.CASCADE_SP_STEP) {
            return family.integrating() ? "PEM_NOT_INSTALLED_FOR_INTEGRATING" : "PEM_REQUIRED_FOR_CLOSED_LOOP";
        }
        return "OK";
    }

    public static ModelEstimator forPath(InputPathResolver.Path path, EventType type, ModelFamily family) {
        String l = legality(path, type, family);
        if ("PEM_REQUIRED_FOR_CLOSED_LOOP".equals(l)) return new ClosedLoopPemEstimator();
        if (!"OK".equals(l)) return null;
        return family.integrating() ? new IntegratingEstimator() : new OutputErrorEstimator();
    }
}
