-- ═══════════════════════════════════════════════════════════════════════════
-- Auth Service Database Schema
-- Creates the traverse_auth database for the standalone Node/Express auth service.
-- Runs on PostgreSQL init (docker-entrypoint-initdb.d).
-- Mirrors src/services/auth-service/database/schema.sql (kept in sync).
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the database (only if it doesn't exist)
SELECT 'CREATE DATABASE traverse_auth OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_auth')\gexec

-- Connect to traverse_auth database
\c traverse_auth

-- ── roles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    role_name VARCHAR(50) PRIMARY KEY,
    description VARCHAR(500),
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── permissions (functional catalog; keys mirror the .NET policies) ─────────
CREATE TABLE IF NOT EXISTS permissions (
    permission_key VARCHAR(100) PRIMARY KEY,
    description VARCHAR(500),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── role_permissions (many-to-many) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    role_name VARCHAR(50) NOT NULL REFERENCES roles(role_name) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_name, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_name);

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200),
    role VARCHAR(50) NOT NULL DEFAULT 'Viewer' REFERENCES roles(role_name),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- ── refresh_tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token VARCHAR(2000) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ── seed: roles ─────────────────────────────────────────────────────────────
INSERT INTO roles (role_name, description, is_system_role) VALUES
    ('Admin',    'System Administrator - full access',            TRUE),
    ('Engineer', 'Engineer - operate + configure, no user admin', TRUE),
    ('Operator', 'Operator - alarm operations',                   TRUE),
    ('Viewer',   'Viewer - read-only access',                     TRUE)
ON CONFLICT (role_name) DO NOTHING;

-- ── seed: functional permission catalog ─────────────────────────────────────
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

-- ── seed: default role -> permission mapping ────────────────────────────────
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

-- No seed users. Create the first admin with `npm run seed:admin`
-- (or: docker compose exec auth-service node dist/database/seed-admin.js).
