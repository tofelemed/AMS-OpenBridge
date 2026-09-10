package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolve {@link CplmLoopDynamicsProfile} from {@code traverse.cpa.context.parameter-set.v1}
 * payloads (class packs + per-loop overrides). Classpath YAML / embedded table remains
 * the first-hydration fallback when the spine map has no matching key.
 *
 * Expected parameter names inside a parameter-set envelope:
 * <ul>
 *   <li>{@code cplm.dynamics.class.FIC|PIC|PIC_GAS|PIC_VAPOUR|LIC|TIC|UNKNOWN} - JSON blob</li>
 *   <li>{@code cplm.dynamics.override} - per-loop JSON blob</li>
 *   <li>{@code cplm.dynamicsProfileVersion}, {@code cplm.calculationVersion}</li>
 * </ul>
 */
public final class CplmDynamicsParameterSetSupport implements Serializable {

    public static final String ATTR_OVERRIDE = "cplm.dynamics.override";
    /**
     * P3-8 - per-loop OP engineering range published by the registry
     * (cpm.loop_registry.engineering). Applied AFTER profile resolution as a
     * merge, never as an override: it cannot clobber the class pack.
     */
    public static final String ATTR_ENGINEERING = "cplm.loop.engineering";
    public static final String ATTR_PROFILE_VERSION = "cplm.dynamicsProfileVersion";
    public static final String ATTR_CALC_VERSION = "cplm.calculationVersion";
    public static final String ATTR_CLASS_PREFIX = "cplm.dynamics.class.";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** In-process hydration cache (broadcast state / CLI / tests). */
    private static final Map<String, String> SPINE = new ConcurrentHashMap<>();

    private CplmDynamicsParameterSetSupport() {
    }

    /** Apply one parameter-set JSON envelope (or clear on tombstone null). */
    public static void applyParameterSetJson(String key, String jsonOrNull) {
        if (jsonOrNull == null || jsonOrNull.isEmpty() || "null".equalsIgnoreCase(jsonOrNull)) {
            if (key != null) {
                SPINE.entrySet().removeIf(e -> e.getKey().startsWith(key + ":") || e.getKey().equals(key));
            }
            return;
        }
        try {
            JsonNode root = MAPPER.readTree(jsonOrNull);
            String calcId = root.path("calcInstanceId").asText(key != null ? key : "");
            JsonNode params = root.path("parameters");
            if (!params.isArray()) return;
            for (JsonNode p : params) {
                String name = p.path("name").asText("");
                String value = p.path("value").asText("");
                if (name.isEmpty()) continue;
                SPINE.put(calcId + ":" + name, value);
                SPINE.put(name, value);
            }
        } catch (Exception ignored) {
            // never break gate evaluation on bad spine payloads
        }
    }

    /** Test/seed helper: put a raw attr value. */
    public static void putRaw(String attrName, String jsonValue) {
        if (attrName != null && jsonValue != null) SPINE.put(attrName, jsonValue);
    }

    public static void clear() {
        SPINE.clear();
    }

