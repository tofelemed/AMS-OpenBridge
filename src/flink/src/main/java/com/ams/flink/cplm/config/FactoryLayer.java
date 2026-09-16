package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.response.ResponseJobConfig;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;
import java.util.TreeMap;

/**
 * v2.5 Task 3C.1 (spec v6 §5.3): the FACTORY layer of every bundle and the PROFILE layer per class
 * pack, exported from the code that defines them - the catalogue's starting values for the factory
 * layer, the YAML/pack profile values (read back through the same mapping the bundle applies) for
 * each gate profile - so the control plane's first draft restates exactly what the engine runs
 * today, and FactoryLayerParityTest fails the build when the packs and the checked-in JSON drift.
 */
public final class FactoryLayer {
    private FactoryLayer() {}

    /** property -> value of the engine's profile for the mapped properties (the inverse of BundleProfileMapper for a pack). */
    public static Map<String, Object> profileValues(CplmLoopDynamicsProfile p) {
        Map<String, Object> v = new TreeMap<>();
        v.put("G0.coverage_min", p.g0CoverageMin);
        v.put("G0.bad_fraction_max", p.g0BadFractionMax);
        v.put("G1.auto_fraction_min", p.g1AutoFractionMin);
        if (p.spStabilityBandPvEu != null) v.put("G2.stability_band_pv_eu", p.spStabilityBandPvEu);
        v.put("G2.stability_band_span_fraction", p.spStabilityBandSpanFraction);
        if (Double.isFinite(p.regionPvMin)) v.put("G2r.pv_region_min", p.regionPvMin);
        if (Double.isFinite(p.regionPvMax)) v.put("G2r.pv_region_max", p.regionPvMax);
        if (Double.isFinite(p.regionOpMin)) v.put("G2r.applied_input_region_min", p.regionOpMin);
        if (Double.isFinite(p.regionOpMax)) v.put("G2r.applied_input_region_max", p.regionOpMax);
        v.put("G3.error_band_span_fraction", p.goodErrorBandPctOfSpan);
        v.put("G3.objective_compliance_min", p.goodErrorPctPassMin / 100.0);
        v.put("G4.activity_warn_ratio", p.g4ActivityWarnRatio);
        v.put("G4.activity_high_ratio", p.g4ActivityHighRatio);
        v.put("G4.reversal_deadband_pp", p.opDeadbandPct);
        v.put("G5.period_min_s", p.tauMinS);
        v.put("G5.period_max_s", p.tauMaxS);
        v.put("G5.min_complete_cycles", (long) p.minValidCycles);
        v.put("G5.min_samples_per_period", (long) p.minSamplesPerPeriod);
        v.put("G5.regularity_min", p.acfRegularityMin);
        v.put("G6.period_min_s", p.tauMinS);
        v.put("G6.period_max_s", p.tauMaxS);
        v.put("G6.peak_to_background_min", p.fftPeakToMedianMin);
        v.put("G6.segment_samples", (long) p.g6SegmentSamples);
        v.put("G6.overlap_fraction", p.g6OverlapFraction);
        v.put("G7.role", role(p.shapeRole));
        v.put("G7.shape_score_high", p.g7ShapeScoreHigh);
        v.put("G7.min_accepted_cycles", (long) p.minValidCycles);
        v.put("G8.role", role(p.horchRole));
        v.put("G8.asymmetry_display_threshold", p.g8AsymmetryDisplayThreshold);
        v.put("G9.role", role(p.geometryRole));
        v.put("G9.area_valid_min", p.phaseAreaPerCycleLo);
        v.put("G9.area_valid_max", p.phaseAreaPerCycleHi);
        v.put("G9.corner_angle_deg", p.cornerAngleDeg);
        v.put("G9.min_command_range_pp", p.opTravelFloorPct);
        v.put("G9.geometry_contribution_cap", p.priorGeometry);
        v.put("G9.min_accepted_cycles", (long) p.minValidCycles);
        v.put("G10.role", role(p.saturationRole));
        v.put("G10.limit_tolerance_pp", p.limitTolerancePp);
        v.put("G10.limit_dwell_warn_s", p.limitDwellWarnS);
        v.put("G10.occupancy_warn_fraction", p.satWarnOccupancy);
        v.put("G10.nonfollowing_error_pp", p.nonfollowingErrorPp);
        v.put("G10.nonfollowing_dwell_s", p.nonfollowingDwellS);
        v.put("G11.freeze_tolerance_pv_eu", p.freezeToleranceEu);
        v.put("G11.freeze_dwell_s", p.freezeDwellS);
        v.put("G11.instrument_verified_max_age_s", p.vpMaxAgeS);
        v.put("G13.lag_max_s", p.g13LagMaxS);
        v.put("G13.coherence_display_min", p.g13CoherenceMin);
        v.put("G13.min_compatible_support_s", p.g13MinCompatibleSupportS);
        v.put("G13.max_peers", (long) p.g13MaxPeers);
        v.put("G15.recovery_support_s", p.recoverySupportS);
        v.put("G15.minimum_evidence_groups", (long) p.minNonGeometryEvidences);
        v.put("G15.episode_persistence_s", p.persistenceWindows * 12.0 * 3600.0);
        return v;
    }

