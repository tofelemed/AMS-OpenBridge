package com.ams.flink.cplm.response.event;

import com.ams.flink.cplm.identity.RunIdentity;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** One response event with its capture lifecycle; the input sequence inside the capture is retained, never collapsed (NR-007). */
public final class ResponseEvent implements Serializable {
    private static final long serialVersionUID = 1L;
    public final String eventId;
    public final String loopId;
    public final EventType type;
    public final String pathId;
    public final double t0Ms;
    public double tEndMs;
    public final double preAmplitude, postAmplitude;
    /** Every input change inside the capture as [tMs, value]. */
    public final List<double[]> inputSequence;
    public String captureState = "CANDIDATE";
    public String censorReason = "";

    public ResponseEvent(String eventId, String loopId, EventType type, String pathId, double t0Ms,
                         double preAmplitude, double postAmplitude, List<double[]> inputSequence) {
        this.eventId = eventId;
        this.loopId = loopId;
        this.type = type;
        this.pathId = pathId;
        this.t0Ms = t0Ms;
        this.tEndMs = Double.NaN;
        this.preAmplitude = preAmplitude;
        this.postAmplitude = postAmplitude;
        this.inputSequence = new ArrayList<>(inputSequence);
    }

    /** Deterministic: the same loop, instant, type and configuration name the same event on every run. */
    public static String idFor(String loopId, long t0Ms, EventType type, String bundleHash) {
        return RunIdentity.uuidV5(RunIdentity.NAMESPACE, "event|" + loopId + "|" + t0Ms + "|" + type + "|" + bundleHash).toString();
    }
}
