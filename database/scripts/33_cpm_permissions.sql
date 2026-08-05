-- ═══════════════════════════════════════════════════════════════════════════
-- 33_cpm_permissions.sql — permission keys for CPLM onboarding and system ops
--
-- 17_traverse_auth_schema.sql grants Admin every row in `permissions`
-- (SELECT * FROM permissions), so new keys reach Admin automatically. Engineer
-- and Operator have explicit allow-lists and must be extended by hand.
--
-- Idempotent: safe to re-run on an existing auth database.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_auth

INSERT INTO permissions (permission_key, description, category) VALUES
    -- Onboarding decides which loops the diagnosis engine evaluates and what
    -- operators are told about their plant, so it is a configuration right,
    -- not an analytics one.
    ('cpm.manage',    'Onboard and configure control loops (CPLM)', 'cpm'),
    -- Guards the two endpoints that were reachable anonymously: Flink replay
    -- submission and OPC/DCS connection lifecycle.
    ('system.manage', 'Manage pipeline jobs and OPC connections',   'admin')
ON CONFLICT (permission_key) DO NOTHING;

-- Admin: catch-all re-run so an already-seeded Admin picks up the new keys.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

-- Engineer configures loops but does not manage OPC servers or submit jobs.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Engineer', 'cpm.manage'
ON CONFLICT DO NOTHING;
