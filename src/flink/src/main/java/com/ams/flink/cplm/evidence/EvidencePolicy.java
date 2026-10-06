package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmShortFeatureResult;

import java.io.Serializable;

/**
 * v2.5 (2C.1c): which results push their artifacts live. Every window of every branch would be
 * hundreds of MB an hour on a plant; the live path pushes the artifacts of results that carry a
 * finding (any gate not PASS), and any other method run's evidence is rebuilt on demand by an
 * EVIDENCE_RECONSTRUCTION analysis run over exactly its support (2C.2) - the workbench shows
 * PENDING with that action, never an empty chart. Modes: {@code episodes} (default),
 * {@code all} (lab proof), {@code none}. Job argument {@code --evidence-emit}.
 */
public final class EvidencePolicy implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String ARG = "--evidence-emit";

    public enum Mode { EPISODES, ALL, NONE }

    public static final String ARG_MAX_CYCLES = "--evidence-max-cycles";
    public static final int DEFAULT_MAX_CYCLES = 12;
    public static final String ARG_MIN_INTERVAL = "--evidence-min-interval-min";
    public static final int DEFAULT_MIN_INTERVAL_MIN = 60;

    public final Mode mode;
    /** CHG-049: per-cycle G7/G9 artifacts pushed live; <= 0 = every cycle. */
    public final int maxCycles;
    /** CHG-049: Long-job evidence for an unchanged finding is re-emitted at most this often; <= 0 = never throttle. */
    public final long minIntervalMs;

    public EvidencePolicy(Mode mode) {
        this(mode, DEFAULT_MAX_CYCLES);
    }

    public EvidencePolicy(Mode mode, int maxCycles) {
        this(mode, maxCycles, DEFAULT_MIN_INTERVAL_MIN * 60_000L);
    }

    public EvidencePolicy(Mode mode, int maxCycles, long minIntervalMs) {
        this.mode = mode == null ? Mode.EPISODES : mode;
        this.maxCycles = maxCycles;
        this.minIntervalMs = minIntervalMs;
    }

    public static EvidencePolicy fromArgs(String[] args) {
        Mode mode = Mode.EPISODES;
        boolean modeSeen = false;
        int maxCycles = DEFAULT_MAX_CYCLES;
        boolean cyclesSeen = false;
        int minIntervalMin = DEFAULT_MIN_INTERVAL_MIN;
        boolean intervalSeen = false;
        for (int i = 0; i + 1 < args.length; i++) {
            if (!modeSeen && (ARG.equals(args[i]) || ARG.substring(2).equals(args[i]))) {
                modeSeen = true;
                try {
                    mode = Mode.valueOf(args[i + 1].trim().toUpperCase());
                } catch (IllegalArgumentException e) {
                    mode = Mode.EPISODES;
                }
            } else if (!cyclesSeen && (ARG_MAX_CYCLES.equals(args[i]) || ARG_MAX_CYCLES.substring(2).equals(args[i]))) {
                cyclesSeen = true;
                try {
                    maxCycles = Integer.parseInt(args[i + 1].trim());
                } catch (NumberFormatException e) {
                    maxCycles = DEFAULT_MAX_CYCLES;
                }
            } else if (!intervalSeen && (ARG_MIN_INTERVAL.equals(args[i]) || ARG_MIN_INTERVAL.substring(2).equals(args[i]))) {
                intervalSeen = true;
                try {
                    minIntervalMin = Integer.parseInt(args[i + 1].trim());
                } catch (NumberFormatException e) {
                    minIntervalMin = DEFAULT_MIN_INTERVAL_MIN;
                }
            }
        }
        return new EvidencePolicy(mode, maxCycles, minIntervalMin * 60_000L);
    }

    private static boolean finding(String status) {
        return status != null && !"PASS".equals(status) && !"PENDING".equals(status) && !"NOT_EVALUATED".equals(status);
    }

    public boolean emit(CplmShortFeatureResult r) {
        if (mode == Mode.NONE || r == null) return false;
        if (mode == Mode.ALL) return true;
        return finding(r.gate0Status) || finding(r.gate1Status) || finding(r.gate2Status) || finding(r.gate2rStatus)
                || finding(r.gate3Status) || finding(r.gate4Status);
    }

    public boolean emit(CplmLongDiagnosticsResult r) {
        if (mode == Mode.NONE || r == null) return false;
        if (mode == Mode.ALL) return true;
        // CHG-049: G5 is WARN whenever any period exists and G6 whenever peakRatio > 0.5, so alone they are context, not a finding
        return finding(r.gate7Status) || finding(r.gate8Status)
                || finding(r.gate9Status) || finding(r.gate10Status) || finding(r.gate11Status);
    }

    public boolean emit(CplmGateResult r) {
        if (mode == Mode.NONE || r == null) return false;
        if (mode == Mode.ALL) return true;
        return finding(r.gate14Status) || (r.diagnosis != null && !"PASS".equals(r.diagnosis) && !"NO_CALL".equals(r.diagnosis) && !"PENDING".equals(r.diagnosis))
                || (r.healthLanes != null && (r.healthLanes.pvIneligible() || r.healthLanes.anyLimited()));   // CHG-049: a bound lane alone is not a finding
    }
}
