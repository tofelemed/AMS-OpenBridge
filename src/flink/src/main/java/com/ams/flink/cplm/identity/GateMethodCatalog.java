package com.ams.flink.cplm.identity;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The INSTALLED method behind each gate (v2.5): its id and version are part of every
 * method_run_id, so a method change is a new run identity, not a silent re-labelling (R26).
 * Versions move when a formula moves (1D.2: G2/G4, 1D.3: G10/G11, 1E.1: G8 role, G14, G15).
 * G12 and G13 are legacy flags in this release (Phase 2 installs real methods).
 */
public final class GateMethodCatalog {
    public static final List<String> GATES = Collections.unmodifiableList(java.util.Arrays.asList(
            "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15"));

    private static final Map<String, String[]> METHODS = new LinkedHashMap<>();

    static {
        put("G0", "G0.DATA_QUALIFICATION", "1.1");          // 1B.2: UNKNOWN != GOOD, non-finite rejected
        put("G1", "G1.MODE_AUTHORITY", "1.0");
        put("G2", "G2.SP_STABILITY_BAND", "2.0");           // 1D.2: EU objective / span fraction policy
        put("G2r", "G2r.OPERATING_REGION", "1.0");
        put("G3", "G3.OBJECTIVE_ERROR", "1.0");
        put("G4", "G4.ACTUATOR_ACTIVITY", "2.0");           // 1D.2: profile thresholds, dimensionless ratio
        put("G5", "G5.ACF_OSCILLATION", "1.0");
        put("G6", "G6.FFT_SPECTRAL", "1.0");
        put("G7", "G7.SINE_TRIANGLE_SHAPE", "1.0");
        put("G8", "XCORR_ASYMMETRY_V1", "1.0");             // 1E.1: named for what it is; SUPPORTING only
        put("G9", "G9.PHASE_GEOMETRY", "1.0");
        put("G10", "G10.LIMIT_DWELL", "2.0");               // 1D.3: declared range, seconds, episodes
        put("G11", "G11.FREEZE_EPISODES", "2.0");           // 1D.3: episodes retained, material-only exclusion
        put("G12", "G12.STEP_TEST_FLAG", "legacy");
        put("G13", "G13.PEER_LINK_FLAG", "legacy");
        put("G14", "G14.VP_NONFOLLOWING_CONFIRMATION", "2.0");   // 1E.1: fault-scoped, measured
        put("G15", "G15.EVIDENCE_FUSION", "2.0");           // 1E.1: observations / hypotheses / confirmation
    }

    private GateMethodCatalog() {
    }

    private static void put(String gate, String id, String version) {
        METHODS.put(gate, new String[]{id, version});
    }

    public static String methodId(String gate) {
        String[] m = METHODS.get(gate);
        return m == null ? gate : m[0];
    }

    public static String methodVersion(String gate) {
        String[] m = METHODS.get(gate);
        return m == null ? "unknown" : m[1];
    }
}
