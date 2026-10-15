package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.response.ResponseJobConfig;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * v2.5 Task 3A.2 / 3C.1: THE table of which catalogue property becomes which engine setting. A
 * bundle's resolved properties are applied through this and nothing else, so the set of ids a job
 * can read is exactly the keys here - the CAPABILITY record reports them, the coverage test proves
 * every flink-consumed property is either here or declared unsupported with a reason (NR-046).
 * A value of the wrong type is refused by name; an unknown id is refused by name; nothing is
 * silently ignored.
 */
public final class BundleProfileMapper {
    private BundleProfileMapper() {}

    interface ProfileSetter {
        void set(CplmLoopDynamicsProfile p, JsonNode v, String property);
    }

    interface ResponseSetter {
        void set(ResponseJobConfig c, JsonNode v, String property);
    }

    private static final Map<String, ProfileSetter> PROFILE = new LinkedHashMap<>();
    private static final Map<String, ResponseSetter> RESPONSE = new LinkedHashMap<>();

    static {
        // G0 / G1 (short)
        PROFILE.put("G0.coverage_min", (p, v, n) -> p.g0CoverageMin = num(v, n));
        PROFILE.put("G0.bad_fraction_max", (p, v, n) -> p.g0BadFractionMax = num(v, n));
        PROFILE.put("G1.auto_fraction_min", (p, v, n) -> p.g1AutoFractionMin = num(v, n));
        // G2 (short)
        PROFILE.put("G2.stability_band_pv_eu", (p, v, n) -> p.spStabilityBandPvEu = num(v, n));
        PROFILE.put("G2.stability_band_span_fraction", (p, v, n) -> p.spStabilityBandSpanFraction = num(v, n));
        // G2r (short)
        PROFILE.put("G2r.pv_region_min", (p, v, n) -> p.regionPvMin = num(v, n));
        PROFILE.put("G2r.pv_region_max", (p, v, n) -> p.regionPvMax = num(v, n));
        PROFILE.put("G2r.applied_input_region_min", (p, v, n) -> p.regionOpMin = num(v, n));
        PROFILE.put("G2r.applied_input_region_max", (p, v, n) -> p.regionOpMax = num(v, n));
        // G3 (short)
        PROFILE.put("G3.error_band_span_fraction", (p, v, n) -> p.goodErrorBandPctOfSpan = num(v, n));
        PROFILE.put("G3.objective_compliance_min", (p, v, n) -> p.goodErrorPctPassMin = complianceFraction(num(v, n)));
        // G4 (short)
        PROFILE.put("G4.activity_warn_ratio", (p, v, n) -> p.g4ActivityWarnRatio = num(v, n));
        PROFILE.put("G4.activity_high_ratio", (p, v, n) -> p.g4ActivityHighRatio = num(v, n));
        PROFILE.put("G4.reversal_deadband_pp", (p, v, n) -> p.opDeadbandPct = num(v, n));
        // G5 / G6 (long)
        PROFILE.put("G5.period_min_s", (p, v, n) -> p.tauMinS = num(v, n));
        PROFILE.put("G5.period_max_s", (p, v, n) -> p.tauMaxS = num(v, n));
        PROFILE.put("G5.min_complete_cycles", (p, v, n) -> p.minValidCycles = integer(v, n));
        PROFILE.put("G5.min_samples_per_period", (p, v, n) -> p.minSamplesPerPeriod = integer(v, n));
        PROFILE.put("G5.regularity_min", (p, v, n) -> p.acfRegularityMin = num(v, n));
        PROFILE.put("G6.period_min_s", (p, v, n) -> p.tauMinS = num(v, n));
        PROFILE.put("G6.period_max_s", (p, v, n) -> p.tauMaxS = num(v, n));
        PROFILE.put("G6.peak_to_background_min", (p, v, n) -> p.fftPeakToMedianMin = num(v, n));
        PROFILE.put("G6.segment_samples", (p, v, n) -> p.g6SegmentSamples = integer(v, n));
        PROFILE.put("G6.overlap_fraction", (p, v, n) -> p.g6OverlapFraction = num(v, n));
        // G7 / G8 / G9 (long)
        PROFILE.put("G7.role", (p, v, n) -> p.shapeRole = role(v, n));
        PROFILE.put("G7.shape_score_high", (p, v, n) -> p.g7ShapeScoreHigh = num(v, n));
        PROFILE.put("G8.asymmetry_display_threshold", (p, v, n) -> p.g8AsymmetryDisplayThreshold = num(v, n));
        PROFILE.put("G7.min_accepted_cycles", (p, v, n) -> p.minValidCycles = integer(v, n));
        PROFILE.put("G8.role", (p, v, n) -> p.horchRole = role(v, n));
        PROFILE.put("G9.role", (p, v, n) -> p.geometryRole = role(v, n));
        PROFILE.put("G9.area_valid_min", (p, v, n) -> p.phaseAreaPerCycleLo = num(v, n));
        PROFILE.put("G9.area_valid_max", (p, v, n) -> p.phaseAreaPerCycleHi = num(v, n));
        PROFILE.put("G9.corner_angle_deg", (p, v, n) -> p.cornerAngleDeg = num(v, n));
        PROFILE.put("G9.min_command_range_pp", (p, v, n) -> p.opTravelFloorPct = num(v, n));
        PROFILE.put("G9.geometry_contribution_cap", (p, v, n) -> p.priorGeometry = num(v, n));
        PROFILE.put("G9.min_accepted_cycles", (p, v, n) -> p.minValidCycles = integer(v, n));
        // G10 / G11 (long + condition)
        PROFILE.put("G10.role", (p, v, n) -> p.saturationRole = role(v, n));
        PROFILE.put("G10.limit_tolerance_pp", (p, v, n) -> p.limitTolerancePp = num(v, n));
        PROFILE.put("G10.limit_dwell_warn_s", (p, v, n) -> p.limitDwellWarnS = num(v, n));
        PROFILE.put("G10.occupancy_warn_fraction", (p, v, n) -> p.satWarnOccupancy = num(v, n));
        PROFILE.put("G10.nonfollowing_error_pp", (p, v, n) -> p.nonfollowingErrorPp = num(v, n));
        PROFILE.put("G10.nonfollowing_dwell_s", (p, v, n) -> p.nonfollowingDwellS = num(v, n));
        PROFILE.put("G11.freeze_tolerance_pv_eu", (p, v, n) -> p.freezeToleranceEu = num(v, n));
        PROFILE.put("G11.freeze_dwell_s", (p, v, n) -> p.freezeDwellS = num(v, n));
        PROFILE.put("G11.instrument_verified_max_age_s", (p, v, n) -> p.vpMaxAgeS = num(v, n));
        // G13 (long)
        PROFILE.put("G13.lag_max_s", (p, v, n) -> p.g13LagMaxS = num(v, n));
        PROFILE.put("G13.coherence_display_min", (p, v, n) -> p.g13CoherenceMin = num(v, n));
        PROFILE.put("G13.min_compatible_support_s", (p, v, n) -> p.g13MinCompatibleSupportS = num(v, n));
        PROFILE.put("G13.max_peers", (p, v, n) -> p.g13MaxPeers = integer(v, n));
        // G15 (fusion)
        PROFILE.put("G15.recovery_support_s", (p, v, n) -> p.recoverySupportS = num(v, n));
        PROFILE.put("G15.minimum_evidence_groups", (p, v, n) -> p.minNonGeometryEvidences = integer(v, n));
        PROFILE.put("G15.episode_persistence_s", (p, v, n) -> p.persistenceWindows = Math.max(1, (int) Math.ceil(num(v, n) / (12 * 3600.0))));

        // G12 (response)
        RESPONSE.put("G12.step_min_input_eu", (c, v, n) -> c.stepMinInputEu = num(v, n));
        RESPONSE.put("G12.step_min_span_fraction", (c, v, n) -> c.stepMinSpanFraction = num(v, n));
        RESPONSE.put("G12.noise_multiplier", (c, v, n) -> c.noiseMultiplier = num(v, n));
        RESPONSE.put("G12.pre_support_s", (c, v, n) -> c.preSupportS = num(v, n));
        RESPONSE.put("G12.post_support_min_s", (c, v, n) -> c.minCaptureS = num(v, n));
        RESPONSE.put("G12.capture_max_s", (c, v, n) -> c.maxCaptureS = num(v, n));
        RESPONSE.put("G12.crossing_dwell_s", (c, v, n) -> c.crossingDwellS = num(v, n));
        RESPONSE.put("G12.settling_tail_dwell_s", (c, v, n) -> c.tailDwellS = num(v, n));
        RESPONSE.put("G12.settling_relative_band", (c, v, n) -> c.relSettlingBand = num(v, n));
        RESPONSE.put("G12.settling_abs_band_pv_eu", (c, v, n) -> c.absSettlingBandEu = num(v, n));
        RESPONSE.put("G12.delay_min_s", (c, v, n) -> c.delayMinS = num(v, n));
        RESPONSE.put("G12.delay_max_s", (c, v, n) -> c.thetaMaxS = num(v, n));
        RESPONSE.put("G12.tau_max_s", (c, v, n) -> c.tauMaxS = num(v, n));
        RESPONSE.put("G12.tau_min_s", (c, v, n) -> c.tauMinS = num(v, n));
        RESPONSE.put("G12.gain_abs_max", (c, v, n) -> c.gainAbsMax = num(v, n));
        RESPONSE.put("G12.fit_max_iterations", (c, v, n) -> c.fitMaxIterations = integer(v, n));
        RESPONSE.put("G12.fit_relative_tolerance", (c, v, n) -> c.fitRelativeTolerance = num(v, n));
        RESPONSE.put("G12.lambda_s", (c, v, n) -> c.lambdaS = num(v, n));
    }

