-- ============================================================
-- Phase 0: Create per-service databases for Traverse migration
-- Idempotent — safe to re-run
-- ============================================================

SELECT 'CREATE DATABASE traverse_assets OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_assets')\gexec

SELECT 'CREATE DATABASE traverse_templates OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_templates')\gexec

SELECT 'CREATE DATABASE traverse_analysis OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_analysis')\gexec

SELECT 'CREATE DATABASE traverse_displays OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_displays')\gexec

SELECT 'CREATE DATABASE traverse_shared OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_shared')\gexec

DO $$ BEGIN RAISE NOTICE 'Traverse databases ready'; END $$;
