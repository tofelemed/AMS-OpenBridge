-- target: traverse_assets
-- Seed only. Apply AFTER schema/02-traverse_assets.sql (Phase 4 / 03-seed.sh).
-- Source: database/scripts/48_hdpe_plant_hierarchy.sql (no \c; no CREATE DATABASE).
-- 1 site, 8 areas (7 sections + Unassigned), 25 units. No devices/measurements.
-- Unit slugs use a 'u' prefix so IoTDB path nodes do not start with a digit.
-- Idempotent: ON CONFLICT DO NOTHING throughout.

-- --- Site --------------------------------------------------------------------
INSERT INTO assets.assets (contextual_path, name, asset_type, description)
VALUES ('hdpe', 'HDPE Plant', 1, 'High-density polyethylene plant')
ON CONFLICT DO NOTHING;

-- --- Areas (sections) --------------------------------------------------------
INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT v.path, v.nm, 2, v.descr, p.id
FROM (VALUES
    ('hdpe/section_100', 'Section 100', 'Section 100 of the HDPE plant'),
    ('hdpe/section_200', 'Section 200', 'Section 200 of the HDPE plant'),
    ('hdpe/section_300', 'Section 300', 'Section 300 of the HDPE plant'),
    ('hdpe/section_400', 'Section 400', 'Section 400 of the HDPE plant'),
    ('hdpe/section_500', 'Section 500', 'Section 500 of the HDPE plant'),
    ('hdpe/section_600', 'Section 600', 'Section 600 of the HDPE plant'),
    ('hdpe/section_800', 'Section 800', 'Section 800 of the HDPE plant'),
    ('hdpe/unassigned', 'Unassigned', 'Catch-all area for tags and loops not yet located in the plant tree')
) AS v(path, nm, descr)
JOIN assets.assets p ON p.contextual_path = 'hdpe' AND NOT p.is_deleted
ON CONFLICT DO NOTHING;

