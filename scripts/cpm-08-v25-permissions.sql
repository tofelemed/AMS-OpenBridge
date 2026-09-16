-- ═══════════════════════════════════════════════════════════════════════════
-- 59_cpm_v25_permissions.sql — CPA v2.5 permission keys (spec v6 §6.5 API operations)
--
-- 17_traverse_auth_schema.sql grants Admin every row in `permissions`, so new keys reach
-- Admin automatically. Engineer keeps an explicit allow-list (extended here); approval,
-- activation and rollback are deliberately NOT granted to Engineer - the site assigns them
-- (Supervisor when that role exists, else Admin only). Idempotent.
-- Ops copy: scripts/cpm-08-v25-permissions.sql (no \c; run against traverse_auth).
-- ═══════════════════════════════════════════════════════════════════════════

-- (ops copy: run against traverse_auth: docker exec -i ams-postgres psql -U ams_user -d traverse_auth -v ON_ERROR_STOP=1 < ops/cpm-08-v25-permissions.sql)

INSERT INTO permissions (permission_key, description, category) VALUES
    ('cpm.analysis.create', 'Start a bounded analysis run (replay, shadow, evidence reconstruction)', 'cpm'),
    ('cpm.model.review',    'Review a system-response model (validate, reject, promote, expire)',    'cpm'),
    ('cpm.context.manage',  'Maintain analysis context: instrument bindings, controller snapshots',  'cpm'),
    ('cpm.config.read',     'Read the effective gate configuration and its provenance',               'cpm'),
    ('cpm.config.draft',    'Create and edit gate-configuration drafts',                              'cpm'),
    ('cpm.config.validate', 'Validate a gate-configuration draft',                                    'cpm'),
    ('cpm.config.shadow',   'Run a shadow evaluation of a gate-configuration draft',                  'cpm'),
    ('cpm.config.approve',  'Approve a validated gate-configuration bundle',                          'cpm'),
    ('cpm.config.activate', 'Activate an approved gate-configuration bundle',                         'cpm'),
    ('cpm.config.rollback', 'Roll back to the previously active gate-configuration bundle',           'cpm')
ON CONFLICT (permission_key) DO NOTHING;

-- Admin: catch-all re-run so an already-seeded Admin picks up the new keys.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

-- Engineer: analysis, context, and the pre-approval half of the configuration lifecycle.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Engineer', k FROM (VALUES
    ('cpm.analysis.create'), ('cpm.context.manage'),
    ('cpm.config.read'), ('cpm.config.draft'), ('cpm.config.validate'), ('cpm.config.shadow')
) AS v(k)
ON CONFLICT DO NOTHING;

-- Supervisor (only where the site defined that role): approval.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Supervisor', k FROM (VALUES ('cpm.config.read'), ('cpm.config.approve'), ('cpm.model.review')) AS v(k)
WHERE EXISTS (SELECT 1 FROM roles WHERE role_name = 'Supervisor')
ON CONFLICT DO NOTHING;
