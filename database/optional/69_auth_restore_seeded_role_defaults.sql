-- ═══════════════════════════════════════════════════════════════════════════
-- 69_auth_restore_seeded_role_defaults.sql — CHG-171 repair (target: traverse_auth)
--
-- *** OPTIONAL. DO NOT RUN IN PRODUCTION WITHOUT THE PRODUCT OWNER'S APPROVAL. ***
--
-- Why: before CHG-171, "Reset to default" on the Roles page reset a system role to the code
-- catalog, which lacked the ten cpm.* keys of 59_cpm_v25_permissions.sql. A role reset that way
-- lost keys the seeds grant (lab, 4 Nov 2026: Engineer lost cpm.analysis.create and
-- cpm.context.manage; a reset SuperAdmin loses the seven cpm.config.* gate-configuration keys
-- until the next auth-service restart re-grants them).
--
-- What it does: re-grants every SEEDED DEFAULT key that a system role (SuperAdmin, Admin,
-- Engineer, Operator, Viewer) is missing. ADDITIVE ONLY: it removes nothing, never touches a
-- custom role, and creates no role and no key (a role or key missing from the database is
-- skipped). A default key an administrator removed ON PURPOSE comes back too, so read the
-- preview first.
-- The list is the catalog's default matrix in the CHG-081 world
-- (src/services/auth-service/src/rbac/permission-catalog.ts); the auth-service test
-- tests/seed-defaults.test.ts proves it equals the catalog and every seed script.
--
-- Sessions: nobody is signed out. A user picks up a re-granted key at their next token refresh
-- (within the access-token lifetime, 1 h) or next sign-in.
--
-- Run (one transaction, idempotent: a second run grants nothing):
--   docker exec -i <postgres> psql -U postgres -v ON_ERROR_STOP=1 < 69_auth_restore_seeded_role_defaults.sql
-- The first result is the preview (role, number of keys, the keys); the last line reads
-- "CHG-171 repair OK | <grants added> | <roles>". To preview only, change the final COMMIT to ROLLBACK.
-- Kept in database/optional/, outside database/scripts/ (the folder docker-entrypoint-initdb.d and a
-- release run apply in order), so it never runs by itself; run it by hand, once approved. On a fresh
-- database it would add nothing: the seeds have already granted all of it.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_auth

BEGIN;

CREATE TEMP TABLE chg171_defaults (
    role_name      VARCHAR(50)  NOT NULL,
    permission_key VARCHAR(100) NOT NULL
) ON COMMIT DROP;

