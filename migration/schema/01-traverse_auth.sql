-- target: traverse_auth
-- DDL only. Roles/permissions/users: migration/sql/03-auth-rbac.sql (Phase 4).
-- Folded in: 17_traverse_auth_schema.sql + 38 (timestamptz, revocation) + 41 (session clocks).
-- Applied with: psql -d traverse_auth -v ON_ERROR_STOP=1 -f this file
-- No CREATE DATABASE, no \c.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
    role_name      VARCHAR(50) PRIMARY KEY,
    description    VARCHAR(500),
    is_system_role BOOLEAN     DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    permission_key VARCHAR(100) PRIMARY KEY,
    description    VARCHAR(500),
    category       VARCHAR(50),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_name      VARCHAR(50)  NOT NULL REFERENCES roles(role_name) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (role_name, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_name);

CREATE TABLE IF NOT EXISTS users (
    user_id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username                VARCHAR(100) UNIQUE NOT NULL,
    email                   VARCHAR(255) UNIQUE NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,
    full_name               VARCHAR(200),
    role                    VARCHAR(50)  NOT NULL DEFAULT 'Viewer' REFERENCES roles(role_name),
    is_active               BOOLEAN      DEFAULT TRUE,
    created_at              TIMESTAMPTZ  DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  DEFAULT NOW(),
    credentials_changed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token              VARCHAR(2000) UNIQUE NOT NULL,
    expires_at         TIMESTAMPTZ  NOT NULL,
    created_at         TIMESTAMPTZ  DEFAULT NOW(),
    last_used_at       TIMESTAMPTZ,
    session_started_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO ams_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ams_user;
    END IF;
END $$;
