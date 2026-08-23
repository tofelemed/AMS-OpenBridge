-- ═══════════════════════════════════════════════════════════════════════════
-- 45_traverse_ingestion_db.sql — ingestion-service logical database
--
-- OT data-source configuration (MQTT broker connections, credentials) per the
-- one-database-per-service rule (CLAUDE.md). Runs before 46, which \c into it.
-- 47_ingestion_permissions.sql stays on traverse_auth.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'CREATE DATABASE traverse_ingestion OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_ingestion')\gexec

\c traverse_ingestion
GRANT ALL ON SCHEMA public TO ams_user;

DO $$ BEGIN RAISE NOTICE 'traverse_ingestion database ready (schema created by 46)'; END $$;
