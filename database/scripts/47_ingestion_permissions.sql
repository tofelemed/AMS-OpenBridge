-- ═══════════════════════════════════════════════════════════════════════════
-- 47_ingestion_permissions.sql — permission keys for OT data-source config
--
-- ingestion.view / ingestion.manage gate the ingestion-service endpoints
-- (/api/ingestion/data-sources). ADMIN-ONLY by decision (2026-08-22): broker
-- endpoints and credentials are connectivity internals — Engineer/Operator/
-- Viewer get nothing. Admin receives both via the catch-all re-run below.
--
-- Canonical catalog: src/services/auth-service/src/rbac/permission-catalog.ts
-- (CI guard: scripts/verify-permission-catalog.mjs).
--
-- Idempotent: safe to re-run on an existing auth database.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_auth

INSERT INTO permissions (permission_key, description, category) VALUES
    ('ingestion.view',   'View OT data-source configurations',             'ingestion'),
    ('ingestion.manage', 'Create/edit/test OT data-source configurations', 'ingestion')
ON CONFLICT (permission_key) DO NOTHING;

-- Admin: catch-all re-run so an already-seeded Admin picks up the new keys.
INSERT INTO role_permissions (role_name, permission_key)
SELECT 'Admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;
