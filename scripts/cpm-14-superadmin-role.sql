-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-14-superadmin-role.sql — CHG-081: a SuperAdmin role above Admin (target: traverse_auth)
--
-- SuperAdmin holds every permission. It ALONE keeps the platform-administration side:
--   Gate Configuration (cpm.config.*), Administration (admin.users.edit, admin.audit.view,
--   rbac.manage, ingestion.view, ingestion.manage), Pipeline Health and Governance (system.manage).
-- Every other role (Admin, Engineer, Supervisor, any custom role) loses those keys.
--
-- Lockout guard: the SuperAdmin user is created FIRST, from psql variables (no password in the
-- repo), and the script aborts before revoking anything unless an active SuperAdmin user exists.
--
-- Run (one transaction; idempotent — a re-run keeps the existing user and its password):
--   docker exec -i <postgres> psql -U <user> -d traverse_auth -1 -v ON_ERROR_STOP=1 \
--     -v su_username=superadmin -v su_email=superadmin@local -v su_password='<secret>' \
--     < ops/cpm-14-superadmin-role.sql
-- The password is hashed here with pgcrypto bcrypt ($2a$, cost 10), which auth-service's bcrypt
-- verifies. Change it after the first login if it was typed on a shared console.
--
-- Effect on sessions: every user of a role that lost a key has credentials_changed_at bumped, so
-- their sessions end and the next login carries the reduced permission set.
-- Rollback: scripts/cpm-14-superadmin-role.rollback.sql (re-grants the keys to Admin).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. The role, with every permission (new keys added later reach it via the same statement on re-run).
INSERT INTO roles (role_name, description, is_system_role)
VALUES ('SuperAdmin', 'Super Administrator - platform administration, gate configuration, pipeline and governance', TRUE)
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description, is_system_role = TRUE;

INSERT INTO role_permissions (role_name, permission_key)
SELECT 'SuperAdmin', permission_key FROM permissions
ON CONFLICT DO NOTHING;

-- 2. The SuperAdmin user (kept as-is when it already exists).
INSERT INTO users (username, email, password_hash, full_name, role, is_active)
SELECT :'su_username', :'su_email', crypt(:'su_password', gen_salt('bf', 10)), 'Super Administrator', 'SuperAdmin', TRUE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = :'su_username' OR email = :'su_email');

UPDATE users SET role = 'SuperAdmin', is_active = TRUE, updated_at = NOW()
WHERE username = :'su_username' AND role <> 'SuperAdmin';

-- 3. Lockout guard: nothing is revoked unless an active SuperAdmin can log in.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'SuperAdmin' AND is_active) THEN
        RAISE EXCEPTION 'cpm-14: no active SuperAdmin user - pass -v su_username / su_email / su_password; nothing was revoked';
    END IF;
END $$;

-- 4. The SuperAdmin-only keys leave every other role. Sessions of the affected users end.
CREATE TEMP TABLE cpm14_revoked ON COMMIT DROP AS
SELECT role_name, permission_key FROM role_permissions
WHERE role_name <> 'SuperAdmin'
  AND (permission_key LIKE 'cpm.config.%'
       OR permission_key IN ('admin.users.edit', 'admin.audit.view', 'rbac.manage',
                             'ingestion.view', 'ingestion.manage', 'system.manage'));

DELETE FROM role_permissions rp USING cpm14_revoked r
WHERE rp.role_name = r.role_name AND rp.permission_key = r.permission_key;

UPDATE users SET credentials_changed_at = NOW()
WHERE role IN (SELECT DISTINCT role_name FROM cpm14_revoked);

-- 5. Proof.
SELECT 'cpm-14 OK' AS result,
       (SELECT COUNT(*) FROM users WHERE role = 'SuperAdmin' AND is_active) AS superadmin_users,
       (SELECT COUNT(*) FROM role_permissions WHERE role_name = 'SuperAdmin') AS superadmin_keys,
       (SELECT COUNT(*) FROM cpm14_revoked) AS grants_revoked,
       (SELECT string_agg(DISTINCT role_name, ', ') FROM cpm14_revoked) AS roles_reduced;
