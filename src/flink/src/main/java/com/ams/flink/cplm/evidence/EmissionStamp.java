package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.identity.RunIdentity;

import java.util.List;

/**
 * CHG-102 phase 5a: why an artifact was emitted, in its provenance. A FINDING artifact passed the policy and the
 * throttle; a BOUNDARY artifact is the record every loop gets at each plant-local 00:00 (24h, 12h) and 12:00 (12h),
 * and carries the boundary's kind, zone, local end and a set id shared by all artifacts of that loop/kind/end.
 * Provenance travels in the manifest only; the sha256 covers the encoded columns, so none of this moves a checksum.
 */
public final class EmissionStamp {
    public static final String REASON = "emission_reason";
    public static final String FINDING = "FINDING";
    public static final String BOUNDARY = "BOUNDARY";

    private EmissionStamp() {}

    /** Deterministic: v5 of "boundary|loop|kind|endMs", so a replayed boundary is the same set. */
    public static String boundarySetId(String loopId, String windowKind, long windowEndMs) {
        return RunIdentity.uuidV5(RunIdentity.NAMESPACE, "boundary|" + loopId + "|" + windowKind + "|" + windowEndMs).toString();
    }

    public static void stamp(List<EvidenceArtifact> artifacts, boolean boundary, String loopId, String windowKind,
                             long windowEndMs, PlantClock clock) {
        if (artifacts == null) return;
        String setId = boundary ? boundarySetId(loopId, windowKind, windowEndMs) : null;
        String localEnd = boundary ? clock.localIso(windowEndMs) : null;
        for (EvidenceArtifact a : artifacts) {
            a.provenance.put(REASON, boundary ? BOUNDARY : FINDING);
            if (!boundary) continue;
            a.provenance.put("boundary_kind", windowKind);
            a.provenance.put("plant_tz", clock.zone.getId());
            a.provenance.put("boundary_local_end", localEnd);
            a.provenance.put("boundary_set_id", setId);
        }
    }
}
