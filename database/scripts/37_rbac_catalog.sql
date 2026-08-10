-- ═══════════════════════════════════════════════════════════════════════════
-- 37_rbac_catalog.sql — complete the RBAC permission catalog + role matrix
--   (Full-RBAC build, Phase 1)
--
-- The catalog seeded by 17_traverse_auth_schema.sql + 33_cpm_permissions.sql
-- covered only the alarm/CPM domain (13 keys). The HMI surface — assets,
-- bindings, historian, displays, templates, analysis — is enforced by the
-- services but was NOT in the catalog, so those 12 keys could not be granted to
-- any role except Admin (which gets a catch-all). Non-admin roles were therefore
-- alarm-only and unfixable through the RBAC UI.
--
-- This adds the 12 missing keys + rbac.manage, and ADDITIVELY grants the
-- ISA-18.2 / ISA-101 role matrix to the four system roles. Additive
-- (ON CONFLICT DO NOTHING) so an existing custom mapping is never clobbered;
-- full realignment is the admin "reset to default" action (Phase 2).
--
-- Canonical source: src/services/auth-service/src/rbac/permission-catalog.ts.
-- Kept in sync with auth-service/database/schema.sql; the CI guard
-- (scripts/verify-permission-catalog.mjs) fails the build if they diverge.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_auth

-- ── new permission keys (the 12 missing HMI keys + rbac.manage) ─────────────
INSERT INTO permissions (permission_key, description, category) VALUES
    ('display.view',     'View displays and personal views',   'display'),
    ('display.edit',     'Create/edit controlled displays',    'display'),
    ('display.publish',  'Publish controlled displays',        'display'),
    ('template.view',    'View templates',                     'template'),
    ('template.edit',    'Create/edit templates',              'template'),
    ('template.publish', 'Publish templates',                  'template'),
    ('asset.view',       'View the UNS asset model',           'asset'),
    ('asset.edit',       'Create/edit UNS assets',             'asset'),
    ('binding.resolve',  'Resolve path+role bindings',         'binding'),
    ('historian.view',   'View historian trends and raw data', 'historian'),
    ('analysis.view',    'View analyses',                      'analysis'),
    ('analysis.edit',    'Create/edit analyses',              'analysis'),
    ('rbac.manage',      'Manage roles and their permissions', 'admin')
ON CONFLICT (permission_key) DO NOTHING;

-- ── role matrix (additive) ──────────────────────────────────────────────────
-- Admin: catch-all so any current/future key reaches Admin.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

-- Viewer: full read across the whole product (incl. binding.resolve + historian.view,
-- without which a read-only HMI cannot render live values or open a trend).
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Viewer', k FROM (VALUES
    ('alarm.view'), ('soe.view'), ('analytics.view'),
    ('display.view'), ('template.view'), ('asset.view'),
    ('binding.resolve'), ('historian.view'), ('analysis.view')
) AS v(k)
ON CONFLICT DO NOTHING;

-- Operator: Viewer + ISA-18.2 operator RESPONSE actions (ack/shelve/export).
-- No alarm.suppress (suppression-by-design is engineering), no config edits.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Operator', k FROM (VALUES
    ('alarm.view'), ('soe.view'), ('analytics.view'),
    ('display.view'), ('template.view'), ('asset.view'),
    ('binding.resolve'), ('historian.view'), ('analysis.view'),
    ('alarm.acknowledge'), ('alarm.acknowledge_batch'),
    ('alarm.shelve'), ('alarm.unshelve'), ('alarm.export')
) AS v(k)
ON CONFLICT DO NOTHING;

-- Engineer: Operator + all CONFIGURATION (displays/templates/assets/analysis,
-- CPM onboarding, alarm suppression). No user/role admin, no system.manage.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Engineer', k FROM (VALUES
    ('alarm.view'), ('soe.view'), ('analytics.view'),
    ('display.view'), ('template.view'), ('asset.view'),
    ('binding.resolve'), ('historian.view'), ('analysis.view'),
    ('alarm.acknowledge'), ('alarm.acknowledge_batch'),
    ('alarm.shelve'), ('alarm.unshelve'), ('alarm.export'),
    ('alarm.suppress'),
    ('display.edit'), ('display.publish'),
    ('template.edit'), ('template.publish'),
    ('asset.edit'), ('analysis.edit'), ('cpm.manage')
) AS v(k)
ON CONFLICT DO NOTHING;

-- Admin only (already covered by the catch-all above, listed for clarity):
--   system.manage, admin.users.edit, admin.audit.view, rbac.manage
