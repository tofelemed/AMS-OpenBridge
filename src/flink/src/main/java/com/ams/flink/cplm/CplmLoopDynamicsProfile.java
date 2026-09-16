package com.ams.flink.cplm;

import java.io.Serializable;
import java.util.Locale;

/**
 * Loop-dynamics profile for CPLM (calculation v3.0.0).
 * Values resolve from the governed pack {@code cplm/loop-dynamics-profiles.yaml}
 * with an embedded fallback table identical to the shipped defaults.
 *
 * <p>v3 adds dynamic class, gate roles, stiction multi-evidence policy, operating-region
 * bands, pressure splits (liquid / gas / vapour), and temporal persistence knobs.
 */
public final class CplmLoopDynamicsProfile implements Serializable {

    public static final String CALCULATION_VERSION = "3.0.0";
    public static final String DYNAMICS_PROFILE_VERSION = "2.0.0";

    /** ISA-ish controller class / gate pack key. PIC = liquid-fast pressure (alias). */
    public enum LoopClass {
        FIC, PIC, PIC_GAS, PIC_VAPOUR, LIC, TIC, UNKNOWN
    }

    public enum DynamicClass {
        FAST_SELF_REG, SLOW_SELF_REG, INTEGRATING, NEAR_INTEGRATING
    }

    public enum ServiceObjective {
        TIGHT, AVERAGING, CONSTRAINT, QUALITY
    }

    public enum GateRole {
        BLOCKING, PRIMARY, SUPPORTING, DISPLAY_ONLY
    }

    public enum ProfileSource {
        OVERRIDE, LOOP_TYPE, INFERRED, UNKNOWN
    }

    public LoopClass loopClass = LoopClass.UNKNOWN;
    public ProfileSource profileSource = ProfileSource.UNKNOWN;
    public String dynamicsProfileVersion = DYNAMICS_PROFILE_VERSION;
    public String calculationVersion = CALCULATION_VERSION;
    public String gateProfileId = "UNKNOWN";
    public DynamicClass dynamicClass = DynamicClass.FAST_SELF_REG;
    public ServiceObjective serviceObjective = ServiceObjective.TIGHT;

    public double tauMinS;
    public double tauMaxS;
    public int minSamplesPerPeriod;
    public int minValidCycles;
    public double cornerAngleDeg;
    public double opDeadbandPct;
    /** v2.5 (R03): a held VP older than this is not evidence (seconds). */
    public static final double VP_MAX_AGE_S_DEFAULT = 60.0;
    public double vpMaxAgeS = VP_MAX_AGE_S_DEFAULT;
    public double opTravelFloorPct;
    public double effortRatioFloor;
    public double phaseAreaPerCycleLo;
    public double phaseAreaPerCycleHi;
    public double priorStiction = 1.0;
    public double priorOscillation = 1.0;
    public double priorEffort = 1.0;
    public double priorGeometry = 1.0;
    public boolean integrating;
    public boolean geometryFamilyEnabled = true;
    public String pvFilterType = "ewma";
    public int pvFilterWindow = 5;
    public double acfRegularityMin = 0.10;
    public double fftPeakToMedianMin = 3.0;

    // --- v3 gate roles & stiction policy ---
    public GateRole geometryRole = GateRole.SUPPORTING;
    public GateRole shapeRole = GateRole.PRIMARY;
    public GateRole horchRole = GateRole.SUPPORTING;
    public GateRole saturationRole = GateRole.PRIMARY;
    public boolean requireOscillationForStiction = true;
    public int minNonGeometryEvidences = 2;
    public boolean geometryAloneForbidden = true;

