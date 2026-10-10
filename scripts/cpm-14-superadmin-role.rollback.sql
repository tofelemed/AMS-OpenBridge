-- cpm-14 rollback (CHG-081, target: traverse_auth): Admin gets the platform-administration keys back.
-- Engineer / Supervisor grants are NOT restored (re-run cpm-08-v25-permissions.sql for those).
-- The SuperAdmin role and user stay (harmless to the previous build, which only knows Admin as elevated).
--   docker exec -i <postgres> psql -U <user> -d traverse_auth -1 -v ON_ERROR_STOP=1 < ops/cpm-14-superadmin-role.rollback.sql
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;
SELECT 'cpm-14 rollback OK' AS result, COUNT(*) AS admin_keys FROM role_permissions WHERE role_name = 'Admin';
