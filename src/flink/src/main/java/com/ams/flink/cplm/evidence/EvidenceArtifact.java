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
    /** v2.5 (2C.1c): further per-sample columns by the workbook's field name, each aligned to x. */
    public Map<String, double[]> columns = new LinkedHashMap<>();
    /** Unit per extra column (a coded categorical column has unit "code" and a legend). */
    public Map<String, String> columnUnits = new LinkedHashMap<>();
    /** Legend of a coded column: "0=LABEL;1=LABEL;..." - strings never ride the payload, codes do. */
    public Map<String, String> legends = new LinkedHashMap<>();
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

    /** Adds a numeric per-sample column (workbook field name, unit, values aligned to x). */
    public EvidenceArtifact column(String name, String unit, double[] values) {
        if (values == null || values.length != calculationSamples()) throw new IllegalArgumentException("column " + name + " length");
        columns.put(name, values);
        columnUnits.put(name, unit);
        return this;
    }

    /** Adds a categorical per-sample column as codes with its legend (index -> label). */
    public EvidenceArtifact codedColumn(String name, double[] codes, String[] labels) {
        column(name, "code", codes);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < labels.length; i++) sb.append(i == 0 ? "" : ";").append(i).append('=').append(labels[i]);
        legends.put(name, sb.toString());
        return this;
    }

    public int columnCount() {
        return (mask == null ? 2 : 3) + columns.size();
    }

    public String[] columns() {
        String[] out = new String[columnCount()];
        int k = 0;
        out[k++] = "x";
        out[k++] = "y";
        if (mask != null) out[k++] = "mask";
        for (String name : columns.keySet()) out[k++] = name;
        return out;
    }
}