    // --- operating region / service thresholds ---
    public double regionPvMin = Double.NEGATIVE_INFINITY;
    public double regionPvMax = Double.POSITIVE_INFINITY;
    public double regionOpMin = 0.0;
    public double regionOpMax = 100.0;
    /**
     * v2.5 R06 - the G2 stability band is a POLICY, not a universal 1 EU:
     * {@link #spStabilityBandPvEu} when an objective is commissioned in PV EU, otherwise
     * {@link #spStabilityBandSpanFraction} x the declared PV span. The 0-100 default span
     * x 1 % reproduces the historical 1.0 EU for undeclared loops (golden unchanged) and
     * is labelled LEGACY_DEFAULT by {@link #spStabilityBandSource()}.
     */
    public Double spStabilityBandPvEu = null;
    public double spStabilityBandSpanFraction = 0.01;
    /** @deprecated v2.5: alias kept for old JSON/YAML overrides; writes {@link #spStabilityBandPvEu}. */
    @Deprecated
    public double spRangePassMax = 1.0;
    public double goodErrorPctPassMin = 0.5;
    /** v2.5 R06 - G4 activity thresholds (were the hardcoded 3.0 / 8.0 in the engine). */
    public double g4ActivityWarnRatio = 3.0;
    public double g4ActivityHighRatio = 8.0;
    /** v2.5 - true when the loop DECLARED its PV range (registry/broadcast); the 0-100 default is not a declaration. */
    public boolean pvRangeDeclared = false;
    /** v2.5 - true when the loop DECLARED its OP range; limits are then the declared min/max (R08, NR-024). */
    public boolean opRangeDeclared = false;
    /**
     * v2.5 R08 - G10 limit policy in normalised percentage points: a sample is "at limit" when
     * within {@link #limitTolerancePp} of 0 or 100 pp of the (declared or assumed) range. The
     * default 5.0 reproduces the historical 5 / 95 thresholds exactly.
     */
    public double limitTolerancePp = 5.0;
    /** v2.5 R08 - limit dwell that warns, in SECONDS; 0 = legacy (satLimitDwellSamplesWarn samples). */
    public double limitDwellWarnS = 0.0;
    /** v2.5 R08 - PV change at or below this is "unchanged" (EU); 0 = exact equality (legacy). */
    public double freezeToleranceEu = 0.0;
    /** v2.5 R08 - a flat run at least this long (seconds) is a freeze episode (evidence, always retained). */
    public double freezeDwellS = 60.0;
    /** v2.5 R02 - |OP - VP| at or above this (pp) is "not following"; a run of it >= nonfollowingDwellS is positive G14 evidence. */
    public double nonfollowingErrorPp = 5.0;
    public double nonfollowingDwellS = 60.0;

    /** The effective G2 band in PV EU (see field docs). */
    public double spStabilityBandEu() {
        if (spStabilityBandPvEu != null && spStabilityBandPvEu > 0) return spStabilityBandPvEu;
        double span = pvEngMax - pvEngMin;
        if (span <= 1e-12 || Double.isNaN(span) || Double.isInfinite(span)) return 1.0;
        double band = spStabilityBandSpanFraction * span;
        return band > 1e-12 ? band : 1.0;
    }

    /** COMMISSIONED_EU | COMMISSIONED_SPAN_FRACTION | LEGACY_DEFAULT (span fraction on an undeclared span). */
    public String spStabilityBandSource() {
        if (spStabilityBandPvEu != null && spStabilityBandPvEu > 0) return "COMMISSIONED_EU";
        return pvRangeDeclared ? "COMMISSIONED_SPAN_FRACTION" : "LEGACY_DEFAULT";
    }
    public double satLowPct = 5.0;
    public double satHighPct = 95.0;
    public double satWarnOccupancy = 0.05;
    public int satLimitDwellSamplesWarn = 30;

    // P3-8 - engineering range of the OP signal itself. The engine historically
    // assumed OP arrives as 0-100 %: a 0-1 valve fraction made every saturation
    // threshold unreachable (saturation stuck at 0) and G2r pass unconditionally.
    // When a loop declares its range (registry -> cplm.loop.engineering
    // broadcast), OP is normalized to 0-100 before any gate math. The default
    // 0-100 is an exact identity, so undeclared loops are byte-for-byte
    // unchanged (golden reference included).
    public double opEngMin = 0.0;
    public double opEngMax = 100.0;

