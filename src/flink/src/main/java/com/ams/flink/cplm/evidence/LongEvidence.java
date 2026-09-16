package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.engine.LimitMath;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 1G.3: the evidence artifacts the long stage can already emit honestly - the G10
 * limit-dwell and G11 freeze EPISODE tables computed by LimitMath (1D.3). Each row is one
 * episode: x = start time (ms since epoch), y = duration (s); the G10 mask marks the HIGH side.
 * Nothing here is derived from a summary. Phase 2 (2C.1) adds the per-gate series (ACF, PSD,
 * cycle fits, geometry ...) through the same transport.
 */
public final class LongEvidence {
    private LongEvidence() {
    }

    public static List<EvidenceArtifact> artifacts(CplmLongDiagnosticsResult r) {
        List<EvidenceArtifact> out = new ArrayList<>();
        if (r == null || r.methodRunIds == null) return out;
        String g10 = r.methodRunIds.get("G10");
        if (g10 != null && r.dwellEvents != null && !r.dwellEvents.isEmpty()) {
            int n = r.dwellEvents.size();
            double[] x = new double[n];
            double[] y = new double[n];
            boolean[] high = new boolean[n];
            for (int i = 0; i < n; i++) {
                LimitMath.DwellEvent e = r.dwellEvents.get(i);
                x[i] = e.startMs;
                y[i] = e.durationS;
                high[i] = "HIGH".equalsIgnoreCase(e.side);
            }
            EvidenceArtifact a = EvidenceArtifact.series(g10, "G10", "DWELL_EVENTS", "OP",
                    "start_time", "ms_epoch", "duration", "s", x, y, high);
            stampProvenance(a, r, "mask=side_high");
            out.add(a);
        }
        String g11 = r.methodRunIds.get("G11");
        if (g11 != null && r.freezeEvents != null && !r.freezeEvents.isEmpty()) {
            int n = r.freezeEvents.size();
            double[] x = new double[n];
            double[] y = new double[n];
            for (int i = 0; i < n; i++) {
                LimitMath.FreezeEvent e = r.freezeEvents.get(i);
                x[i] = e.startMs;
                y[i] = e.durationS;
            }
            EvidenceArtifact a = EvidenceArtifact.series(g11, "G11", "FREEZE_EVENTS", "PV",
                    "start_time", "ms_epoch", "duration", "s", x, y, null);
            stampProvenance(a, r, "");
            out.add(a);
        }
        return out;
    }

    private static void stampProvenance(EvidenceArtifact a, CplmLongDiagnosticsResult r, String note) {
        a.provenance.put("loop_id", r.loopId);
        a.provenance.put("window_kind", r.windowKind);
        a.provenance.put("window_start_ms", r.windowStartMs);
        a.provenance.put("window_end_ms", r.windowEndMs);
        a.provenance.put("bundle_hash", r.bundleHash);
        a.provenance.put("dataset_hash", r.datasetHash);
        if (!note.isEmpty()) a.provenance.put("note", note);
    }
}