INSERT INTO chg171_defaults (role_name, permission_key) VALUES
    ('SuperAdmin', 'admin.audit.view'),
    ('SuperAdmin', 'admin.users.edit'),
    ('SuperAdmin', 'alarm.acknowledge'),
    ('SuperAdmin', 'alarm.acknowledge_batch'),
    ('SuperAdmin', 'alarm.export'),
    ('SuperAdmin', 'alarm.shelve'),
    ('SuperAdmin', 'alarm.suppress'),
    ('SuperAdmin', 'alarm.unshelve'),
    ('SuperAdmin', 'alarm.view'),
    ('SuperAdmin', 'analysis.edit'),
    ('SuperAdmin', 'analysis.view'),
    ('SuperAdmin', 'analytics.view'),
    ('SuperAdmin', 'asset.edit'),
    ('SuperAdmin', 'asset.view'),
    ('SuperAdmin', 'binding.resolve'),
    ('SuperAdmin', 'cpm.analysis.create'),
    ('SuperAdmin', 'cpm.config.activate'),
    ('SuperAdmin', 'cpm.config.approve'),
    ('SuperAdmin', 'cpm.config.draft'),
    ('SuperAdmin', 'cpm.config.read'),
    ('SuperAdmin', 'cpm.config.rollback'),
    ('SuperAdmin', 'cpm.config.shadow'),
    ('SuperAdmin', 'cpm.config.validate'),
    ('SuperAdmin', 'cpm.context.manage'),
    ('SuperAdmin', 'cpm.manage'),
    ('SuperAdmin', 'cpm.model.review'),
    ('SuperAdmin', 'display.edit'),
    ('SuperAdmin', 'display.publish'),
    ('SuperAdmin', 'display.view'),
    ('SuperAdmin', 'historian.view'),
    ('SuperAdmin', 'ingestion.manage'),
    ('SuperAdmin', 'ingestion.view'),
    ('SuperAdmin', 'rbac.manage'),
    ('SuperAdmin', 'soe.view'),
    ('SuperAdmin', 'system.manage'),
    ('SuperAdmin', 'template.edit'),
    ('SuperAdmin', 'template.publish'),
    ('SuperAdmin', 'template.view'),
    ('Admin',      'alarm.acknowledge'),
    ('Admin',      'alarm.acknowledge_batch'),
    ('Admin',      'alarm.export'),
    ('Admin',      'alarm.shelve'),
    ('Admin',      'alarm.suppress'),
    ('Admin',      'alarm.unshelve'),
    ('Admin',      'alarm.view'),
    ('Admin',      'analysis.edit'),
    ('Admin',      'analysis.view'),
    ('Admin',      'analytics.view'),
    ('Admin',      'asset.edit'),
    ('Admin',      'asset.view'),
    ('Admin',      'binding.resolve'),
    ('Admin',      'cpm.analysis.create'),
    ('Admin',      'cpm.context.manage'),
    ('Admin',      'cpm.manage'),
    ('Admin',      'cpm.model.review'),
    ('Admin',      'display.edit'),
    ('Admin',      'display.publish'),
    ('Admin',      'display.view'),
    ('Admin',      'historian.view'),
    ('Admin',      'soe.view'),
    ('Admin',      'template.edit'),
    ('Admin',      'template.publish'),
    ('Admin',      'template.view'),
    ('Engineer',   'alarm.acknowledge'),
    ('Engineer',   'alarm.acknowledge_batch'),
    ('Engineer',   'alarm.export'),
    ('Engineer',   'alarm.shelve'),
    ('Engineer',   'alarm.suppress'),
    ('Engineer',   'alarm.unshelve'),
    ('Engineer',   'alarm.view'),
    ('Engineer',   'analysis.edit'),
    ('Engineer',   'analysis.view'),
    ('Engineer',   'analytics.view'),
    ('Engineer',   'asset.edit'),
    ('Engineer',   'asset.view'),
    ('Engineer',   'binding.resolve'),
    ('Engineer',   'cpm.analysis.create'),
    ('Engineer',   'cpm.context.manage'),
    ('Engineer',   'cpm.manage'),
    ('Engineer',   'display.edit'),
    ('Engineer',   'display.publish'),
    ('Engineer',   'display.view'),
    ('Engineer',   'historian.view'),
    ('Engineer',   'soe.view'),
    ('Engineer',   'template.edit'),
    ('Engineer',   'template.publish'),
    ('Engineer',   'template.view'),
    ('Operator',   'alarm.acknowledge'),
    ('Operator',   'alarm.acknowledge_batch'),
    ('Operator',   'alarm.export'),
    ('Operator',   'alarm.shelve'),
    ('Operator',   'alarm.unshelve'),
    ('Operator',   'alarm.view'),
    ('Operator',   'analysis.view'),
    ('Operator',   'analytics.view'),
    ('Operator',   'asset.view'),
    ('Operator',   'binding.resolve'),
    ('Operator',   'display.view'),
    ('Operator',   'historian.view'),
    ('Operator',   'soe.view'),
    ('Operator',   'template.view'),
    ('Viewer',     'alarm.view'),
    ('Viewer',     'analysis.view'),
    ('Viewer',     'analytics.view'),
    ('Viewer',     'asset.view'),
    ('Viewer',     'binding.resolve'),
    ('Viewer',     'display.view'),
    ('Viewer',     'historian.view'),
    ('Viewer',     'soe.view'),
    ('Viewer',     'template.view');

CREATE TEMP TABLE chg171_missing ON COMMIT DROP AS
SELECT d.role_name, d.permission_key
FROM chg171_defaults d
JOIN roles r       ON r.role_name = d.role_name AND r.is_system_role
JOIN permissions p ON p.permission_key = d.permission_key
WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp
                  WHERE rp.role_name = d.role_name AND rp.permission_key = d.permission_key);

-- Preview: what this run grants, per role.
SELECT role_name, COUNT(*) AS keys_to_grant, string_agg(permission_key, ', ' ORDER BY permission_key) AS keys
FROM chg171_missing
GROUP BY role_name
ORDER BY role_name;

INSERT INTO role_permissions (role_name, permission_key)
SELECT role_name, permission_key FROM chg171_missing
ON CONFLICT DO NOTHING;

SELECT 'CHG-171 repair OK' AS result,
       (SELECT COUNT(*) FROM chg171_missing) AS grants_added,
       (SELECT COALESCE(string_agg(DISTINCT role_name, ', '), 'none') FROM chg171_missing) AS roles_repaired;

COMMIT;
