package com.ams.flink.cplm;

import com.ams.flink.cplm.CplmLoopDynamicsProfile.DynamicClass;
import com.ams.flink.cplm.CplmLoopDynamicsProfile.GateRole;
import com.ams.flink.cplm.CplmLoopDynamicsProfile.LoopClass;
import com.ams.flink.cplm.CplmLoopDynamicsProfile.ServiceObjective;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The FACTORY layer of the loop-dynamics configuration: the embedded class packs and the
 * classpath YAML ({@code cplm/loop-dynamics-profiles.yaml}) that overlays them. Loaded once per
 * JVM. Split out of CplmLoopDynamicsProfile in v2.5 (1E.1) - no default and no parse rule changed.
 * Phase 3 replaces this loader with the governed bundle (factory-layer.json parity test).
 */
final class CplmLoopDynamicsProfilePacks {
    private static final Map<LoopClass, CplmLoopDynamicsProfile> PACK = new ConcurrentHashMap<>();
    private static volatile boolean packLoaded;

    private CplmLoopDynamicsProfilePacks() {
    }

    /** The class pack (UNKNOWN when the class has none); callers copy before mutating. */
    static CplmLoopDynamicsProfile pack(LoopClass cls) {
        ensurePackLoaded();
        CplmLoopDynamicsProfile base = PACK.get(cls != null ? cls : LoopClass.UNKNOWN);
        if (base == null) base = PACK.get(LoopClass.UNKNOWN);
        return base;
    }

    private static void ensurePackLoaded() {
        if (packLoaded) return;
        synchronized (CplmLoopDynamicsProfilePacks.class) {
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
            p.spStabilityBandSpanFraction = 0.05;   // v2.5: 5 % of span (= the old 5.0 EU on a 0-100 span)
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
            String profileVer = ver.find() ? ver.group(1).trim() : CplmLoopDynamicsProfile.DYNAMICS_PROFILE_VERSION;
            Matcher calc = Pattern.compile("calculationVersion:\\s*\"?([^\n\"]+)\"?").matcher(text);
            String calcVer = calc.find() ? calc.group(1).trim() : CplmLoopDynamicsProfile.CALCULATION_VERSION;
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
        p.vpMaxAgeS = dbl(block, "vpMaxAgeS", p.vpMaxAgeS);
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
        // The YAML packs are the FACTORY layer: a class default is a span FRACTION, never a
        // commissioned EU objective. spRangePassMax stays readable for old packs but no longer
        // implies COMMISSIONED_EU (that alias applies only to per-loop JSON overrides).
        p.spRangePassMax = dbl(block, "spRangePassMax", p.spRangePassMax);
        if (block.containsKey("spStabilityBandPvEu")) p.spStabilityBandPvEu = dbl(block, "spStabilityBandPvEu", 0);
        p.spStabilityBandSpanFraction = dbl(block, "spStabilityBandSpanFraction", p.spStabilityBandSpanFraction);
        p.g4ActivityWarnRatio = dbl(block, "g4ActivityWarnRatio", p.g4ActivityWarnRatio);
        p.g4ActivityHighRatio = dbl(block, "g4ActivityHighRatio", p.g4ActivityHighRatio);
        p.limitTolerancePp = dbl(block, "limitTolerancePp", p.limitTolerancePp);
        p.limitDwellWarnS = dbl(block, "limitDwellWarnS", p.limitDwellWarnS);
        p.freezeToleranceEu = dbl(block, "freezeToleranceEu", p.freezeToleranceEu);
        p.freezeDwellS = dbl(block, "freezeDwellS", p.freezeDwellS);
        p.nonfollowingErrorPp = dbl(block, "nonfollowingErrorPp", p.nonfollowingErrorPp);
        p.nonfollowingDwellS = dbl(block, "nonfollowingDwellS", p.nonfollowingDwellS);
        p.recoverySupportS = dbl(block, "recoverySupportS", p.recoverySupportS);
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