    // The PV engineering range, same mechanism and same discipline as the OP range
    // above. It exists because goodErrorPct counted |SP-PV| against a HARDCODED 0.5
    // absolute EU: on a 0-100 % loop that is 0.5 % of span, but on a 0-1000 t/h flow
    // it is 0.05 % and G3 could never pass, while on a 0-1 fraction it is 50 % and G3
    // could never fail. The band is now a FRACTION OF SPAN, and the 0-100 default
    // reproduces the old constant exactly (0.005 * 100 = 0.5), so an undeclared loop
    // is byte-for-byte unchanged.
    public double pvEngMin = 0.0;
    public double pvEngMax = 100.0;
    /** Half-width of the "good error" band as a fraction of PV span (0.005 = 0.5 %). */
    public double goodErrorBandPctOfSpan = 0.005;

    /**
     * Absolute EU half-width of the good-error band for this loop. Falls back to the
     * historical 0.5 when the declared span is unusable, so a bad range degrades to
     * the old behaviour rather than to zero (a zero band would make goodErrorPct 0
     * and silently WARN every loop).
     */
    public double goodErrorBand() {
        double span = pvEngMax - pvEngMin;
        if (span <= 1e-12 || Double.isNaN(span) || Double.isInfinite(span)) return 0.5;
        double band = goodErrorBandPctOfSpan * span;
        return band > 1e-12 ? band : 0.5;
    }

    /** Normalize one OP sample to 0-100 % of the declared engineering range. */
    public double normalizeOp(double op) {
        double span = opEngMax - opEngMin;
        if (span <= 1e-12 || (opEngMin == 0.0 && opEngMax == 100.0)) return op;
        return (op - opEngMin) / span * 100.0;
    }

    // --- temporal persistence ---
    public int persistenceWindows = 3;
    public int persistenceMinAgree = 2;


    public CplmLoopDynamicsProfile copy() {
        CplmLoopDynamicsProfile p = new CplmLoopDynamicsProfile();
        p.loopClass = loopClass;
        p.profileSource = profileSource;
        p.dynamicsProfileVersion = dynamicsProfileVersion;
        p.calculationVersion = calculationVersion;
        p.gateProfileId = gateProfileId;
        p.dynamicClass = dynamicClass;
        p.serviceObjective = serviceObjective;
        p.tauMinS = tauMinS;
        p.tauMaxS = tauMaxS;
        p.minSamplesPerPeriod = minSamplesPerPeriod;
        p.minValidCycles = minValidCycles;
        p.cornerAngleDeg = cornerAngleDeg;
        p.opDeadbandPct = opDeadbandPct;
        p.vpMaxAgeS = vpMaxAgeS;
        p.opTravelFloorPct = opTravelFloorPct;
        p.effortRatioFloor = effortRatioFloor;
        p.phaseAreaPerCycleLo = phaseAreaPerCycleLo;
        p.phaseAreaPerCycleHi = phaseAreaPerCycleHi;
        p.priorStiction = priorStiction;
        p.priorOscillation = priorOscillation;
        p.priorEffort = priorEffort;
        p.priorGeometry = priorGeometry;
        p.integrating = integrating;
        p.opEngMin = opEngMin;
        p.opEngMax = opEngMax;
        p.pvEngMin = pvEngMin;
        p.pvEngMax = pvEngMax;
        p.goodErrorBandPctOfSpan = goodErrorBandPctOfSpan;
        p.geometryFamilyEnabled = geometryFamilyEnabled;
        p.pvFilterType = pvFilterType;
        p.pvFilterWindow = pvFilterWindow;
        p.acfRegularityMin = acfRegularityMin;
        p.fftPeakToMedianMin = fftPeakToMedianMin;
        p.geometryRole = geometryRole;
        p.shapeRole = shapeRole;
        p.horchRole = horchRole;
        p.saturationRole = saturationRole;
        p.requireOscillationForStiction = requireOscillationForStiction;
        p.minNonGeometryEvidences = minNonGeometryEvidences;
        p.geometryAloneForbidden = geometryAloneForbidden;
        p.regionPvMin = regionPvMin;
        p.regionPvMax = regionPvMax;
        p.regionOpMin = regionOpMin;
        p.regionOpMax = regionOpMax;
        p.spRangePassMax = spRangePassMax;
        p.spStabilityBandPvEu = spStabilityBandPvEu;
        p.spStabilityBandSpanFraction = spStabilityBandSpanFraction;
        p.g4ActivityWarnRatio = g4ActivityWarnRatio;
        p.g4ActivityHighRatio = g4ActivityHighRatio;
        p.pvRangeDeclared = pvRangeDeclared;
        p.opRangeDeclared = opRangeDeclared;
        p.limitTolerancePp = limitTolerancePp;
        p.limitDwellWarnS = limitDwellWarnS;
        p.freezeToleranceEu = freezeToleranceEu;
        p.freezeDwellS = freezeDwellS;
        p.nonfollowingErrorPp = nonfollowingErrorPp;
        p.nonfollowingDwellS = nonfollowingDwellS;
        p.goodErrorPctPassMin = goodErrorPctPassMin;
        p.satLowPct = satLowPct;
        p.satHighPct = satHighPct;
        p.satWarnOccupancy = satWarnOccupancy;
        p.satLimitDwellSamplesWarn = satLimitDwellSamplesWarn;
        p.persistenceWindows = persistenceWindows;
        p.persistenceMinAgree = persistenceMinAgree;
        return p;
    }

