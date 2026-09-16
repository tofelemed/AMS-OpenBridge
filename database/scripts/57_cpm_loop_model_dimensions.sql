-- v2.5 Task 2G.1 (spec v6 §6.1-6.3, R05 / R25; NR-016, NR-019): the loop model is five SEPARATE
-- dimensions plus an acquisition contract - not a tag-derived loop_type. service_family (what is
-- controlled), dynamic_class (how it responds), objective_type (what "good" means), topology,
-- command_path (what OP drives), and acquisition {mode, grid_seconds, source_filter_s,
-- timestamp_quantization_ms, declared_scan_s}. A value derived from loop_type is stamped
-- PRESET_FROM_LOOP_TYPE; an operator's value is EXPLICIT and a later preset never overwrites it.
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant), scripts/cpm-07-v25-schema.sql (live plant, additive).
\c traverse_cplm

ALTER TABLE cpm.loop_registry
    ADD COLUMN IF NOT EXISTS service_family VARCHAR(40)
        CHECK (service_family IS NULL OR service_family IN ('FLOW','PRESSURE_LIQUID','PRESSURE_GAS','PRESSURE_VAPOUR','LEVEL','TEMPERATURE','COMPOSITION_ANALYZER','PH_CONDUCTIVITY','SPEED_POSITION_POWER','CASCADE','SPLIT_RANGE_OVERRIDE_RATIO','UNKNOWN_UNSTABLE_INVERSE_MIMO')),
    ADD COLUMN IF NOT EXISTS dynamic_class VARCHAR(24)
        CHECK (dynamic_class IS NULL OR dynamic_class IN ('FAST_SELF_REG','SLOW_SELF_REG','INTEGRATING','INTEGRATING_LAG','UNDERDAMPED','UNKNOWN')),
    ADD COLUMN IF NOT EXISTS objective_type VARCHAR(16) NOT NULL DEFAULT 'UNSET'
        CHECK (objective_type IN ('TIGHT','AVERAGING','RATIO','CONSTRAINT','RAMP','BATCH','QUALITY','SUPERVISORY','UNSET')),
    ADD COLUMN IF NOT EXISTS topology VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (topology IN ('SINGLE','CASCADE_MASTER','CASCADE_SLAVE','SPLIT_RANGE','OVERRIDE','RATIO','FEEDFORWARD','UNKNOWN')),
    ADD COLUMN IF NOT EXISTS command_path VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (command_path IN ('OP_TO_VALVE','OP_TO_VFD','OP_TO_SLAVE_SP','UNKNOWN')),
    -- {mode: PERIODIC|RBE|SAMPLE_HOLD, grid_seconds, source_filter_s, timestamp_quantization_ms, declared_scan_s}
    ADD COLUMN IF NOT EXISTS acquisition JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS classification_source VARCHAR(24) NOT NULL DEFAULT 'PRESET_FROM_LOOP_TYPE'
        CHECK (classification_source IN ('PRESET_FROM_LOOP_TYPE','EXPLICIT'));

COMMENT ON COLUMN cpm.loop_registry.classification_source IS
    'PRESET_FROM_LOOP_TYPE = service_family/dynamic_class/objective_type/topology/command_path derived from loop_type; EXPLICIT = set by a person and never overwritten by a preset.';
