package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.identity.RunIdentity;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * v2.5 Task 1G.2 (spec v6 R12 / §3): one evidence artifact of a method run - the exact
 * intermediate the method computed (an ACF, a spectrum, a per-cycle fit, an episode table),
 * with its quantities and units, a mask of what was accepted, and provenance. Never a
 * summary-derived series. The evidence id is deterministic (v5 of method_run_id + kind + role),
 * so a redelivered artifact is the same artifact.
 */
public final class EvidenceArtifact implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final int DEFAULT_DISPLAY_POINTS = 2_000;

    public String evidenceId;
    public String methodRunId;
    public String gate;
    /** e.g. ACF_SERIES, PSD, CYCLE_FIT, DWELL_EVENTS, FREEZE_EVENTS, VP_TRACKING */
    public String kind;
    /** The signal role or path the artifact is about (PV, OP, OP_TO_PV, ...). */
    public String roleOrPath;
    public String xQuantity;
    public String xUnit;
    public String yQuantity;
    public String yUnit;
    public double[] x;
    public double[] y;
    /** Optional: true where the point was accepted by the method. */
    public boolean[] mask;
    public Map<String, Object> provenance = new LinkedHashMap<>();

    public EvidenceArtifact() {
    }

    public static EvidenceArtifact series(String methodRunId, String gate, String kind, String roleOrPath,
                                          String xQuantity, String xUnit, String yQuantity, String yUnit,
                                          double[] x, double[] y, boolean[] mask) {
        if (x == null || y == null || x.length != y.length) {
            throw new IllegalArgumentException("x and y must be present and the same length");
        }
        if (mask != null && mask.length != x.length) throw new IllegalArgumentException("mask length");
        EvidenceArtifact a = new EvidenceArtifact();
        a.methodRunId = methodRunId;
        a.gate = gate;
        a.kind = kind;
        a.roleOrPath = roleOrPath;
        a.xQuantity = xQuantity;
        a.xUnit = xUnit;
        a.yQuantity = yQuantity;
        a.yUnit = yUnit;
        a.x = x;
        a.y = y;
        a.mask = mask;
        a.evidenceId = RunIdentity.uuidV5(RunIdentity.NAMESPACE,
                "evidence|" + methodRunId + "|" + kind + "|" + (roleOrPath == null ? "" : roleOrPath)).toString();
        return a;
    }

    public int calculationSamples() {
        return x == null ? 0 : x.length;
    }

    /** What a chart may show without pretending it is the calculation: bounded, never a replacement. */
    public int displayPoints() {
        return Math.min(calculationSamples(), DEFAULT_DISPLAY_POINTS);
    }

    public int columnCount() {
        return mask == null ? 2 : 3;
    }

    public String[] columns() {
        return mask == null ? new String[]{"x", "y"} : new String[]{"x", "y", "mask"};
    }
}
