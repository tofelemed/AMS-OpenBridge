package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.condition.ConditionEvent;
import com.ams.flink.cplm.health.LoopHealthContextRecord;

import java.io.Serializable;

/**
 * v2.5 Task 1H.5: the fusion join has one keyed side input, but two context streams feed it -
 * the fast-path conditions (1D.5) and the Instrumental health contexts (1H). Both are keyed by
 * loop id, so they are unioned into this envelope; exactly one member is set.
 */
public final class FusionSideInput implements Serializable {
    private static final long serialVersionUID = 1L;

    public ConditionEvent condition;
    public LoopHealthContextRecord health;

    public FusionSideInput() {}

    public static FusionSideInput of(ConditionEvent c) {
        FusionSideInput s = new FusionSideInput();
        s.condition = c;
        return s;
    }

    public static FusionSideInput of(LoopHealthContextRecord h) {
        FusionSideInput s = new FusionSideInput();
        s.health = h;
        return s;
    }

    public String loopId() {
        if (condition != null) return condition.loopId;
        if (health != null) return health.loopId;
        return "";
    }
}
