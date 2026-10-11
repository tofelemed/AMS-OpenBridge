package com.ams.flink.cplm;

import org.apache.flink.api.common.state.ReadOnlyBroadcastState;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Resolves {@link CplmLoopDynamicsProfile} for a loop from the class pack (the FACTORY + PROFILE
 * layers, see config/FactoryLayer) plus the registry attributes on the metadata plane - the loop
 * model (2G.1), the engineering range (P3-8), the legacy per-loop override - read through a
 * {@link Lookup} over the operator's own checkpointed broadcast state (3C.1, R17: the static
 * process-wide map is gone; a restore reproduces the state, not a JVM's history). The governed
 * bundle is layered on top by config/EffectiveBundleSelector.
 *
 * Attribute keys inside the metadata envelope: {@code cplm.dynamics.class.<CLASS>} (JSON blob),
 * {@code cplm.dynamics.override} (per-loop JSON blob), {@code cplm.dynamicsProfileVersion},
 * {@code cplm.calculationVersion}, {@code cplm.loop.engineering}, {@code cplm.loop.model}.
 */
public final class CplmDynamicsParameterSetSupport implements Serializable {

    public static final String ATTR_OVERRIDE = "cplm.dynamics.override";
    /** P3-8 - per-loop OP engineering range published by the registry; merged after profile resolution, never an override. */
    public static final String ATTR_ENGINEERING = "cplm.loop.engineering";
    /** v2.5 (2G.1): the registry's loop model dimensions + acquisition contract (LoopModelDimensions.BroadcastJson). */
    public static final String ATTR_LOOP_MODEL = "cplm.loop.model";
    public static final String ATTR_PROFILE_VERSION = "cplm.dynamicsProfileVersion";
    public static final String ATTR_CALC_VERSION = "cplm.calculationVersion";
    public static final String ATTR_CLASS_PREFIX = "cplm.dynamics.class.";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CplmDynamicsParameterSetSupport() {
    }

    /** Where attribute values come from: the broadcast state of the operator, or a map a bounded job filled. */
    public interface Lookup extends Serializable {
        String get(String key);
    }

    /** No attributes at all: the class pack alone. */
    public static final Lookup NONE = key -> null;

    /** A bounded job's attributes (CplmParameterUpdateReader fills it from the compacted topics). */
    public static final class MapLookup implements Lookup {
        private static final long serialVersionUID = 1L;
        private final Map<String, String> map = new HashMap<>();

        @Override
        public String get(String key) {
            return map.get(key);
        }

        public void put(String key, String value) {
            if (key != null && value != null) map.put(key, value);
        }

        public void removePrefix(String key) {
            map.entrySet().removeIf(e -> e.getKey().equals(key) || e.getKey().startsWith(key + ":"));
        }

        public int size() {
            return map.size();
        }
    }

    public static Lookup of(ReadOnlyBroadcastState<String, String> state) {
        return key -> {
            try {
                return state.get(key);
            } catch (Exception e) {
                throw new IllegalStateException("broadcast state read failed for " + key, e);
            }
        };
    }

    /** The class pack (plus nothing): what a job resolves when it has no broadcast at hand (tests, bounded fallbacks). */
    public static CplmLoopDynamicsProfile resolveDefault(String loopId, String loopType, String assetUuid) {
        return resolve(loopId, loopType, assetUuid, NONE);
    }

    /** Resolution: per-loop override -> class pack from the attributes -> classpath/embedded pack; then engineering + loop model. */
    public static CplmLoopDynamicsProfile resolve(String loopId, String loopType, String assetUuid, Lookup lookup) {
        if (lookup == null) lookup = NONE;
        CplmLoopDynamicsProfile override = null;
        if (assetUuid != null && !assetUuid.isEmpty()) {
            String o = lookup.get(assetUuid + ":" + ATTR_OVERRIDE);
            if (o != null) override = CplmProfileJsonParser.parse(o, CplmLoopDynamicsProfile.ProfileSource.OVERRIDE);
        }
        if (override == null && loopId != null) {
            String o = lookup.get(loopId + ":" + ATTR_OVERRIDE);
            if (o == null) o = lookup.get(ATTR_OVERRIDE + ":" + loopId);
            if (o != null) override = CplmProfileJsonParser.parse(o, CplmLoopDynamicsProfile.ProfileSource.OVERRIDE);
        }

        CplmLoopDynamicsProfile.LoopClass cls = CplmLoopDynamicsProfile.parseClass(loopType);
        if (cls == null || cls == CplmLoopDynamicsProfile.LoopClass.UNKNOWN) {
            cls = CplmLoopDynamicsProfile.inferFromTag(loopId);
        }
        String classJson = lookup.get(ATTR_CLASS_PREFIX + cls.name());
        if (classJson != null) {
            CplmLoopDynamicsProfile fromAttributes = CplmProfileJsonParser.parse(classJson, CplmLoopDynamicsProfile.ProfileSource.LOOP_TYPE);
            if (override != null) {
                override.profileSource = CplmLoopDynamicsProfile.ProfileSource.OVERRIDE;
                return finish(override, loopId, lookup);
            }
            fromAttributes.loopClass = cls;
            return finish(fromAttributes, loopId, lookup);
        }

        CplmLoopDynamicsProfile fallback = CplmLoopDynamicsProfile.resolve(loopId, loopType, override);
        return finish(fallback, loopId, lookup);
    }

    private static CplmLoopDynamicsProfile finish(CplmLoopDynamicsProfile p, String loopId, Lookup lookup) {
        stampVersions(p, lookup);
        applyEngineering(p, loopId, lookup);
        applyLoopModel(p, loopId, lookup);
        return p;
    }

