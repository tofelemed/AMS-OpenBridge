-- target: traverse_auth
-- Seed only (Phase 4 / 03-seed.sh). No \c.
-- Order matches lab init: 17_ roles+base perms+matrix, 33_ CPM, 37_ HMI catalog, 47_ ingestion.
-- No users here — 03-seed.sh inserts Admin from BOOTSTRAP_ADMIN_* (bcrypt).

INSERT INTO roles (role_name, description, is_system_role) VALUES
    ('Admin',    'System Administrator - full access',            TRUE),
    ('Engineer', 'Engineer - operate + configure, no user admin', TRUE),
    ('Operator', 'Operator - alarm operations',                   TRUE),
    ('Viewer',   'Viewer - read-only access',                     TRUE)
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO permissions (permission_key, description, category) VALUES
    ('alarm.view',              'View active alarms',          'alarm'),
    ('alarm.acknowledge',       'Acknowledge an alarm',        'alarm'),
    ('alarm.acknowledge_batch', 'Acknowledge alarms in batch', 'alarm'),
    ('alarm.shelve',            'Shelve an alarm',             'alarm'),
    ('alarm.unshelve',          'Unshelve an alarm',           'alarm'),
    ('alarm.suppress',          'Suppress an alarm',           'alarm'),
    ('alarm.export',            'Export alarm data',           'alarm'),
    ('soe.view',                'View sequence of events',     'soe'),
    ('analytics.view',          'View analytics / KPIs',       'analytics'),
    ('admin.users.edit',        'Create/edit/delete users',    'admin'),
    ('admin.audit.view',        'View audit log',              'admin')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Engineer', permission_key FROM permissions
WHERE category = 'alarm' OR permission_key IN ('soe.view', 'analytics.view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Operator', permission_key FROM permissions
WHERE permission_key IN (
    'alarm.view', 'alarm.acknowledge', 'alarm.acknowledge_batch',
    'alarm.shelve', 'alarm.unshelve', 'soe.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Viewer', permission_key FROM permissions
WHERE permission_key IN ('alarm.view', 'soe.view', 'analytics.view')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (permission_key, description, category) VALUES
    ('cpm.manage',    'Onboard and configure control loops (CPLM)', 'cpm'),
    ('system.manage', 'Manage pipeline jobs and OPC connections',   'admin')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Engineer', 'cpm.manage'
ON CONFLICT DO NOTHING;

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

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Viewer', k FROM (VALUES
    ('alarm.view'), ('soe.view'), ('analytics.view'),
    ('display.view'), ('template.view'), ('asset.view'),
    ('binding.resolve'), ('historian.view'), ('analysis.view')
) AS v(k)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Operator', k FROM (VALUES
    ('alarm.view'), ('soe.view'), ('analytics.view'),
    ('display.view'), ('template.view'), ('asset.view'),
    ('binding.resolve'), ('historian.view'), ('analysis.view'),
    ('alarm.acknowledge'), ('alarm.acknowledge_batch'),
    ('alarm.shelve'), ('alarm.unshelve'), ('alarm.export')
) AS v(k)
ON CONFLICT DO NOTHING;

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

INSERT INTO permissions (permission_key, description, category) VALUES
    ('ingestion.view',   'View OT data-source configurations',             'ingestion'),
    ('ingestion.manage', 'Create/edit/test OT data-source configurations', 'ingestion')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;
