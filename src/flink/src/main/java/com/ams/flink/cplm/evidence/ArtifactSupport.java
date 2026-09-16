package com.ams.flink.cplm.evidence;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v2.5 (2C.1c): shared helpers for the per-gate artifact builders - categorical columns as codes
 * with a legend, sample-time axes, joined lists for provenance, and the window / identity stamp
 * every artifact carries. Field names are the workbook's (xlsx_Gate_evidence.tsv) and nothing
 * here derives a series from a summary.
 */
final class ArtifactSupport {
    static final String MS_EPOCH = "ms_epoch";
    static final String NOT_MAPPED = "NOT_MAPPED";

    private ArtifactSupport() {}

    /** A categorical column: labels are assigned codes in first-seen order, the legend follows. */
    static final class Coder {
        private final Map<String, Integer> codes = new LinkedHashMap<>();
        private final double[] values;

        Coder(int n) {
            values = new double[n];
        }

        void put(int i, String label) {
            String key = label == null || label.isEmpty() ? "NONE" : label;
            Integer c = codes.get(key);
            if (c == null) {
                c = codes.size();
                codes.put(key, c);
            }
            values[i] = c;
        }

        double[] values() { return values; }

        String[] labels() { return codes.keySet().toArray(new String[0]); }

        void attach(EvidenceArtifact a, String name) {
            a.codedColumn(name, values, labels());
        }

        String legend() {
            String[] labels = labels();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < labels.length; i++) sb.append(i == 0 ? "" : ";").append(i).append('=').append(labels[i]);
            return sb.toString();
        }
    }

    static double[] times(long[] tsMs) {
        double[] t = new double[tsMs.length];
        for (int i = 0; i < t.length; i++) t[i] = tsMs[i];
        return t;
    }

    static double[] flags(boolean[] b) {
        double[] v = new double[b == null ? 0 : b.length];
        for (int i = 0; i < v.length; i++) v[i] = b[i] ? 1.0 : 0.0;
        return v;
    }

    static double[] of(int[] ints) {
        double[] v = new double[ints == null ? 0 : ints.length];
        for (int i = 0; i < v.length; i++) v[i] = ints[i];
        return v;
    }

    static double[] nan(int n) {
        double[] v = new double[n];
        java.util.Arrays.fill(v, Double.NaN);
        return v;
    }

    static double[] ordinal(int n) {
        double[] v = new double[n];
        for (int i = 0; i < n; i++) v[i] = i;
        return v;
    }

    static String join(List<?> items) {
        if (items == null || items.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Object o : items) sb.append(sb.length() == 0 ? "" : ";").append(o);
        return sb.toString();
    }

    static String join(int[] items) {
        List<Integer> l = new ArrayList<>();
        if (items != null) for (int v : items) l.add(v);
        return join(l);
    }

    /** The window and identity every artifact of a windowed result carries. */
    static void stamp(EvidenceArtifact a, String loopId, String windowKind, long windowStartMs, long windowEndMs, String bundleHash, String datasetHash) {
        a.provenance.put("loop_id", loopId);
        a.provenance.put("window_kind", windowKind);
        a.provenance.put("window_start_ms", windowStartMs);
        a.provenance.put("window_end_ms", windowEndMs);
        a.provenance.put("bundle_hash", bundleHash);
        a.provenance.put("dataset_hash", datasetHash);
    }

    /** A record artifact: no series, every field in provenance (G13 capability, G14/G15 decision records). */
    static EvidenceArtifact record(String methodRunId, String gate, String kind, String roleOrPath) {
        return EvidenceArtifact.series(methodRunId, gate, kind, roleOrPath, "none", "none", "none", "none", new double[0], new double[0], null);
    }
}
