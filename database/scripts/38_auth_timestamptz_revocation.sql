-- ═══════════════════════════════════════════════════════════════════════════
-- 38_auth_timestamptz_revocation.sql — Full-RBAC build, Phase 3
--
-- Two hardening changes to traverse_auth:
--
--  1. TIMESTAMPTZ (DATA-12). traverse_auth is the only schema that stored naive
--     TIMESTAMP; token expiry and audit timing must be timezone-correct.
--
--  2. Token revocation epoch. users.credentials_changed_at is bumped whenever a
--     user's effective permissions change (role change, deactivation, password
--     change) or a role they hold is re-permissioned. verifyToken rejects any
--     access token whose iat predates it, so a permission/role change takes
--     effect immediately for anything that validates through auth-service
--     (its own admin routes today; the API gateway in Plan 04). Refresh tokens
--     for affected users are also deleted on change, so they cannot mint a fresh
--     token with stale permissions.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_auth

-- ── 1. naive TIMESTAMP → TIMESTAMPTZ (interpret existing values as UTC) ──────
ALTER TABLE roles            ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';
ALTER TABLE permissions      ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';
ALTER TABLE role_permissions ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';
ALTER TABLE users            ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';
ALTER TABLE users            ALTER COLUMN updated_at  TYPE TIMESTAMPTZ USING updated_at  AT TIME ZONE 'UTC';
ALTER TABLE refresh_tokens   ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';
ALTER TABLE refresh_tokens   ALTER COLUMN expires_at  TYPE TIMESTAMPTZ USING expires_at  AT TIME ZONE 'UTC';

-- ── 2. revocation epoch ─────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS credentials_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
