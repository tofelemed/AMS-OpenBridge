-- ═══════════════════════════════════════════════════════════════════════════
-- 29_traverse_cplm_db.sql — CPLM logical database (extraction plan Phase 1)
--
-- CPLM/CPM data moved out of `ams` into its own logical database per the
-- one-database-per-service rule (CLAUDE.md). Runs before 30/32/34, which
-- \c into it. 33_cpm_permissions.sql stays on traverse_auth.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'CREATE DATABASE traverse_cplm OWNER ams_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'traverse_cplm')\gexec

\c traverse_cplm
GRANT ALL ON SCHEMA public TO ams_user;

DO $$ BEGIN RAISE NOTICE 'traverse_cplm database ready (schemas created by 30/32/34)'; END $$;