    /** The property ids the profile-consuming jobs can apply. */
    public static Set<String> profileProperties() {
        return Collections.unmodifiableSet(new TreeSet<>(PROFILE.keySet()));
    }

    /** The property ids the response job can apply. */
    public static Set<String> responseProperties() {
        return Collections.unmodifiableSet(new TreeSet<>(RESPONSE.keySet()));
    }

    /** Applies every property of {@code resolved} to the profile; returns the ids applied; refuses unknown ids and wrong types by name. */
    public static List<String> apply(CplmLoopDynamicsProfile p, JsonNode resolved) {
        List<String> applied = new ArrayList<>();
        if (resolved == null || !resolved.isObject()) return applied;
        Iterator<Map.Entry<String, JsonNode>> it = resolved.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            if (e.getValue() == null || e.getValue().isNull()) continue;           // NO_VALUE: the pack's value stays (stated on the bundle)
            ProfileSetter s = PROFILE.get(e.getKey());
            if (s == null) {
                if (RESPONSE.containsKey(e.getKey())) continue;                    // the response job's, not this operator's
                throw new IllegalArgumentException("'" + e.getKey() + "' is not a property this build applies to a profile");
            }
            s.set(p, e.getValue(), e.getKey());
            applied.add(e.getKey());
        }
        return applied;
    }

    public static List<String> apply(ResponseJobConfig c, JsonNode resolved) {
        List<String> applied = new ArrayList<>();
        if (resolved == null || !resolved.isObject()) return applied;
        Iterator<Map.Entry<String, JsonNode>> it = resolved.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            if (e.getValue() == null || e.getValue().isNull()) continue;
            ResponseSetter s = RESPONSE.get(e.getKey());
            if (s == null) continue;                                              // the other tiers' properties ride the same bundle
            s.set(c, e.getValue(), e.getKey());
            applied.add(e.getKey());
        }
        return applied;
    }

    /**
     * CHG-096 (SME review 2, C4): G3.objective_compliance_min is a fraction (0.5 = 50 % of the window in band).
     * Bundles written before CHG-096 stored it divided by 100 (0.005 = 50 %), and published bundles are
     * content-hashed, so they are read as they are: a value of 0.01 or less is the old encoding. A real
     * compliance target under 1 % means nothing, so the two ranges never meet.
     */
    static double complianceFraction(double stored) {
        return stored <= 0.01 ? stored * 100.0 : stored;
    }

    static double num(JsonNode v, String property) {
        if (!v.isNumber()) throw new IllegalArgumentException("'" + property + "' must be a number, got " + v.getNodeType());
        double d = v.asDouble();
        if (!Double.isFinite(d)) throw new IllegalArgumentException("'" + property + "' must be finite");
        return d;
    }

    static int integer(JsonNode v, String property) {
        if (!v.isIntegralNumber()) throw new IllegalArgumentException("'" + property + "' must be an integer, got " + v.getNodeType());
        return v.asInt();
    }

    static String text(JsonNode v, String property) {
        if (!v.isTextual()) throw new IllegalArgumentException("'" + property + "' must be text, got " + v.getNodeType());
        return v.asText();
    }

    /** The catalogue's role vocabulary onto the engine's: REQUIRED_CONTEXT -> BLOCKING, INAPPLICABLE -> DISPLAY_ONLY (never a promotion). */
    static CplmLoopDynamicsProfile.GateRole role(JsonNode v, String property) {
        switch (text(v, property).toUpperCase(Locale.ROOT)) {
            case "REQUIRED_CONTEXT": return CplmLoopDynamicsProfile.GateRole.BLOCKING;
            case "PRIMARY": return CplmLoopDynamicsProfile.GateRole.PRIMARY;
            case "SUPPORTING": return CplmLoopDynamicsProfile.GateRole.SUPPORTING;
            case "DISPLAY_ONLY":
            case "INAPPLICABLE": return CplmLoopDynamicsProfile.GateRole.DISPLAY_ONLY;
            default: throw new IllegalArgumentException("'" + property + "' role '" + v.asText() + "' is not in the catalogue vocabulary");
        }
    }
}