    /** property -> value of the response job's defaults for the mapped G12 properties. */
    public static Map<String, Object> responseValues(ResponseJobConfig c) {
        Map<String, Object> v = new TreeMap<>();
        v.put("G12.step_min_input_eu", c.stepMinInputEu);
        v.put("G12.step_min_span_fraction", c.stepMinSpanFraction);
        v.put("G12.noise_multiplier", c.noiseMultiplier);
        v.put("G12.pre_support_s", c.preSupportS);
        v.put("G12.post_support_min_s", c.minCaptureS);
        v.put("G12.capture_max_s", c.maxCaptureS);
        v.put("G12.crossing_dwell_s", c.crossingDwellS);
        v.put("G12.settling_tail_dwell_s", c.tailDwellS);
        v.put("G12.settling_relative_band", c.relSettlingBand);
        v.put("G12.settling_abs_band_pv_eu", c.absSettlingBandEu);
        v.put("G12.delay_min_s", c.delayMinS);
        v.put("G12.delay_max_s", c.thetaMaxS);
        v.put("G12.tau_min_s", c.tauMinS);
        v.put("G12.tau_max_s", c.tauMaxS);
        v.put("G12.gain_abs_max", c.gainAbsMax);
        v.put("G12.fit_max_iterations", (long) c.fitMaxIterations);
        v.put("G12.fit_relative_tolerance", c.fitRelativeTolerance);
        v.put("G12.lambda_s", c.lambdaS);
        return v;
    }

    private static String role(CplmLoopDynamicsProfile.GateRole r) {
        if (r == null) return "SUPPORTING";
        switch (r) {
            case BLOCKING: return "REQUIRED_CONTEXT";
            case PRIMARY: return "PRIMARY";
            case DISPLAY_ONLY: return "DISPLAY_ONLY";
            default: return "SUPPORTING";
        }
    }

    /**
     * {"factory": {catalogue starting values + the response job defaults}, "profiles": {gateProfileId: pack values}}.
     * A pack value the catalogue types as integer is written as an integer; every value is validated
     * against the catalogue before it is written, so the exported layer is itself a valid layer.
     */
    public static ObjectNode export(ObjectMapper mapper) {
        PropertyCatalogue cat = PropertyCatalogue.current();
        ObjectNode root = mapper.createObjectNode();
        root.put("schema", "traverse.cpa.gate-config.factory-layer/v1");
        root.put("catalogue_hash", cat.catalogueHash());
        ObjectNode factory = root.putObject("factory");
        for (PropertyCatalogue.Entry e : cat.entries()) if (e.defaultValue != null) put(factory, e, e.defaultValue);
        for (Map.Entry<String, Object> v : responseValues(new ResponseJobConfig()).entrySet()) {
            PropertyCatalogue.Entry e = cat.find(v.getKey());
            if (e != null) put(factory, e, v.getValue());
        }
        ObjectNode profiles = root.putObject("profiles");
        for (CplmLoopDynamicsProfile.LoopClass cls : CplmLoopDynamicsProfile.LoopClass.values()) {
            CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(cls);
            ObjectNode layer = profiles.putObject(p.gateProfileId);
            for (Map.Entry<String, Object> v : profileValues(p).entrySet()) {
                PropertyCatalogue.Entry e = cat.find(v.getKey());
                if (e != null) put(layer, e, v.getValue());
            }
        }
        return root;
    }

    /**
     * A pack value outside the catalogue's bounds is an engine SENTINEL ("0 = not approved / not
     * configured"), not a value: it is left out so the property resolves to NO_VALUE, stated.
     */
    private static void put(ObjectNode n, PropertyCatalogue.Entry e, Object value) {
        if (value instanceof Boolean) n.put(e.property, (Boolean) value);
        else if (value instanceof String) n.put(e.property, (String) value);
        else if (value instanceof Number) {
            double d = ((Number) value).doubleValue();
            if (!Double.isFinite(d)) return;
            if (e.minimum() != null && d < e.minimum()) return;
            if (e.maximum() != null && d > e.maximum()) return;
            if ("integer".equals(e.type)) n.put(e.property, Math.round(d)); else n.put(e.property, d);
        }
    }
}
