-- CHG-224 plant check (read only, traverse_cplm): values stored for properties that can no longer be set in Gate Configuration.
-- (1) every bundle still in use whose non-FACTORY layers hold such a value - the next version made from it drops them (D1);
--     a DRAFT / VALIDATED / APPROVED one that holds one in its own layer fails Validate until "Remove" is used.
SELECT b.site, b.scope_kind, b.scope_ref, b.version, b.state, l->>'kind' AS layer, k AS property, l->'content'->k AS stored
FROM cpm.gate_config_bundle b
CROSS JOIN LATERAL jsonb_array_elements(b.layers) l
CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(l->'content') = 'object' THEN l->'content' ELSE '{}'::jsonb END) k
WHERE b.state IN ('DRAFT', 'VALIDATED', 'SHADOW_EVALUATED', 'APPROVED', 'SCHEDULED', 'PREPARED', 'ACTIVE_VERIFIED')
  AND l->>'kind' <> 'FACTORY'
  AND k <> ALL (ARRAY[
    'G0.bad_fraction_max',
    'G0.coverage_min',
    'G1.auto_fraction_min',
    'G10.limit_dwell_warn_s',
    'G10.limit_tolerance_pp',
    'G10.nonfollowing_dwell_s',
    'G10.nonfollowing_error_pp',
    'G10.occupancy_warn_fraction',
    'G11.freeze_dwell_s',
    'G11.freeze_tolerance_pv_eu',
    'G11.instrument_verified_max_age_s',
    'G12.capture_max_s',
    'G12.crossing_dwell_s',
    'G12.delay_max_s',
    'G12.delay_min_s',
    'G12.fit_max_iterations',
    'G12.fit_relative_tolerance',
    'G12.gain_abs_max',
    'G12.lambda_s',
    'G12.noise_multiplier',
    'G12.post_support_min_s',
    'G12.pre_support_s',
    'G12.settling_abs_band_pv_eu',
    'G12.settling_relative_band',
    'G12.settling_tail_dwell_s',
    'G12.step_min_input_eu',
    'G12.step_min_span_fraction',
    'G12.tau_max_s',
    'G12.tau_min_s',
    'G13.coherence_display_min',
    'G13.lag_max_s',
    'G13.max_peers',
    'G13.min_compatible_support_s',
    'G15.episode_persistence_s',
    'G15.minimum_evidence_groups',
    'G15.recovery_support_s',
    'G2.stability_band_pv_eu',
    'G2.stability_band_span_fraction',
    'G2r.applied_input_region_max',
    'G2r.applied_input_region_min',
    'G2r.pv_region_max',
    'G2r.pv_region_min',
    'G3.error_band_span_fraction',
    'G3.objective_compliance_min',
    'G4.activity_high_ratio',
    'G4.activity_warn_ratio',
    'G4.reversal_deadband_pp',
    'G5.min_complete_cycles',
    'G5.min_samples_per_period',
    'G5.period_max_s',
    'G5.period_min_s',
    'G5.regularity_min',
    'G6.overlap_fraction',
    'G6.peak_to_background_min',
    'G6.segment_samples',
    'G7.shape_score_high',
    'G8.asymmetry_display_threshold',
    'G9.area_valid_max',
    'G9.area_valid_min',
    'G9.corner_angle_deg',
    'G9.geometry_contribution_cap',
    'G9.min_command_range_pp',
    'G9.role'
  ])
ORDER BY b.site, b.scope_kind, b.scope_ref, b.version, layer, property;

-- (2) D5 / B6: an active bundle whose layer sets a G6 period or a G7 / G9 cycle count different from G5 in the same layer
--     (the engine applies the copy after G5 today; after the next version the loop follows G5).
SELECT b.site, b.scope_kind, b.scope_ref, b.version, l->>'kind' AS layer,
       l->'content'->'G5.period_min_s' AS g5_min, l->'content'->'G6.period_min_s' AS g6_min,
       l->'content'->'G5.period_max_s' AS g5_max, l->'content'->'G6.period_max_s' AS g6_max,
       l->'content'->'G5.min_complete_cycles' AS g5_cycles, l->'content'->'G7.min_accepted_cycles' AS g7_cycles, l->'content'->'G9.min_accepted_cycles' AS g9_cycles
FROM cpm.config_active a
JOIN cpm.gate_config_bundle b ON b.bundle_id = a.bundle_id
CROSS JOIN LATERAL jsonb_array_elements(b.layers) l
WHERE l->>'kind' IN ('SITE', 'PROFILE', 'LOOP')
  AND ((l->'content' ? 'G6.period_min_s' AND (l->'content'->'G6.period_min_s')::text::float8 IS DISTINCT FROM (l->'content'->'G5.period_min_s')::text::float8)
    OR (l->'content' ? 'G6.period_max_s' AND (l->'content'->'G6.period_max_s')::text::float8 IS DISTINCT FROM (l->'content'->'G5.period_max_s')::text::float8)
    OR (l->'content' ? 'G7.min_accepted_cycles' AND (l->'content'->'G7.min_accepted_cycles')::text::float8 IS DISTINCT FROM (l->'content'->'G5.min_complete_cycles')::text::float8)
    OR (l->'content' ? 'G9.min_accepted_cycles' AND (l->'content'->'G9.min_accepted_cycles')::text::float8 IS DISTINCT FROM (l->'content'->'G5.min_complete_cycles')::text::float8));
