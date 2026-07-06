-- ═══════════════════════════════════════════════════════════════════════════
-- Phase A: Realistic 2-site plant model (houston + dallas)
-- Additive + idempotent. Extends the UNS catalog the HMI Designer binds to.
-- Transport fields (Sparkplug group/edge/device/metric, Redis key, IoTDB path)
-- are COMPUTED by asset-model/Models/Asset.cs from contextual_path — no columns.
-- Apply to running DB:  psql traverse_assets < 15_traverse_assets_2site_plant.sql
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_assets

-- Helper: insert a measurement under a device path
-- (kept inline as INSERT..SELECT for parent_id resolution, matching 10_*.sql style)

-- ─── SITE: houston (already seeded as site+crude1+pump101; we extend it) ──────
INSERT INTO assets.assets (contextual_path, name, asset_type, description)
VALUES ('houston', 'Houston Refinery', 1, 'Houston refinery site')
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT 'houston/crude1', 'Crude Unit 1', 3, 'Crude distillation unit 1', id
FROM assets.assets WHERE contextual_path = 'houston' ON CONFLICT DO NOTHING;

-- Devices under houston/crude1
INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT v.path, v.nm, 4, v.descr, p.id
FROM (VALUES
    ('houston/crude1/pump101', 'Feed Pump 101', 'Crude feed pump'),
    ('houston/crude1/tank01',  'Feed Tank 01',  'Crude feed tank'),
    ('houston/crude1/valve01', 'Feed Valve 01', 'Crude feed control valve'),
    ('houston/crude1/hx01',    'Heat Exchanger 01', 'Crude preheat exchanger')
) AS v(path, nm, descr)
JOIN assets.assets p ON p.contextual_path = 'houston/crude1'
ON CONFLICT DO NOTHING;

-- Measurements under houston devices
INSERT INTO assets.assets (contextual_path, name, asset_type, description, engineering_unit, lo_eng_limit, hi_eng_limit, parent_id)
SELECT v.path, v.nm, 5, v.descr, v.eu, v.lo, v.hi, p.id
FROM (VALUES
    ('houston/crude1/pump101.speed',          'Pump Speed',        'Pump shaft speed',        'RPM',  0,    3600),
    ('houston/crude1/pump101.discharge_press','Discharge Pressure','Pump discharge pressure', 'PSI',  0,    500),
    ('houston/crude1/pump101.motor_temp',     'Motor Temperature', 'Motor winding temp',      'degC', 0,    150),
    ('houston/crude1/pump101.current',        'Motor Current',     'Motor current draw',      'A',    0,    100),
    ('houston/crude1/pump101.running',        'Running',           'Pump run status',         'bool', 0,    1),
    ('houston/crude1/tank01.level',           'Tank Level',        'Feed tank level',         '%',    0,    100),
    ('houston/crude1/tank01.temperature',     'Tank Temperature',  'Feed tank temperature',   'degC', 0,    200),
    ('houston/crude1/valve01.position',       'Valve Position',    'Control valve position',  '%',    0,    100),
    ('houston/crude1/hx01.temp_in',           'HX Inlet Temp',     'Exchanger inlet temp',    'degC', 0,    300),
    ('houston/crude1/hx01.temp_out',          'HX Outlet Temp',    'Exchanger outlet temp',   'degC', 0,    300),
    ('houston/crude1/hx01.flow',              'HX Flow',           'Exchanger flow rate',     'm3/h', 0,    1000)
) AS v(path, nm, descr, eu, lo, hi)
JOIN assets.assets p ON p.contextual_path = substring(v.path from '^(.*)\.[^.]+$')
ON CONFLICT DO NOTHING;

-- ─── SITE: dallas (new) ──────────────────────────────────────────────────────
INSERT INTO assets.assets (contextual_path, name, asset_type, description)
VALUES ('dallas', 'Dallas Terminal', 1, 'Dallas storage & blending terminal')
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT 'dallas/blend1', 'Blending Unit 1', 3, 'Product blending unit 1', id
FROM assets.assets WHERE contextual_path = 'dallas' ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT v.path, v.nm, 4, v.descr, p.id
FROM (VALUES
    ('dallas/blend1/pump201', 'Transfer Pump 201', 'Product transfer pump'),
    ('dallas/blend1/tank02',  'Blend Tank 02',     'Product blend tank'),
    ('dallas/blend1/valve02', 'Blend Valve 02',    'Blend control valve'),
    ('dallas/blend1/hx02',    'Heat Exchanger 02', 'Product heat exchanger')
) AS v(path, nm, descr)
JOIN assets.assets p ON p.contextual_path = 'dallas/blend1'
ON CONFLICT DO NOTHING;

INSERT INTO assets.assets (contextual_path, name, asset_type, description, engineering_unit, lo_eng_limit, hi_eng_limit, parent_id)
SELECT v.path, v.nm, 5, v.descr, v.eu, v.lo, v.hi, p.id
FROM (VALUES
    ('dallas/blend1/pump201.speed',           'Pump Speed',        'Pump shaft speed',        'RPM',  0,    3600),
    ('dallas/blend1/pump201.discharge_press', 'Discharge Pressure','Pump discharge pressure', 'PSI',  0,    500),
    ('dallas/blend1/pump201.motor_temp',      'Motor Temperature', 'Motor winding temp',      'degC', 0,    150),
    ('dallas/blend1/pump201.current',         'Motor Current',     'Motor current draw',      'A',    0,    100),
    ('dallas/blend1/pump201.running',         'Running',           'Pump run status',         'bool', 0,    1),
    ('dallas/blend1/tank02.level',            'Tank Level',        'Blend tank level',        '%',    0,    100),
    ('dallas/blend1/tank02.temperature',      'Tank Temperature',  'Blend tank temperature',  'degC', 0,    200),
    ('dallas/blend1/valve02.position',        'Valve Position',    'Control valve position',  '%',    0,    100),
    ('dallas/blend1/hx02.temp_in',            'HX Inlet Temp',     'Exchanger inlet temp',    'degC', 0,    300),
    ('dallas/blend1/hx02.temp_out',           'HX Outlet Temp',    'Exchanger outlet temp',   'degC', 0,    300),
    ('dallas/blend1/hx02.flow',               'HX Flow',           'Exchanger flow rate',     'm3/h', 0,    1000)
) AS v(path, nm, descr, eu, lo, hi)
JOIN assets.assets p ON p.contextual_path = substring(v.path from '^(.*)\.[^.]+$')
ON CONFLICT DO NOTHING;

-- Report
DO $$
DECLARE n INTEGER;
BEGIN
    SELECT count(*) INTO n FROM assets.assets WHERE NOT is_deleted;
    RAISE NOTICE '2-site plant seed applied. Total active assets: %', n;
END $$;