-- --- Units -------------------------------------------------------------------
INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT v.path, v.nm, 3, v.descr, p.id
FROM (VALUES
    ('hdpe/section_100/u1001_polymerization_reactor_1', '1001-Polymerization Reactor 1', '1001-Polymerization Reactor 1 (Section 100)'),
    ('hdpe/section_100/u1002_polymerization_ii_reactor_2', '1002-Polymerization II Reactor 2', '1002-Polymerization II Reactor 2 (Section 100)'),
    ('hdpe/section_100/u1003_polymerization_ii_post_reactor', '1003-Polymerization II Post Reactor', '1003-Polymerization II Post Reactor (Section 100)'),
    ('hdpe/section_100/u1004_suspension_receiver_off_gas_system', '1004-Suspension Receiver Off Gas System', '1004-Suspension Receiver Off Gas System (Section 100)'),
    ('hdpe/section_100/u1005_catalyst_dosage', '1005-Catalyst Dosage', '1005-Catalyst Dosage (Section 100)'),
    ('hdpe/section_100/u1006_catalyst_storage', '1006-Catalyst Storage', '1006-Catalyst Storage (Section 100)'),
    ('hdpe/section_100/u1007_catalyst_preparation', '1007-Catalyst Preparation', '1007-Catalyst Preparation (Section 100)'),
    ('hdpe/section_200/u2002_powder_drying_i', '2002-Powder Drying I', '2002-Powder Drying I (Section 200)'),
    ('hdpe/section_200/u2003_powder_drying_ii_scrubber', '2003-Powder Drying II (Scrubber)', '2003-Powder Drying II (Scrubber) (Section 200)'),
    ('hdpe/section_200/u2005_refrigeration_unit_hexane_supply', '2005-Refrigeration Unit & Hexane Supply', '2005-Refrigeration Unit & Hexane Supply (Section 200)'),
    ('hdpe/section_300/u3001_hexane_purification_i_distillation', '3001-Hexane Purification I (Distillation)', '3001-Hexane Purification I (Distillation) (Section 300)'),
    ('hdpe/section_300/u3002_hexane_purification_ii_adsorbtion', '3002-Hexane Purification II (Adsorbtion)', '3002-Hexane Purification II (Adsorbtion) (Section 300)'),
    ('hdpe/section_300/u3003_wax_recovery_thinfilm_evaporator', '3003-Wax Recovery (Thinfilm Evaporator)', '3003-Wax Recovery (Thinfilm Evaporator) (Section 300)'),
    ('hdpe/section_300/u3004_wax_pretreatment', '3004-Wax Pretreatment', '3004-Wax Pretreatment (Section 300)'),
    ('hdpe/section_300/u3005_butene_recovery', '3005-Butene Recovery', '3005-Butene Recovery (Section 300)'),
    ('hdpe/section_300/u3006_waste_water_pretreatment', '3006-Waste Water Pretreatment', '3006-Waste Water Pretreatment (Section 300)'),
    ('hdpe/section_400/u4001_hexane_tankfarm', '4001-Hexane Tankfarm', '4001-Hexane Tankfarm (Section 400)'),
    ('hdpe/section_400/u4002_catalyst_tankfarm', '4002-Catalyst Tankfarm', '4002-Catalyst Tankfarm (Section 400)'),
    ('hdpe/section_400/u4003_hexane_tankfarm_fire_fighting_water_spray_fixed_system', '4003-Hexane Tankfarm Fire Fighting Water Spray Fixed System', '4003-Hexane Tankfarm Fire Fighting Water Spray Fixed System (Section 400)'),
    ('hdpe/section_500/u5002_hdpe_extruder_feed', '5002-HDPE Extruder Feed', '5002-HDPE Extruder Feed (Section 500)'),
    ('hdpe/section_500/u5003_pellet_water_transport_system_drying', '5003-Pellet Water Transport System & Drying', '5003-Pellet Water Transport System & Drying (Section 500)'),
    ('hdpe/section_600/u6001_pellet_homogenization_i_silo_1_2_3', '6001-Pellet Homogenization I Silo 1, 2 & 3', '6001-Pellet Homogenization I Silo 1, 2 & 3 (Section 600)'),
    ('hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5', '6002-Pellet Homogenization II Silo 4 & 5', '6002-Pellet Homogenization II Silo 4 & 5 (Section 600)'),
    ('hdpe/section_800/u8001_condensate_and_steam_supply_system', '8001-Condensate And Steam Supply System', '8001-Condensate And Steam Supply System (Section 800)'),
    ('hdpe/section_800/u8002_utility_supply', '8002-Utility Supply', '8002-Utility Supply (Section 800)'),
    ('hdpe/unassigned/unassigned', 'Unassigned', 'Catch-all unit for tags and loops not yet located in the plant tree')
) AS v(path, nm, descr)
JOIN assets.assets p ON p.contextual_path = substring(v.path from '^(.*)/[^/]+$') AND NOT p.is_deleted
ON CONFLICT DO NOTHING;

