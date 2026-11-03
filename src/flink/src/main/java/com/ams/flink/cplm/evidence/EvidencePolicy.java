package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmShortFeatureResult;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Serializable;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

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
    /** CHG-102 phase 5a: the plant's zone (PlantClock.parse); boundary evidence lands on its local 00:00 / 12:00. */
    public static final String ARG_PLANT_TZ = "--plant-time-zone";
    /** CHG-102 phase 5a: window kinds that emit at every plant boundary; an empty value switches boundary emission off. */
    public static final String ARG_BOUNDARY_KINDS = "--evidence-boundary-kinds";
    public static final String DEFAULT_BOUNDARY_KINDS = "12h,24h";
    private static final Logger LOG = LoggerFactory.getLogger(EvidencePolicy.class);

    public final Mode mode;
    /** CHG-049: per-cycle G7/G9 artifacts pushed live; <= 0 = every cycle. */
    public final int maxCycles;
    /** CHG-049: Long-job evidence for an unchanged finding is re-emitted at most this often; <= 0 = never throttle. */
    public final long minIntervalMs;
    /** CHG-102 phase 5a: the plant clock and the kinds that emit at its boundaries regardless of the throttle. */
    public final PlantClock plantClock;
    public final Set<String> boundaryKinds;

    public EvidencePolicy(Mode mode) {
        this(mode, DEFAULT_MAX_CYCLES);
    }

    public EvidencePolicy(Mode mode, int maxCycles) {
        this(mode, maxCycles, DEFAULT_MIN_INTERVAL_MIN * 60_000L);
    }

    public EvidencePolicy(Mode mode, int maxCycles, long minIntervalMs) {
        this(mode, maxCycles, minIntervalMs, PlantClock.utc(), parseKinds(DEFAULT_BOUNDARY_KINDS));
    }

    public EvidencePolicy(Mode mode, int maxCycles, long minIntervalMs, PlantClock plantClock, Set<String> boundaryKinds) {
        this.mode = mode == null ? Mode.EPISODES : mode;
        this.maxCycles = maxCycles;
        this.minIntervalMs = minIntervalMs;
        this.plantClock = plantClock == null ? PlantClock.utc() : plantClock;
        this.boundaryKinds = boundaryKinds == null ? Collections.emptySet() : Collections.unmodifiableSet(new LinkedHashSet<>(boundaryKinds));
    }

    /** "12h,24h" -> {12h, 24h}; blank, "none" or "off" -> empty (boundary emission off). */
    public static Set<String> parseKinds(String csv) {
        Set<String> out = new LinkedHashSet<>();
        if (csv == null) return out;
        String t = csv.trim();
        if (t.isEmpty() || "none".equalsIgnoreCase(t) || "off".equalsIgnoreCase(t)) return out;
        for (String k : t.split(",")) if (!k.trim().isEmpty()) out.add(k.trim().toLowerCase(java.util.Locale.ROOT));
        return out;
    }

    /** CHG-102 phase 5a: true when this window end is a plant boundary for a configured kind. Mode NONE emits nothing at all. */
    public boolean boundary(String windowKind, long windowEndMs) {
        if (mode == Mode.NONE || windowKind == null || !boundaryKinds.contains(windowKind)) return false;
        return plantClock.isBoundary(windowKind, windowEndMs);
    }

    public static EvidencePolicy fromArgs(String[] args) {
        Mode mode = Mode.EPISODES;
        boolean modeSeen = false;
        int maxCycles = DEFAULT_MAX_CYCLES;
        boolean cyclesSeen = false;
        int minIntervalMin = DEFAULT_MIN_INTERVAL_MIN;
        boolean intervalSeen = false;
        String tzSpec = null;
        String kinds = null;
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
            } else if (tzSpec == null && (ARG_PLANT_TZ.equals(args[i]) || ARG_PLANT_TZ.substring(2).equals(args[i]))) {
                tzSpec = args[i + 1];
            } else if (kinds == null && (ARG_BOUNDARY_KINDS.equals(args[i]) || ARG_BOUNDARY_KINDS.substring(2).equals(args[i]))) {
                kinds = args[i + 1];
            }
        }
        PlantClock clock = plantClock(tzSpec);
        Set<String> boundaryKinds = parseKinds(kinds == null ? DEFAULT_BOUNDARY_KINDS : kinds);
        String warning = clock.quarterHourWarning(Instant.now());
        if (warning != null && !boundaryKinds.isEmpty()) LOG.warn("CHG-102: {}", warning);
        LOG.info("CHG-102: evidence emit={} plant time zone={} ({}) boundary kinds={}", mode, clock.spec, clock.zone, boundaryKinds);
        return new EvidencePolicy(mode, maxCycles, minIntervalMin * 60_000L, clock, boundaryKinds);
    }

    /**
     * An unknown zone FAILS the submit (this runs in main, never on a restart): cplm-api refuses the same value at startup,
     * and a silent UTC fallback would put the archived evidence days and the KPI days on different boundaries.
     */
    static PlantClock plantClock(String spec) {
        if (spec == null || spec.trim().isEmpty()) return PlantClock.utc();
        return PlantClock.parse(spec);
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
        return finding(r.gate14Status) || isFaultDiagnosis(r.diagnosis)
                || (r.healthLanes != null && (r.healthLanes.pvIneligible() || r.healthLanes.anyLimited()));   // CHG-049: a bound lane alone is not a finding
    }

    /**
     * CHG-049 (Task 10): mirrors cplm-api EventFrameLifecycle.Classify - blank, EXCLUDED* and INSUFFICIENT_DATA are
     * Unobservable, INSUFFICIENT_EVIDENCE and NO_CALL are Clear, everything else is a Fault that opens an episode.
     * PASS and PENDING are not faults either. Evidence for a verdict that never opens an episode is swept unread.
     */
    private static boolean isFaultDiagnosis(String d) {
        if (d == null || d.trim().isEmpty()) return false;
        if (d.startsWith("EXCLUDED") || "INSUFFICIENT_DATA".equals(d)) return false;
        if ("INSUFFICIENT_EVIDENCE".equals(d) || "NO_CALL".equals(d)) return false;
        return !"PASS".equals(d) && !"PENDING".equals(d);
    }
}