    /**
     * v2.5 (2G.1, R25): the registry's loop model. The acquisition contract, topology and command
     * path are always taken; the dynamic class and objective override the loop_type pack ONLY when
     * the model is EXPLICIT (a person's declaration) - a preset restates the pack and changes nothing.
     * A malformed model is reported (never applied, never fatal to the stream).
     */
    static void applyLoopModel(CplmLoopDynamicsProfile p, String loopId, Lookup lookup) {
        if (p == null || loopId == null || loopId.isEmpty()) return;
        String json = lookup.get(loopId + ":" + ATTR_LOOP_MODEL);
        if (json == null) json = lookup.get(ATTR_LOOP_MODEL + ":" + loopId);
        if (json == null) return;
        try {
            JsonNode n = MAPPER.readTree(json);
            if (n.isTextual()) n = MAPPER.readTree(n.asText());
            p.classificationSource = n.path("classification_source").asText(p.classificationSource);
            p.topology = n.path("topology").asText(p.topology);
            p.commandPath = n.path("command_path").asText(p.commandPath);
            JsonNode acq = n.path("acquisition");
            if (acq.isObject()) {
                p.acquisitionMode = acq.path("mode").asText(p.acquisitionMode);
                p.acquisitionGridS = acq.path("grid_seconds").isNumber() ? acq.path("grid_seconds").asDouble() : 0;
            }
            if (!"EXPLICIT".equals(p.classificationSource)) return;
            if (n.hasNonNull("dynamic_class")) {
                CplmLoopDynamicsProfile.DynamicClass dc = CplmLoopDynamicsProfile.DynamicClass.parse(n.path("dynamic_class").asText());
                if (dc != CplmLoopDynamicsProfile.DynamicClass.UNKNOWN) {
                    p.dynamicClass = dc;
                    p.integrating = dc.integrating();
                }
            }
            if (n.hasNonNull("objective_type")) {
                try {
                    p.serviceObjective = CplmLoopDynamicsProfile.ServiceObjective.valueOf(n.path("objective_type").asText().toUpperCase(Locale.ROOT));
                } catch (IllegalArgumentException ignored) {
                    // RATIO / RAMP / BATCH / SUPERVISORY / UNSET have no engine objective yet: the pack's stays
                }
            }
        } catch (Exception e) {
            com.ams.flink.cplm.config.ConfigRejections.count("LOOP_MODEL_PARSE_ERROR");
            System.out.println("CPLM_LOOP_MODEL_REJECTED loop=" + loopId + " reason=" + e.getMessage());
        }
    }

    /** P3-8 - merge the loop's declared OP / PV engineering range onto the resolved profile. */
    private static void applyEngineering(CplmLoopDynamicsProfile p, String loopId, Lookup lookup) {
        if (p == null || loopId == null || loopId.isEmpty()) return;
        String eng = lookup.get(loopId + ":" + ATTR_ENGINEERING);
        if (eng == null) eng = lookup.get(ATTR_ENGINEERING + ":" + loopId);
        if (eng == null) return;
        try {
            JsonNode n = MAPPER.readTree(eng);
            if (n.isTextual()) n = MAPPER.readTree(n.asText());
            if (n.has("opEngMin")) p.opEngMin = n.path("opEngMin").asDouble(p.opEngMin);
            if (n.has("opEngMax")) p.opEngMax = n.path("opEngMax").asDouble(p.opEngMax);
            if (n.has("pvEngMin")) p.pvEngMin = n.path("pvEngMin").asDouble(p.pvEngMin);
            if (n.has("pvEngMax")) p.pvEngMax = n.path("pvEngMax").asDouble(p.pvEngMax);
            // v2.5: a declared PV range is what makes span-relative G2/G4 metrics legitimate,
            // and a declared OP range is what makes its min/max the G10 limits (R08).
            if (n.has("pvEngMin") && n.has("pvEngMax") && p.pvEngMax - p.pvEngMin > 1e-12) p.pvRangeDeclared = true;
            if (n.has("opEngMin") && n.has("opEngMax") && p.opEngMax - p.opEngMin > 1e-12) p.opRangeDeclared = true;
            // CHG-088: the VP declaration (cplm-api sends the declared value or the command-path default); unknown = EXPECTED.
            String vpa = n.path("vpApplicability").asText("").trim().toUpperCase(java.util.Locale.ROOT);
            if ("EXPECTED".equals(vpa) || "NOT_INSTALLED".equals(vpa) || "NOT_APPLICABLE".equals(vpa)) p.vpApplicability = vpa;
        } catch (Exception e) {
            com.ams.flink.cplm.config.ConfigRejections.count("ENGINEERING_PARSE_ERROR");
            System.out.println("CPLM_ENGINEERING_REJECTED loop=" + loopId + " reason=" + e.getMessage());
        }
    }

    private static void stampVersions(CplmLoopDynamicsProfile p, Lookup lookup) {
        String dyn = lookup.get(ATTR_PROFILE_VERSION);
        String calc = lookup.get(ATTR_CALC_VERSION);
        if (dyn != null && !dyn.isEmpty()) p.dynamicsProfileVersion = dyn.replace("\"", "");
        if (calc != null && !calc.isEmpty()) p.calculationVersion = calc.replace("\"", "");
    }

    /** The legacy per-blob reader (tests and tools). */
    static CplmLoopDynamicsProfile parseProfileJson(String json, CplmLoopDynamicsProfile.ProfileSource source) {
        return CplmProfileJsonParser.parse(json, source);
    }
}
