package com.ams.flink.cplm;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    public double spRangePassMax = 1.0;
    public double goodErrorPctPassMin = 0.5;
    public double satLowPct = 5.0;
    public double satHighPct = 95.0;
    public double satWarnOccupancy = 0.05;
    public int satLimitDwellSamplesWarn = 30;

    // --- temporal persistence ---
    public int persistenceWindows = 3;
    public int persistenceMinAgree = 2;

    private static final Map<LoopClass, CplmLoopDynamicsProfile> PACK = new ConcurrentHashMap<>();
    private static volatile boolean packLoaded;

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
        p.opTravelFloorPct = opTravelFloorPct;
        p.effortRatioFloor = effortRatioFloor;
        p.phaseAreaPerCycleLo = phaseAreaPerCycleLo;
        p.phaseAreaPerCycleHi = phaseAreaPerCycleHi;
        p.priorStiction = priorStiction;
        p.priorOscillation = priorOscillation;
        p.priorEffort = priorEffort;
        p.priorGeometry = priorGeometry;
        p.integrating = integrating;
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
        ensurePackLoaded();
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
        ensurePackLoaded();
        CplmLoopDynamicsProfile base = PACK.get(cls != null ? cls : LoopClass.UNKNOWN);
        if (base == null) base = PACK.get(LoopClass.UNKNOWN);
        CplmLoopDynamicsProfile p = base.copy();
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

    private static void ensurePackLoaded() {
        if (packLoaded) return;
        synchronized (CplmLoopDynamicsProfile.class) {
            if (packLoaded) return;
            loadEmbeddedFallback();
            loadYamlResource();
            packLoaded = true;
        }
    }

    /** Embedded fallback identical to YAML (used when resource unavailable). */
    private static void loadEmbeddedFallback() {
        PACK.put(LoopClass.FIC, ficDefaults());
        PACK.put(LoopClass.PIC, picLiquidDefaults());
        PACK.put(LoopClass.PIC_GAS, picGasDefaults());
        PACK.put(LoopClass.PIC_VAPOUR, picVapourDefaults());
        PACK.put(LoopClass.LIC, licDefaults());
        PACK.put(LoopClass.TIC, ticDefaults());
        PACK.put(LoopClass.UNKNOWN, unknownDefaults());
    }

    private static CplmLoopDynamicsProfile base(
            LoopClass cls, String gateProfileId, DynamicClass dyn, ServiceObjective svc,
            double tauMin, double tauMax, int minCycles, double cornerDeg,
            double opDeadband, double opTravel, double effortFloor, double areaLo, double areaHi,
            double geoPrior, boolean integrating, boolean geoEnabled, int filterWindow,
            GateRole geoRole, boolean geoAloneForbidden) {
        CplmLoopDynamicsProfile p = new CplmLoopDynamicsProfile();
        p.loopClass = cls;
        p.gateProfileId = gateProfileId;
        p.dynamicClass = dyn;
        p.serviceObjective = svc;
        p.tauMinS = tauMin;
        p.tauMaxS = tauMax;
        p.minSamplesPerPeriod = 8;
        p.minValidCycles = minCycles;
        p.cornerAngleDeg = cornerDeg;
        p.opDeadbandPct = opDeadband;
        p.opTravelFloorPct = opTravel;
        p.effortRatioFloor = effortFloor;
        p.phaseAreaPerCycleLo = areaLo;
        p.phaseAreaPerCycleHi = areaHi;
        p.priorGeometry = geoPrior;
        p.integrating = integrating;
        p.geometryFamilyEnabled = geoEnabled;
        p.pvFilterWindow = filterWindow;
        p.geometryRole = geoRole;
        p.geometryAloneForbidden = geoAloneForbidden;
        if (svc == ServiceObjective.AVERAGING) {
            p.spRangePassMax = 5.0;
            p.goodErrorPctPassMin = 0.30;
        }
        return p;
    }

    private static CplmLoopDynamicsProfile ficDefaults() {
        return base(LoopClass.FIC, "FLOW_FAST_SELF_REG", DynamicClass.FAST_SELF_REG, ServiceObjective.TIGHT,
                10, 900, 5, 65, 0.5, 2.0, 0.05, 0.05, 1.5, 0.5, false, true, 5,
                GateRole.SUPPORTING, true);
    }

    private static CplmLoopDynamicsProfile picLiquidDefaults() {
        return base(LoopClass.PIC, "PRESSURE_LIQUID_FAST", DynamicClass.FAST_SELF_REG, ServiceObjective.TIGHT,
                5, 1800, 5, 60, 0.5, 2.0, 0.05, 0.05, 1.5, 0.5, false, true, 5,
                GateRole.SUPPORTING, true);
    }

    private static CplmLoopDynamicsProfile picGasDefaults() {
        return base(LoopClass.PIC_GAS, "PRESSURE_GAS_INTEGRATING", DynamicClass.INTEGRATING, ServiceObjective.AVERAGING,
                120, 14400, 3, 50, 0.5, 1.5, 0.04, 0.05, 2.0, 0.3, true, true, 7,
                GateRole.DISPLAY_ONLY, true);
    }

    private static CplmLoopDynamicsProfile picVapourDefaults() {
        return base(LoopClass.PIC_VAPOUR, "PRESSURE_VAPOUR_SLOW", DynamicClass.SLOW_SELF_REG, ServiceObjective.TIGHT,
                300, 28800, 3, 45, 0.25, 1.0, 0.03, 0.05, 2.0, 1.0, false, true, 5,
                GateRole.PRIMARY, false);
    }

    private static CplmLoopDynamicsProfile licDefaults() {
        return base(LoopClass.LIC, "LEVEL_INTEGRATING", DynamicClass.INTEGRATING, ServiceObjective.AVERAGING,
                120, 14400, 3, 50, 0.5, 1.5, 0.04, 0.05, 2.0, 0.3, true, true, 7,
                GateRole.DISPLAY_ONLY, true);
    }

    private static CplmLoopDynamicsProfile ticDefaults() {
        CplmLoopDynamicsProfile p = base(LoopClass.TIC, "TEMP_SLOW_SELF_REG", DynamicClass.SLOW_SELF_REG, ServiceObjective.TIGHT,
                300, 28800, 3, 45, 0.25, 1.0, 0.03, 0.05, 2.0, 1.0, false, true, 5,
                GateRole.PRIMARY, false);
        p.shapeRole = GateRole.PRIMARY;
        p.horchRole = GateRole.PRIMARY;
        return p;
    }

    private static CplmLoopDynamicsProfile unknownDefaults() {
        return base(LoopClass.UNKNOWN, "UNKNOWN", DynamicClass.FAST_SELF_REG, ServiceObjective.TIGHT,
                5, 86400, 5, 65, 0.5, 2.0, 0.05, 0.05, 1.5, 0.0, false, false, 5,
                GateRole.DISPLAY_ONLY, true);
    }

    private static void loadYamlResource() {
        try (InputStream in = CplmLoopDynamicsProfile.class.getClassLoader()
                .getResourceAsStream("cplm/loop-dynamics-profiles.yaml")) {
            if (in == null) return;
            String text;
            try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) {
                    if (line.trim().startsWith("#")) continue;
                    sb.append(line).append('\n');
                }
                text = sb.toString();
            }
            Matcher ver = Pattern.compile("dynamicsProfileVersion:\\s*\"?([^\n\"]+)\"?").matcher(text);
            String profileVer = ver.find() ? ver.group(1).trim() : DYNAMICS_PROFILE_VERSION;
            Matcher calc = Pattern.compile("calculationVersion:\\s*\"?([^\n\"]+)\"?").matcher(text);
            String calcVer = calc.find() ? calc.group(1).trim() : CALCULATION_VERSION;
            double acfMin = readDouble(text, "acfRegularityMin", 0.10);
            double fftMin = readDouble(text, "fftPeakToMedianMin", 3.0);

            for (LoopClass cls : LoopClass.values()) {
                Map<String, String> block = extractClassBlock(text, cls.name());
                if (block.isEmpty()) continue;
                CplmLoopDynamicsProfile p = PACK.getOrDefault(cls, new CplmLoopDynamicsProfile()).copy();
                p.loopClass = cls;
                p.dynamicsProfileVersion = profileVer;
                p.calculationVersion = calcVer;
                p.acfRegularityMin = acfMin;
                p.fftPeakToMedianMin = fftMin;
                applyBlock(p, block);
                PACK.put(cls, p);
            }
        } catch (Exception ignored) {
            // Keep embedded fallback; never fail gate evaluation on pack parse.
        }
    }

    private static void applyBlock(CplmLoopDynamicsProfile p, Map<String, String> block) {
        p.tauMinS = dbl(block, "tauMinS", p.tauMinS);
        p.tauMaxS = dbl(block, "tauMaxS", p.tauMaxS);
        p.minSamplesPerPeriod = (int) dbl(block, "minSamplesPerPeriod", p.minSamplesPerPeriod);
        p.minValidCycles = (int) dbl(block, "minValidCycles", p.minValidCycles);
        p.cornerAngleDeg = dbl(block, "cornerAngleDeg", p.cornerAngleDeg);
        p.opDeadbandPct = dbl(block, "opDeadbandPct", p.opDeadbandPct);
        p.opTravelFloorPct = dbl(block, "opTravelFloorPct", p.opTravelFloorPct);
        p.effortRatioFloor = dbl(block, "effortRatioFloor", p.effortRatioFloor);
        p.phaseAreaPerCycleLo = dbl(block, "phaseAreaPerCycleLo", p.phaseAreaPerCycleLo);
        p.phaseAreaPerCycleHi = dbl(block, "phaseAreaPerCycleHi", p.phaseAreaPerCycleHi);
        p.priorStiction = dbl(block, "stiction", p.priorStiction);
        p.priorOscillation = dbl(block, "oscillation", p.priorOscillation);
        p.priorEffort = dbl(block, "effort", p.priorEffort);
        p.priorGeometry = dbl(block, "geometry", p.priorGeometry);
        if (block.containsKey("integrating")) {
            p.integrating = Boolean.parseBoolean(block.get("integrating"));
        }
        if (block.containsKey("geometryFamilyEnabled")) {
            p.geometryFamilyEnabled = Boolean.parseBoolean(block.get("geometryFamilyEnabled"));
        }
        if (block.containsKey("type")) p.pvFilterType = block.get("type");
        if (block.containsKey("window")) p.pvFilterWindow = (int) Double.parseDouble(block.get("window"));
        if (block.containsKey("gateProfileId")) p.gateProfileId = block.get("gateProfileId");
        if (block.containsKey("dynamicClass")) {
            try {
                p.dynamicClass = DynamicClass.valueOf(block.get("dynamicClass").toUpperCase(Locale.ROOT));
            } catch (Exception ignored) { /* keep default */ }
        }
        if (block.containsKey("serviceObjective")) {
            try {
                p.serviceObjective = ServiceObjective.valueOf(block.get("serviceObjective").toUpperCase(Locale.ROOT));
            } catch (Exception ignored) { /* keep default */ }
        }
        p.geometryRole = parseRole(block.get("geometryRole"), p.geometryRole);
        p.shapeRole = parseRole(block.get("shapeRole"), p.shapeRole);
        p.horchRole = parseRole(block.get("horchRole"), p.horchRole);
        p.saturationRole = parseRole(block.get("saturationRole"), p.saturationRole);
        if (block.containsKey("requireOscillationForStiction")) {
            p.requireOscillationForStiction = Boolean.parseBoolean(block.get("requireOscillationForStiction"));
        }
        if (block.containsKey("minNonGeometryEvidences")) {
            p.minNonGeometryEvidences = (int) dbl(block, "minNonGeometryEvidences", p.minNonGeometryEvidences);
        }
        if (block.containsKey("geometryAloneForbidden")) {
            p.geometryAloneForbidden = Boolean.parseBoolean(block.get("geometryAloneForbidden"));
        }
        p.spRangePassMax = dbl(block, "spRangePassMax", p.spRangePassMax);
        p.goodErrorPctPassMin = dbl(block, "goodErrorPctPassMin", p.goodErrorPctPassMin);
        p.satLowPct = dbl(block, "satLowPct", p.satLowPct);
        p.satHighPct = dbl(block, "satHighPct", p.satHighPct);
        p.satWarnOccupancy = dbl(block, "satWarnOccupancy", p.satWarnOccupancy);
        p.satLimitDwellSamplesWarn = (int) dbl(block, "satLimitDwellSamplesWarn", p.satLimitDwellSamplesWarn);
        p.persistenceWindows = (int) dbl(block, "persistenceWindows", p.persistenceWindows);
        p.persistenceMinAgree = (int) dbl(block, "persistenceMinAgree", p.persistenceMinAgree);
        p.regionPvMin = dbl(block, "regionPvMin", p.regionPvMin);
        p.regionPvMax = dbl(block, "regionPvMax", p.regionPvMax);
        p.regionOpMin = dbl(block, "regionOpMin", p.regionOpMin);
        p.regionOpMax = dbl(block, "regionOpMax", p.regionOpMax);
    }

    private static GateRole parseRole(String raw, GateRole def) {
        if (raw == null || raw.isEmpty()) return def;
        try {
            return GateRole.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            return def;
        }
    }

    private static Map<String, String> extractClassBlock(String text, String className) {
        Map<String, String> out = new HashMap<>();
        Pattern start = Pattern.compile("(?m)^\\s{2}" + className + ":\\s*$");
        Matcher m = start.matcher(text);
        if (!m.find()) return out;
        int from = m.end();
        Matcher next = Pattern.compile("(?m)^\\s{2}[A-Z_]+:\\s*$").matcher(text);
        int to = text.length();
        if (next.find(from)) to = next.start();
        String block = text.substring(from, to);
        for (String line : block.split("\n")) {
            String t = line.trim();
            if (t.isEmpty() || t.startsWith("#") || t.endsWith(":")) continue;
            int colon = t.indexOf(':');
            if (colon <= 0) continue;
            String key = t.substring(0, colon).trim();
            String val = t.substring(colon + 1).trim().replace("\"", "");
            out.put(key, val);
        }
        return out;
    }

    private static double readDouble(String text, String key, double def) {
        Matcher m = Pattern.compile(key + ":\\s*([0-9.]+)").matcher(text);
        return m.find() ? Double.parseDouble(m.group(1)) : def;
    }

    private static double dbl(Map<String, String> block, String key, double def) {
        if (!block.containsKey(key)) return def;
        try {
            return Double.parseDouble(block.get(key));
        } catch (Exception e) {
            return def;
        }
    }
}
