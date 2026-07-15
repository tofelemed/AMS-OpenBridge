-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 (V2): audit-service database
-- Creates the traverse_audit database. audit-service uses EF EnsureCreated() at startup to build its
-- immutable hash-chained AuditEvents table, so this only needs to guarantee the database exists.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'CREATE DATABASE traverse_audit OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_audit')\gexec

\c traverse_audit
GRANT ALL ON SCHEMA public TO ams_user;

DO $$ BEGIN RAISE NOTICE 'traverse_audit database ready (tables created by audit-service EnsureCreated)'; END $$;