-- --- Origin-ID aliases (Instrumental Pro -> UNS path) ------------------------
INSERT INTO assets.alias_mapping (legacy_path, canonical_path, source_system)
VALUES
    ('HDPE', 'hdpe', 'instrumental-pro'),
    ('HDPE Plant', 'hdpe', 'instrumental-pro'),
    ('Section 100', 'hdpe/section_100', 'instrumental-pro'),
    ('Section 200', 'hdpe/section_200', 'instrumental-pro'),
    ('Section 300', 'hdpe/section_300', 'instrumental-pro'),
    ('Section 400', 'hdpe/section_400', 'instrumental-pro'),
    ('Section 500', 'hdpe/section_500', 'instrumental-pro'),
    ('Section 600', 'hdpe/section_600', 'instrumental-pro'),
    ('Section 800', 'hdpe/section_800', 'instrumental-pro'),
    ('1001-Polymerization Reactor 1', 'hdpe/section_100/u1001_polymerization_reactor_1', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1001-Polymerization Reactor 1', 'hdpe/section_100/u1001_polymerization_reactor_1', 'instrumental-pro'),
    ('1002-Polymerization II Reactor 2', 'hdpe/section_100/u1002_polymerization_ii_reactor_2', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1002-Polymerization II Reactor 2', 'hdpe/section_100/u1002_polymerization_ii_reactor_2', 'instrumental-pro'),
    ('1003-Polymerization II Post Reactor', 'hdpe/section_100/u1003_polymerization_ii_post_reactor', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1003-Polymerization II Post Reactor', 'hdpe/section_100/u1003_polymerization_ii_post_reactor', 'instrumental-pro'),
    ('1004-Suspension Receiver Off Gas System', 'hdpe/section_100/u1004_suspension_receiver_off_gas_system', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1004-Suspension Receiver Off Gas System', 'hdpe/section_100/u1004_suspension_receiver_off_gas_system', 'instrumental-pro'),
    ('1005-Catalyst Dosage', 'hdpe/section_100/u1005_catalyst_dosage', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1005-Catalyst Dosage', 'hdpe/section_100/u1005_catalyst_dosage', 'instrumental-pro'),
    ('1006-Catalyst Storage', 'hdpe/section_100/u1006_catalyst_storage', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1006-Catalyst Storage', 'hdpe/section_100/u1006_catalyst_storage', 'instrumental-pro'),
    ('1007-Catalyst Preparation', 'hdpe/section_100/u1007_catalyst_preparation', 'instrumental-pro'),
    ('HDPE Plant\Section 100\1007-Catalyst Preparation', 'hdpe/section_100/u1007_catalyst_preparation', 'instrumental-pro'),
    ('2002-Powder Drying I', 'hdpe/section_200/u2002_powder_drying_i', 'instrumental-pro'),
    ('HDPE Plant\Section 200\2002-Powder Drying I', 'hdpe/section_200/u2002_powder_drying_i', 'instrumental-pro'),
    ('2003-Powder Drying II (Scrubber)', 'hdpe/section_200/u2003_powder_drying_ii_scrubber', 'instrumental-pro'),
    ('HDPE Plant\Section 200\2003-Powder Drying II (Scrubber)', 'hdpe/section_200/u2003_powder_drying_ii_scrubber', 'instrumental-pro'),
    ('2005-Refrigeration Unit & Hexane Supply', 'hdpe/section_200/u2005_refrigeration_unit_hexane_supply', 'instrumental-pro'),
    ('HDPE Plant\Section 200\2005-Refrigeration Unit & Hexane Supply', 'hdpe/section_200/u2005_refrigeration_unit_hexane_supply', 'instrumental-pro'),
    ('3001-Hexane Purification I (Distillation)', 'hdpe/section_300/u3001_hexane_purification_i_distillation', 'instrumental-pro'),
    ('HDPE Plant\Section 300\3001-Hexane Purification I (Distillation)', 'hdpe/section_300/u3001_hexane_purification_i_distillation', 'instrumental-pro'),
    ('3002-Hexane Purification II (Adsorbtion)', 'hdpe/section_300/u3002_hexane_purification_ii_adsorbtion', 'instrumental-pro'),
    ('HDPE Plant\Section 300\3002-Hexane Purification II (Adsorbtion)', 'hdpe/section_300/u3002_hexane_purification_ii_adsorbtion', 'instrumental-pro'),
    ('3003-Wax Recovery (Thinfilm Evaporator)', 'hdpe/section_300/u3003_wax_recovery_thinfilm_evaporator', 'instrumental-pro'),
    ('HDPE Plant\Section 300\3003-Wax Recovery (Thinfilm Evaporator)', 'hdpe/section_300/u3003_wax_recovery_thinfilm_evaporator', 'instrumental-pro'),
    ('3004-Wax Pretreatment', 'hdpe/section_300/u3004_wax_pretreatment', 'instrumental-pro'),
    ('HDPE Plant\Section 300\3004-Wax Pretreatment', 'hdpe/section_300/u3004_wax_pretreatment', 'instrumental-pro'),
    ('3005-Butene Recovery', 'hdpe/section_300/u3005_butene_recovery', 'instrumental-pro'),
    ('HDPE Plant\Section 300\3005-Butene Recovery', 'hdpe/section_300/u3005_butene_recovery', 'instrumental-pro'),
    ('3006-Waste Water Pretreatment', 'hdpe/section_300/u3006_waste_water_pretreatment', 'instrumental-pro'),
    ('HDPE Plant\Section 300\3006-Waste Water Pretreatment', 'hdpe/section_300/u3006_waste_water_pretreatment', 'instrumental-pro'),
    ('4001-Hexane Tankfarm', 'hdpe/section_400/u4001_hexane_tankfarm', 'instrumental-pro'),
    ('HDPE Plant\Section 400\4001-Hexane Tankfarm', 'hdpe/section_400/u4001_hexane_tankfarm', 'instrumental-pro'),
    ('4002-Catalyst Tankfarm', 'hdpe/section_400/u4002_catalyst_tankfarm', 'instrumental-pro'),
    ('HDPE Plant\Section 400\4002-Catalyst Tankfarm', 'hdpe/section_400/u4002_catalyst_tankfarm', 'instrumental-pro'),
    ('4003-Hexane Tankfarm Fire Fighting Water Spray Fixed System', 'hdpe/section_400/u4003_hexane_tankfarm_fire_fighting_water_spray_fixed_system', 'instrumental-pro'),
    ('HDPE Plant\Section 400\4003-Hexane Tankfarm Fire Fighting Water Spray Fixed System', 'hdpe/section_400/u4003_hexane_tankfarm_fire_fighting_water_spray_fixed_system', 'instrumental-pro'),
    ('5002-HDPE Extruder Feed', 'hdpe/section_500/u5002_hdpe_extruder_feed', 'instrumental-pro'),
    ('HDPE Plant\Section 500\5002-HDPE Extruder Feed', 'hdpe/section_500/u5002_hdpe_extruder_feed', 'instrumental-pro'),
    ('5003-Pellet Water Transport System & Drying', 'hdpe/section_500/u5003_pellet_water_transport_system_drying', 'instrumental-pro'),
    ('HDPE Plant\Section 500\5003-Pellet Water Transport System & Drying', 'hdpe/section_500/u5003_pellet_water_transport_system_drying', 'instrumental-pro'),
    ('6001-Pellet Homogenization I Silo 1, 2 & 3', 'hdpe/section_600/u6001_pellet_homogenization_i_silo_1_2_3', 'instrumental-pro'),
    ('HDPE Plant\Section 600\6001-Pellet Homogenization I Silo 1, 2 & 3', 'hdpe/section_600/u6001_pellet_homogenization_i_silo_1_2_3', 'instrumental-pro'),
    ('6002-Pellet Homogenization II Silo 4 & 5', 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5', 'instrumental-pro'),
    ('HDPE Plant\Section 600\6002-Pellet Homogenization II Silo 4 & 5', 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5', 'instrumental-pro'),
    ('8001-Condensate And Steam Supply System', 'hdpe/section_800/u8001_condensate_and_steam_supply_system', 'instrumental-pro'),
    ('HDPE Plant\Section 800\8001-Condensate And Steam Supply System', 'hdpe/section_800/u8001_condensate_and_steam_supply_system', 'instrumental-pro'),
    ('8002-Utility Supply', 'hdpe/section_800/u8002_utility_supply', 'instrumental-pro'),
    ('HDPE Plant\Section 800\8002-Utility Supply', 'hdpe/section_800/u8002_utility_supply', 'instrumental-pro')
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE 'HDPE plant hierarchy seeded (site + areas + units + aliases)'; END $$;
