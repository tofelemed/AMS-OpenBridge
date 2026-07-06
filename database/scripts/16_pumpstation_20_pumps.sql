-- ═══════════════════════════════════════════════════════════════════════════
-- Phase E: 20 pumps under houston/pumpstation for the asset-relative swap demo.
-- Additive + idempotent. Each pump carries speed/discharge_press/motor_temp/current/running.
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_assets

-- Unit
INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT 'houston/pumpstation', 'Pump Station', 3, 'Transfer pump station', id
FROM assets.assets WHERE contextual_path = 'houston'
ON CONFLICT DO NOTHING;

-- 20 pump devices: pump01 .. pump20
INSERT INTO assets.assets (contextual_path, name, asset_type, description, parent_id)
SELECT 'houston/pumpstation/pump' || lpad(g::text, 2, '0'),
       'Pump ' || lpad(g::text, 2, '0'), 4, 'Station transfer pump', p.id
FROM generate_series(1, 20) g
JOIN assets.assets p ON p.contextual_path = 'houston/pumpstation'
ON CONFLICT DO NOTHING;

-- Measurements per pump
INSERT INTO assets.assets (contextual_path, name, asset_type, description, engineering_unit, lo_eng_limit, hi_eng_limit, parent_id)
SELECT 'houston/pumpstation/pump' || lpad(g::text, 2, '0') || '.' || m.metric,
       m.nm, 5, m.nm, m.eu, m.lo, m.hi, d.id
FROM generate_series(1, 20) g
CROSS JOIN (VALUES
    ('speed',           'Pump Speed',        'RPM',  0::float8, 3600::float8),
    ('discharge_press', 'Discharge Pressure','PSI',  0,         500),
    ('motor_temp',      'Motor Temperature', 'degC', 0,         150),
    ('current',         'Motor Current',     'A',    0,         100),
    ('running',         'Running',           'bool', 0,         1)
) AS m(metric, nm, eu, lo, hi)
JOIN assets.assets d ON d.contextual_path = 'houston/pumpstation/pump' || lpad(g::text, 2, '0')
ON CONFLICT DO NOTHING;

DO $$
DECLARE n INTEGER;
BEGIN
    SELECT count(*) INTO n FROM assets.assets WHERE contextual_path LIKE 'houston/pumpstation/pump%' AND asset_type = 4;
    RAISE NOTICE 'pumpstation pumps: %', n;
END $$;