    /** True when geometry may not be the sole selected diagnosis family. */
    public boolean isGeometryDecisiveForbidden() {
        return geometryAloneForbidden
                || geometryRole == GateRole.SUPPORTING
                || geometryRole == GateRole.DISPLAY_ONLY
                || !geometryFamilyEnabled
                || priorGeometry <= 0;
    }

    /** Stiction / shape signal: OP for self-regulating, PV for integrating (He et al.). */
    public String stictionSignal() {
        return integrating ? "PV" : "OP";
    }

    /**
     * Resolution order: per-loop override -> loopType -> ISA-5.1 first-letter inference -> UNKNOWN.
     */
    public static CplmLoopDynamicsProfile resolve(String loopId, String loopType, CplmLoopDynamicsProfile override) {
        if (override != null) {
            CplmLoopDynamicsProfile p = override.copy();
            p.profileSource = ProfileSource.OVERRIDE;
            if (p.loopClass == null) p.loopClass = LoopClass.UNKNOWN;
            return p;
        }
        LoopClass fromType = parseClass(loopType);
        if (fromType != null && fromType != LoopClass.UNKNOWN) {
            CplmLoopDynamicsProfile p = forClass(fromType).copy();
            p.profileSource = ProfileSource.LOOP_TYPE;
            return p;
        }
        LoopClass inferred = inferFromTag(loopId);
        if (inferred != LoopClass.UNKNOWN) {
            CplmLoopDynamicsProfile p = forClass(inferred).copy();
            p.profileSource = ProfileSource.INFERRED;
            return p;
        }
        CplmLoopDynamicsProfile p = forClass(LoopClass.UNKNOWN).copy();
        p.profileSource = ProfileSource.UNKNOWN;
        return p;
    }

