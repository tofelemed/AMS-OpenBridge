package com.ams.flink.cplm.response.event;

/** Spec v6 §2.4 event vocabulary. */
public enum EventType {
    SERVO_STEP, CASCADE_SP_STEP, LOAD_RESPONSE, UNMEASURED_DISTURBANCE_RESPONSE, INPUT_TEST, RAMP_TRACKING, ROUTINE_IDENTIFICATION
}