    /**
     * Resolution: per-loop override -> class pack from spine -> classpath/embedded fallback.
     */
    public static CplmLoopDynamicsProfile resolveFromSpine(String loopId, String loopType, String assetUuid) {
        CplmLoopDynamicsProfile override = null;
        if (assetUuid != null && !assetUuid.isEmpty()) {
            String o = SPINE.get(assetUuid + ":" + ATTR_OVERRIDE);
            if (o == null) o = firstMatchingSuffix(":" + assetUuid + ":" + ATTR_OVERRIDE);
            if (o != null) override = parseProfileJson(o, CplmLoopDynamicsProfile.ProfileSource.OVERRIDE);
        }
        if (override == null && loopId != null) {
            String o = SPINE.get(loopId + ":" + ATTR_OVERRIDE);
            if (o == null) o = SPINE.get(ATTR_OVERRIDE + ":" + loopId);
            if (o != null) override = parseProfileJson(o, CplmLoopDynamicsProfile.ProfileSource.OVERRIDE);
        }

        CplmLoopDynamicsProfile.LoopClass cls = CplmLoopDynamicsProfile.parseClass(loopType);
        if (cls == null || cls == CplmLoopDynamicsProfile.LoopClass.UNKNOWN) {
            cls = CplmLoopDynamicsProfile.inferFromTag(loopId);
        }
        String classAttr = ATTR_CLASS_PREFIX + cls.name();
        String classJson = SPINE.get(classAttr);
        if (classJson != null) {
            CplmLoopDynamicsProfile fromSpine = parseProfileJson(classJson, CplmLoopDynamicsProfile.ProfileSource.LOOP_TYPE);
            if (fromSpine != null) {
                if (override != null) {
                    override.profileSource = CplmLoopDynamicsProfile.ProfileSource.OVERRIDE;
                    stampVersions(override);
                    applyEngineering(override, loopId);
                    return override;
                }
                fromSpine.loopClass = cls;
                stampVersions(fromSpine);
                applyEngineering(fromSpine, loopId);
                return fromSpine;
            }
        }

        CplmLoopDynamicsProfile fallback = CplmLoopDynamicsProfile.resolve(loopId, loopType, override);
        stampVersions(fallback);
        applyEngineering(fallback, loopId);
        return fallback;
    }

    /** P3-8 - merge the loop's declared OP engineering range onto the resolved profile. */
    private static void applyEngineering(CplmLoopDynamicsProfile p, String loopId) {
        if (p == null || loopId == null || loopId.isEmpty()) return;
        String eng = SPINE.get(loopId + ":" + ATTR_ENGINEERING);
        if (eng == null) eng = SPINE.get(ATTR_ENGINEERING + ":" + loopId);
        if (eng == null) return;
        try {
            JsonNode n = MAPPER.readTree(eng);
            if (n.isTextual()) n = MAPPER.readTree(n.asText());
            if (n.has("opEngMin")) p.opEngMin = n.path("opEngMin").asDouble(p.opEngMin);
            if (n.has("opEngMax")) p.opEngMax = n.path("opEngMax").asDouble(p.opEngMax);
            if (n.has("pvEngMin")) p.pvEngMin = n.path("pvEngMin").asDouble(p.pvEngMin);
            if (n.has("pvEngMax")) p.pvEngMax = n.path("pvEngMax").asDouble(p.pvEngMax);
        } catch (Exception ignored) {
            // a malformed range must never break gate evaluation
        }
    }

    private static String firstMatchingSuffix(String suffix) {
        for (Map.Entry<String, String> e : SPINE.entrySet()) {
            if (e.getKey().endsWith(suffix)) return e.getValue();
        }
        return null;
    }

    private static void stampVersions(CplmLoopDynamicsProfile p) {
        String dyn = SPINE.get(ATTR_PROFILE_VERSION);
        String calc = SPINE.get(ATTR_CALC_VERSION);
        if (dyn != null && !dyn.isEmpty()) {
            p.dynamicsProfileVersion = dyn.replace("\"", "");
        }
        if (calc != null && !calc.isEmpty()) {
            p.calculationVersion = calc.replace("\"", "");
        }
    }