    public static CplmLoopDynamicsProfile forClass(LoopClass cls) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfilePacks.pack(cls).copy();
        p.loopClass = cls != null ? cls : LoopClass.UNKNOWN;
        return p;
    }

    public static LoopClass inferFromTag(String loopId) {
        if (loopId == null || loopId.isEmpty()) return LoopClass.UNKNOWN;
        String s = loopId.trim().toUpperCase(Locale.ROOT);
        if (s.contains("PIC_GAS") || s.contains("PRESSURE_GAS") || s.startsWith("PIG")) {
            return LoopClass.PIC_GAS;
        }
        if (s.contains("PIC_VAP") || s.contains("PRESSURE_VAP") || s.contains("VAPOUR") || s.contains("VAPOR")) {
            return LoopClass.PIC_VAPOUR;
        }
        if (s.startsWith("FIC") || s.startsWith("FC") || s.charAt(0) == 'F') return LoopClass.FIC;
        if (s.startsWith("PIC") || s.startsWith("PC") || s.charAt(0) == 'P') return LoopClass.PIC;
        if (s.startsWith("LIC") || s.startsWith("LC") || s.charAt(0) == 'L') return LoopClass.LIC;
        if (s.startsWith("TIC") || s.startsWith("TC") || s.startsWith("SYN_TIC") || s.charAt(0) == 'T') {
            return LoopClass.TIC;
        }
        // P2-2: real plant tags are site/unit-prefixed ("B2_027PIC"), so
        // prefix-only matching sent essentially every production tag to the
        // UNKNOWN profile - wrong band limits (root cause of the record-length
        // "oscillation") and the geometry family permanently disabled. Look for
        // the loop-type token anywhere in the tag. Order matters: the 3-letter
        // ISA tokens are unambiguous; single letters stay prefix-only above
        // because "L" appears inside too many unrelated words.
        if (s.contains("FIC")) return LoopClass.FIC;
        if (s.contains("PIC")) return LoopClass.PIC;
        if (s.contains("LIC")) return LoopClass.LIC;
        if (s.contains("TIC")) return LoopClass.TIC;
        return LoopClass.UNKNOWN;
    }

    public static LoopClass parseClass(String loopType) {
        if (loopType == null || loopType.trim().isEmpty()) return null;
        String t = loopType.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if (t.contains("PRESSURE_GAS") || t.equals("PIC_GAS") || t.contains("GAS_INTEGRATING")) {
            return LoopClass.PIC_GAS;
        }
        if (t.contains("PRESSURE_VAP") || t.equals("PIC_VAPOUR") || t.contains("VAPOUR") || t.contains("VAPOR")) {
            return LoopClass.PIC_VAPOUR;
        }
        if (t.contains("PRESSURE_LIQUID") || t.equals("PRESSURE_LIQUID_FAST") || t.equals("PIC_LIQUID")) {
            return LoopClass.PIC;
        }
        if (t.contains("FLOW") || t.equals("FIC") || t.equals("F") || t.equals("FLOW_FAST_SELF_REG")) {
            return LoopClass.FIC;
        }
        if (t.contains("PRESSURE") || t.equals("PIC") || t.equals("P")) return LoopClass.PIC;
        if (t.contains("LEVEL") || t.equals("LIC") || t.equals("L") || t.equals("LEVEL_INTEGRATING")) {
            return LoopClass.LIC;
        }
        if (t.contains("TEMP") || t.equals("TIC") || t.equals("T") || t.equals("TEMP_SLOW_SELF_REG")) {
            return LoopClass.TIC;
        }
        try {
            return LoopClass.valueOf(t);
        } catch (Exception ignored) {
            return LoopClass.UNKNOWN;
        }
    }

    public boolean isPeriodInBand(double periodS, double samplePeriodSec) {
        if (!(periodS > 0) || Double.isNaN(periodS) || Double.isInfinite(periodS)) return false;
        if (periodS < tauMinS || periodS > tauMaxS) return false;
        double minSpan = minSamplesPerPeriod * Math.max(1e-9, samplePeriodSec);
        return periodS + 1e-12 >= minSpan;
    }

    public enum PhaseAreaBand {
        BELOW_BAND, IN_BAND, ABOVE_BAND
    }

    public boolean isPhaseAreaInBand(double area) {
        return classifyPhaseArea(area) == PhaseAreaBand.IN_BAND;
    }

    /** Tri-state band for G9 / geometry-family qualification. */
    public PhaseAreaBand classifyPhaseArea(double area) {
        if (Double.isNaN(area) || Double.isInfinite(area) || area < 0) {
            return PhaseAreaBand.BELOW_BAND;
        }
        if (area < phaseAreaPerCycleLo) return PhaseAreaBand.BELOW_BAND;
        if (area > phaseAreaPerCycleHi) return PhaseAreaBand.ABOVE_BAND;
        return PhaseAreaBand.IN_BAND;
    }

}