    static CplmLoopDynamicsProfile parseProfileJson(String json, CplmLoopDynamicsProfile.ProfileSource source) {
        try {
            JsonNode root = MAPPER.readTree(json);
            if (root.isTextual()) root = MAPPER.readTree(root.asText());
            CplmLoopDynamicsProfile.LoopClass cls = CplmLoopDynamicsProfile.LoopClass.UNKNOWN;
            String c = root.path("class").asText("");
            if (!c.isEmpty()) {
                try {
                    cls = CplmLoopDynamicsProfile.LoopClass.valueOf(c.toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep UNKNOWN */ }
            }
            if (cls == CplmLoopDynamicsProfile.LoopClass.UNKNOWN) {
                String gp = root.path("gateProfileId").asText("");
                CplmLoopDynamicsProfile.LoopClass parsed = CplmLoopDynamicsProfile.parseClass(gp);
                if (parsed != null) cls = parsed;
            }
            CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(cls);
            p.profileSource = source;
            if (root.has("tauMinS")) p.tauMinS = root.path("tauMinS").asDouble(p.tauMinS);
            if (root.has("tauMaxS")) p.tauMaxS = root.path("tauMaxS").asDouble(p.tauMaxS);
            if (root.has("minSamplesPerPeriod")) p.minSamplesPerPeriod = root.path("minSamplesPerPeriod").asInt(p.minSamplesPerPeriod);
            if (root.has("minValidCycles")) p.minValidCycles = root.path("minValidCycles").asInt(p.minValidCycles);
            if (root.has("cornerAngleDeg")) p.cornerAngleDeg = root.path("cornerAngleDeg").asDouble(p.cornerAngleDeg);
            if (root.has("opDeadbandPct")) p.opDeadbandPct = root.path("opDeadbandPct").asDouble(p.opDeadbandPct);
            if (root.has("opTravelFloorPct")) p.opTravelFloorPct = root.path("opTravelFloorPct").asDouble(p.opTravelFloorPct);
            if (root.has("effortRatioFloor")) p.effortRatioFloor = root.path("effortRatioFloor").asDouble(p.effortRatioFloor);
            if (root.has("phaseAreaPerCycleLo")) p.phaseAreaPerCycleLo = root.path("phaseAreaPerCycleLo").asDouble(p.phaseAreaPerCycleLo);
            if (root.has("phaseAreaPerCycleHi")) p.phaseAreaPerCycleHi = root.path("phaseAreaPerCycleHi").asDouble(p.phaseAreaPerCycleHi);
            if (root.has("priorStiction")) p.priorStiction = root.path("priorStiction").asDouble(p.priorStiction);
            if (root.has("stictionPrior")) p.priorStiction = root.path("stictionPrior").asDouble(p.priorStiction);
            if (root.has("priorOscillation")) p.priorOscillation = root.path("priorOscillation").asDouble(p.priorOscillation);
            if (root.has("oscillationPrior")) p.priorOscillation = root.path("oscillationPrior").asDouble(p.priorOscillation);
            if (root.has("priorEffort")) p.priorEffort = root.path("priorEffort").asDouble(p.priorEffort);
            if (root.has("effortPrior")) p.priorEffort = root.path("effortPrior").asDouble(p.priorEffort);
            if (root.has("priorGeometry")) p.priorGeometry = root.path("priorGeometry").asDouble(p.priorGeometry);
            if (root.has("geometryPrior")) p.priorGeometry = root.path("geometryPrior").asDouble(p.priorGeometry);
            if (root.path("familyPriors").isObject()) {
                JsonNode priors = root.path("familyPriors");
                if (priors.has("stiction")) p.priorStiction = priors.path("stiction").asDouble(p.priorStiction);
                if (priors.has("oscillation")) p.priorOscillation = priors.path("oscillation").asDouble(p.priorOscillation);
                if (priors.has("effort")) p.priorEffort = priors.path("effort").asDouble(p.priorEffort);
                if (priors.has("geometry")) p.priorGeometry = priors.path("geometry").asDouble(p.priorGeometry);
            }
            if (root.has("geometryFamilyEnabled")) p.geometryFamilyEnabled = root.path("geometryFamilyEnabled").asBoolean(p.geometryFamilyEnabled);
            if (root.has("integrating")) p.integrating = root.path("integrating").asBoolean(p.integrating);
            if (root.has("opEngMin")) p.opEngMin = root.path("opEngMin").asDouble(p.opEngMin);
            if (root.has("opEngMax")) p.opEngMax = root.path("opEngMax").asDouble(p.opEngMax);
            if (root.has("pvEngMin")) p.pvEngMin = root.path("pvEngMin").asDouble(p.pvEngMin);
            if (root.has("pvEngMax")) p.pvEngMax = root.path("pvEngMax").asDouble(p.pvEngMax);
            if (root.has("goodErrorBandPctOfSpan"))
                p.goodErrorBandPctOfSpan = root.path("goodErrorBandPctOfSpan").asDouble(p.goodErrorBandPctOfSpan);
            if (root.has("gateProfileId")) p.gateProfileId = root.path("gateProfileId").asText(p.gateProfileId);
            if (root.has("dynamicClass")) {
                try {
                    p.dynamicClass = CplmLoopDynamicsProfile.DynamicClass.valueOf(
                            root.path("dynamicClass").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("serviceObjective")) {
                try {
                    p.serviceObjective = CplmLoopDynamicsProfile.ServiceObjective.valueOf(
                            root.path("serviceObjective").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("geometryRole")) {
                try {
                    p.geometryRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("geometryRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("shapeRole")) {
                try {
                    p.shapeRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("shapeRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("horchRole")) {
                try {
                    p.horchRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("horchRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("saturationRole")) {
                try {
                    p.saturationRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("saturationRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("geometryAloneForbidden")) {
                p.geometryAloneForbidden = root.path("geometryAloneForbidden").asBoolean(p.geometryAloneForbidden);
            }
            if (root.has("requireOscillationForStiction")) {
                p.requireOscillationForStiction = root.path("requireOscillationForStiction").asBoolean(p.requireOscillationForStiction);
            }
            if (root.has("minNonGeometryEvidences")) {
                p.minNonGeometryEvidences = root.path("minNonGeometryEvidences").asInt(p.minNonGeometryEvidences);
            }
            if (root.has("persistenceWindows")) {
                p.persistenceWindows = root.path("persistenceWindows").asInt(p.persistenceWindows);
            }
            if (root.has("persistenceMinAgree")) {
                p.persistenceMinAgree = root.path("persistenceMinAgree").asInt(p.persistenceMinAgree);
            }
            if (root.has("regionPvMin")) p.regionPvMin = root.path("regionPvMin").asDouble(p.regionPvMin);
            if (root.has("regionPvMax")) p.regionPvMax = root.path("regionPvMax").asDouble(p.regionPvMax);
            if (root.has("regionOpMin")) p.regionOpMin = root.path("regionOpMin").asDouble(p.regionOpMin);
            if (root.has("regionOpMax")) p.regionOpMax = root.path("regionOpMax").asDouble(p.regionOpMax);
            if (root.has("spRangePassMax")) p.spRangePassMax = root.path("spRangePassMax").asDouble(p.spRangePassMax);
            if (root.has("goodErrorPctPassMin")) p.goodErrorPctPassMin = root.path("goodErrorPctPassMin").asDouble(p.goodErrorPctPassMin);
            if (root.has("satLowPct")) p.satLowPct = root.path("satLowPct").asDouble(p.satLowPct);
            if (root.has("satHighPct")) p.satHighPct = root.path("satHighPct").asDouble(p.satHighPct);
            if (root.has("satWarnOccupancy")) p.satWarnOccupancy = root.path("satWarnOccupancy").asDouble(p.satWarnOccupancy);
            if (root.has("satLimitDwellSamplesWarn")) p.satLimitDwellSamplesWarn = root.path("satLimitDwellSamplesWarn").asInt(p.satLimitDwellSamplesWarn);
            if (root.has("pvFilterType")) p.pvFilterType = root.path("pvFilterType").asText(p.pvFilterType);
            if (root.has("pvFilterWindow")) p.pvFilterWindow = root.path("pvFilterWindow").asInt(p.pvFilterWindow);
            if (root.path("pvFilter").isObject()) {
                JsonNode filter = root.path("pvFilter");
                if (filter.has("type")) p.pvFilterType = filter.path("type").asText(p.pvFilterType);
                if (filter.has("window")) p.pvFilterWindow = filter.path("window").asInt(p.pvFilterWindow);
            }
            if (root.has("acfRegularityMin")) p.acfRegularityMin = root.path("acfRegularityMin").asDouble(p.acfRegularityMin);
            if (root.has("fftPeakToMedianMin")) p.fftPeakToMedianMin = root.path("fftPeakToMedianMin").asDouble(p.fftPeakToMedianMin);
            return p;
        } catch (Exception e) {
            return null;
        }
    }
}
